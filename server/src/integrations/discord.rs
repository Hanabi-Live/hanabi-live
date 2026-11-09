use crate::transport::Outgoing;
use crate::{
    accounts::{escape_html, normalize_chat},
    lobby::{self, Effect},
    web::{self, App},
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt, future::BoxFuture};
use reqwest::Method;
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{
    collections::{HashMap, HashSet},
    fmt::Write as _,
    ops::RangeInclusive,
    sync::{
        Arc, Weak,
        atomic::{AtomicBool, AtomicU8, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, Semaphore, mpsc};
use tokio_util::sync::CancellationToken;

const RESTART_PREFIX: &str = "The server went down for a restart at:";
const STOP_PREFIX: &str = "The server is stopping gracefully at:";
/// The digits in a Discord identifier (a snowflake).
const SNOWFLAKE_DIGITS: RangeInclusive<usize> = 17..=20;
/// The largest Discord HTTP response or gateway message we accept, in bytes.
const MAX_PAYLOAD_BYTES: usize = crate::MIB;
/// The Discord API version that both the REST requests and the gateway connection use.
macro_rules! discord_api_version {
    () => {
        "10"
    };
}
const GATEWAY_URL: &str = concat!(
    "wss://gateway.discord.gg/?v=",
    discord_api_version!(),
    "&encoding=json"
);
const DISCORD_API: &str = concat!("https://discord.com/api/v", discord_api_version!());
/// Discord requires bots to identify themselves with their URL and version.
const DISCORD_USER_AGENT: &str = "DiscordBot (https://github.com/Hanabi-Live/hanabi-live, 1)";
/// How long a Discord HTTP request may take.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
/// The most Discord HTTP requests in flight at once.
const MAX_CONCURRENT_REQUESTS: usize = 4;
/// How long the gateway may take to send its greeting.
const HELLO_TIMEOUT: Duration = Duration::from_secs(20);
/// How long closing the gateway connection may take during shutdown.
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);
/// How long to wait before reconnecting to the gateway.
const RECONNECT_DELAY: Duration = Duration::from_secs(5);
/// The gateway events queued before the gateway reader waits.
const EVENT_QUEUE: usize = 1000;
/// The gateway heartbeat intervals we accept.
const HEARTBEAT_INTERVAL: RangeInclusive<Duration> =
    Duration::from_secs(1)..=Duration::from_mins(2);
/// How long resolving Discord mentions in a message may take before the raw text is used.
const RENDER_TIMEOUT: Duration = Duration::from_secs(5);
/// Discord's channel type for a guild text channel.
const GUILD_TEXT_CHANNEL: i64 = 0;
/// Discord's channel type for a guild announcement channel.
const GUILD_ANNOUNCEMENT_CHANNEL: i64 = 5;
/// Discord gateway intent flags.
mod intent {
    pub const GUILDS: u64 = 1 << 0;
    pub const GUILD_MESSAGES: u64 = 1 << 9;
    pub const DIRECT_MESSAGES: u64 = 1 << 12;
    pub const MESSAGE_CONTENT: u64 = 1 << 15;
}
/// The gateway intents we identify with.
const INTENTS: u64 =
    intent::GUILDS | intent::GUILD_MESSAGES | intent::DIRECT_MESSAGES | intent::MESSAGE_CONTENT;

/// Discord gateway opcodes.
mod opcode {
    pub const DISPATCH: i64 = 0;
    pub const HEARTBEAT: i64 = 1;
    pub const IDENTIFY: i64 = 2;
    pub const RESUME: i64 = 6;
    pub const RECONNECT: i64 = 7;
    pub const INVALID_SESSION: i64 = 9;
    pub const HELLO: i64 = 10;
    pub const HEARTBEAT_ACK: i64 = 11;
}

fn is_snowflake(id: &str) -> bool {
    SNOWFLAKE_DIGITS.contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

#[derive(Clone)]
pub struct Configuration {
    token: String,
    guild: String,
    lobby: String,
    development: String,
    ping_role: String,
    teacher_role: String,
}

impl Configuration {
    pub fn read(values: &HashMap<String, String>) -> Result<Option<Self>> {
        const TOKEN: &str = "DISCORD_TOKEN";
        const GUILD: &str = "DISCORD_GUILD_ID";
        const LOBBY: &str = "DISCORD_CHANNEL_SYNC_WITH_LOBBY";
        const DEVELOPMENT: &str = "DISCORD_CHANNEL_WEBSITE_DEVELOPMENT";
        const PING_ROLE: &str = "DISCORD_PING_CREW_ROLE_NAME";
        const TEACHER_ROLE: &str = "DISCORD_TRUSTED_TEACHER_ROLE_NAME";
        const KEYS: [&str; 6] = [TOKEN, GUILD, LOBBY, DEVELOPMENT, PING_ROLE, TEACHER_ROLE];
        if KEYS
            .iter()
            .all(|key| values.get(*key).is_none_or(|v| v.trim().is_empty()))
        {
            return Ok(None);
        }
        let value = |key: &str| -> Result<String> {
            values
                .get(key)
                .map(|v| v.trim().to_owned())
                .filter(|v| !v.is_empty())
                .with_context(|| {
                    crate::errors::Fault::new(
                        "discord_configuration",
                        format!("Required configuration field {key} is missing or empty."),
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    )
                })
        };
        let config = Self {
            token: value(TOKEN)?,
            guild: value(GUILD)?,
            lobby: value(LOBBY)?,
            development: value(DEVELOPMENT)?,
            ping_role: value(PING_ROLE)?,
            teacher_role: value(TEACHER_ROLE)?,
        };
        for (key, id) in [
            (GUILD, &config.guild),
            (LOBBY, &config.lobby),
            (DEVELOPMENT, &config.development),
        ] {
            if !is_snowflake(id) {
                return Err(crate::errors::Fault::new(
                    "discord_configuration",
                    format!(
                        "{key} must contain a {}-{} digit Discord identifier.",
                        SNOWFLAKE_DIGITS.start(),
                        SNOWFLAKE_DIGITS.end()
                    ),
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                )
                .into());
            }
        }
        Ok(Some(config))
    }
}

pub trait Transport: Send + Sync {
    fn request(
        &self,
        method: Method,
        path: String,
        body: Option<Value>,
    ) -> BoxFuture<'_, Result<Value>>;
    fn gateway(
        &self,
        events: mpsc::Sender<Value>,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<()>>;
}

struct NativeTransport {
    client: reqwest::Client,
    token: String,
    requests: Arc<Semaphore>,
}

impl NativeTransport {
    fn new(token: String) -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(REQUEST_TIMEOUT)
                .build()?,
            token,
            requests: Arc::new(Semaphore::new(MAX_CONCURRENT_REQUESTS)),
        })
    }
}

impl Transport for NativeTransport {
    fn request(
        &self,
        method: Method,
        path: String,
        body: Option<Value>,
    ) -> BoxFuture<'_, Result<Value>> {
        Box::pin(async move {
            let _permit = self.requests.clone().try_acquire_owned()?;
            ensure!(
                path.starts_with('/') && !path.contains(".."),
                "Invalid Discord resource"
            );
            let mut request = self
                .client
                .request(method, format!("{DISCORD_API}{path}"))
                .header("Authorization", format!("Bot {}", self.token))
                .header("User-Agent", DISCORD_USER_AGENT);
            if let Some(body) = body {
                request = request.json(&body);
            }
            let mut response = request.send().await?;
            if !response.status().is_success() {
                return Err(crate::errors::Fault::new(
                    "discord_http_error",
                    format!(
                        "Discord returned HTTP status: {}{}",
                        response.status().as_u16(),
                        if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
                            " (rate limited)"
                        } else {
                            ""
                        }
                    ),
                    axum::http::StatusCode::BAD_GATEWAY,
                )
                .into());
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = response.chunk().await? {
                ensure!(
                    bytes.len() + chunk.len() <= MAX_PAYLOAD_BYTES,
                    "Oversized Discord response"
                );
                bytes.extend(chunk);
            }
            if bytes.is_empty() {
                Ok(Value::Null)
            } else {
                Ok(serde_json::from_slice(&bytes)?)
            }
        })
    }

    fn gateway(
        &self,
        events: mpsc::Sender<Value>,
        cancel: CancellationToken,
    ) -> BoxFuture<'_, Result<()>> {
        Box::pin(async move {
            let mut sequence: Option<i64> = None;
            let mut session = String::new();
            while !cancel.is_cancelled() {
                let attempt = async {
                    use tokio_tungstenite::tungstenite::{Message, protocol::WebSocketConfig};
                    let config = WebSocketConfig::default()
                        .max_message_size(Some(MAX_PAYLOAD_BYTES))
                        .max_frame_size(Some(MAX_PAYLOAD_BYTES));
                    let (mut socket, _) = tokio_tungstenite::connect_async_with_config(
                        GATEWAY_URL,
                        Some(config),
                        false,
                    )
                    .await?;
                    let first = tokio::time::timeout(HELLO_TIMEOUT, socket.next())
                        .await?
                        .context("Missing Discord greeting")??;
                    let hello: Value = serde_json::from_str(first.to_text()?)?;
                    ensure!(hello["op"] == opcode::HELLO, "Invalid Discord greeting");
                    let interval = Duration::from_millis(
                        hello["d"]["heartbeat_interval"]
                            .as_u64()
                            .context("Missing heartbeat")?,
                    );
                    ensure!(HEARTBEAT_INTERVAL.contains(&interval), "Invalid heartbeat");
                    let identify = if session.is_empty() {
                        json!({"op":opcode::IDENTIFY,"d":{"token":self.token,"intents":INTENTS,
                            "properties":{"os":"linux","browser":"hanab-live","device":"hanab-live"}}})
                    } else {
                        json!({"op":opcode::RESUME,"d":{"token":self.token,"session_id":session,"seq":sequence}})
                    };
                    socket
                        .send(Message::Text(identify.to_string().into()))
                        .await?;
                    let mut heartbeat = tokio::time::interval(interval);
                    heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
                    let mut acknowledged = true;
                    loop {
                        tokio::select! {
                            ()=cancel.cancelled()=>{let _=tokio::time::timeout(CLOSE_TIMEOUT,socket.close(None)).await;return Ok::<(),anyhow::Error>(());}
                            _=heartbeat.tick()=>{
                                ensure!(acknowledged,"Discord heartbeat was not acknowledged");
                                socket.send(Message::Text(json!({"op":opcode::HEARTBEAT,"d":sequence}).to_string().into())).await?;
                                acknowledged=false;
                            }
                            next=socket.next()=>{
                                let message=next.context("Discord disconnected")??;
                                match message {
                                    Message::Text(text)=>{
                                        let value:Value=serde_json::from_str(&text)?;
                                        if let Some(seq)=value["s"].as_i64() {sequence=Some(seq);}
                                        match value["op"].as_i64() {
                                            Some(opcode::DISPATCH)=>{
                                                if value["t"]=="READY" {session=value["d"]["session_id"].as_str().context("Missing session")?.into();}
                                                events.try_send(value).map_err(|_|anyhow::anyhow!("Discord event capacity exhausted"))?;
                                            }
                                            Some(opcode::HEARTBEAT)=>socket.send(Message::Text(json!({"op":opcode::HEARTBEAT,"d":sequence}).to_string().into())).await?,
                                            Some(opcode::RECONNECT)=>break,
                                            Some(opcode::INVALID_SESSION)=>{if value["d"]!=true {session.clear();sequence=None;}break;}
                                            Some(opcode::HEARTBEAT_ACK)=>acknowledged=true,
                                            _=>{},
                                        }
                                    }
                                    Message::Ping(bytes)=>socket.send(Message::Pong(bytes)).await?,
                                    Message::Close(_)=>break,
                                    _=>{},
                                }
                            }
                        }
                    }
                    Ok(())
                };
                let result =
                    tokio::select! {()=cancel.cancelled()=>return Ok(()),result=attempt=>result};
                let _ = events.try_send(json!({"t":"TRANSPORT_DISCONNECTED"}));
                if let Err(error) = result {
                    crate::errors::Report::from_error("Reconnecting Discord gateway", &error, None)
                        .log();
                }
                tokio::select! {()=cancel.cancelled()=>break,()=tokio::time::sleep(RECONNECT_DELAY)=>{}}
            }
            Ok(())
        })
    }
}

/// The gateway connection's state, which the bridge keeps in an `AtomicU8`.
#[derive(Clone, Copy)]
enum Status {
    Connecting,
    Ready,
    Degraded,
    Closed,
}

impl Status {
    const ALL: [Self; 4] = [Self::Connecting, Self::Ready, Self::Degraded, Self::Closed];

    fn name(self) -> &'static str {
        match self {
            Self::Connecting => "connecting",
            Self::Ready => "ready",
            Self::Degraded => "degraded",
            Self::Closed => "closed",
        }
    }
}

pub struct Bridge {
    app: Weak<App>,
    pool: PgPool,
    config: Configuration,
    transport: Arc<dyn Transport>,
    bot_id: String,
    outbound: Mutex<()>,
    incoming: Mutex<()>,
    status: AtomicU8,
    announced: AtomicBool,
}

impl Bridge {
    pub async fn start(
        app: Arc<App>,
        config: Configuration,
        transport: Option<Arc<dyn Transport>>,
    ) -> Result<Arc<Self>> {
        let transport = match transport {
            Some(transport) => transport,
            None => Arc::new(NativeTransport::new(config.token.clone())?),
        };
        let bot = transport
            .request(Method::GET, "/users/@me".into(), None)
            .await?;
        let bot_id = bot["id"]
            .as_str()
            .context("Discord bot identity missing")?
            .to_owned();
        let values = transport
            .request(Method::GET, format!("/guilds/{}/roles", config.guild), None)
            .await?;
        let mut roles: HashMap<String, String> = HashMap::new();
        for role in values.as_array().context("Discord roles missing")? {
            roles.insert(
                role["id"].as_str().context("Role identity missing")?.into(),
                role["name"].as_str().context("Role name missing")?.into(),
            );
        }
        for (key, configured) in [
            ("DISCORD_PING_CREW_ROLE_NAME", &config.ping_role),
            ("DISCORD_TRUSTED_TEACHER_ROLE_NAME", &config.teacher_role),
        ] {
            if !roles.values().any(|name| name == configured) {
                return Err(crate::errors::Fault::new(
                    "discord_role_missing",
                    format!("The role configured by {key} was not found in the Discord guild."),
                    axum::http::StatusCode::BAD_GATEWAY,
                )
                .into());
            }
        }
        for (key, channel) in [
            ("DISCORD_CHANNEL_SYNC_WITH_LOBBY", &config.lobby),
            ("DISCORD_CHANNEL_WEBSITE_DEVELOPMENT", &config.development),
        ] {
            let data = transport
                .request(Method::GET, format!("/channels/{channel}"), None)
                .await?;
            if data["guild_id"] != config.guild
                || !matches!(
                    data["type"].as_i64(),
                    Some(GUILD_TEXT_CHANNEL | GUILD_ANNOUNCEMENT_CHANNEL)
                )
            {
                return Err(crate::errors::Fault::new("discord_channel_invalid",
                    format!("The channel configured by {key} is not a text/announcement channel in the configured guild."),
                    axum::http::StatusCode::BAD_GATEWAY).into());
            }
        }
        let bridge = Arc::new(Self {
            app: Arc::downgrade(&app),
            pool: app.store.primary.clone(),
            config,
            transport,
            bot_id,
            outbound: Mutex::new(()),
            incoming: Mutex::new(()),
            status: AtomicU8::new(Status::Connecting as u8),
            announced: AtomicBool::new(false),
        });
        let (events, mut receiver) = mpsc::channel(EVENT_QUEUE);
        let gateway = bridge.transport.clone();
        let cancel = app.shutdown.child_token();
        let lost = app.ownership_lost.clone();
        app.background.spawn(async move {
            tokio::select! {
                ()=lost.cancelled()=>{},
                result=gateway.gateway(events,cancel)=>{if let Err(error)=result {
                    crate::errors::Report::from_error("Discord gateway", &error, None).log();
                }}
            }
        });
        let inbound = bridge.clone();
        let weak = Arc::downgrade(&app);
        let shutdown = app.shutdown.clone();
        app.background.spawn(async move {
            loop {
                let event = tokio::select! {
                    ()=shutdown.cancelled()=>break,
                    event=receiver.recv()=>event,
                };
                let Some(event) = event else {
                    break;
                };
                let Some(app) = weak.upgrade() else {
                    break;
                };
                let _admission = app.admission.clone().read_owned().await;
                if !app.accepting.load(Ordering::Acquire) || !app.healthy() {
                    continue;
                }
                if let Err(error) = inbound.event(event).await {
                    inbound.set_status(Status::Degraded);
                    let report =
                        crate::errors::Report::from_error("Processing Discord event", &error, None);
                    report.log();
                    app.alert(&report);
                }
            }
            inbound.set_status(Status::Closed);
        });
        Ok(bridge)
    }

    fn app(&self) -> Result<Arc<App>> {
        let app = self.app.upgrade().context("Server stopped")?;
        ensure!(app.healthy(), "Server ownership unavailable");
        Ok(app)
    }

    pub fn status(&self) -> &'static str {
        let value = self.status.load(Ordering::Acquire);
        Status::ALL
            .into_iter()
            .find(|status| *status as u8 == value)
            .expect("the bridge stores only a Status")
            .name()
    }

    fn set_status(&self, status: Status) {
        self.status.store(status as u8, Ordering::Release);
    }

    pub fn degrade(&self) {
        self.set_status(Status::Degraded);
    }

    async fn lookup(&self, path: String, field: &str, fallback: &str) -> String {
        self.transport
            .request(Method::GET, path, None)
            .await
            .ok()
            .and_then(|v| v[field].as_str().map(str::to_owned))
            .unwrap_or_else(|| fallback.into())
    }

    async fn nickname(&self, id: &str) -> String {
        let response = self
            .transport
            .request(
                Method::GET,
                format!("/guilds/{}/members/{id}", self.config.guild),
                None,
            )
            .await;
        response
            .ok()
            .and_then(|v| {
                v["nick"]
                    .as_str()
                    .or_else(|| v["user"]["username"].as_str())
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| "[error]".into())
    }

    async fn current_roles(&self) -> Result<HashMap<String, String>> {
        let value = self
            .transport
            .request(
                Method::GET,
                format!("/guilds/{}/roles", self.config.guild),
                None,
            )
            .await?;
        value
            .as_array()
            .context("Discord roles unavailable")?
            .iter()
            .map(|role| {
                Ok((
                    role["id"].as_str().context("Role identity missing")?.into(),
                    role["name"].as_str().context("Role name missing")?.into(),
                ))
            })
            .collect()
    }

    pub async fn render(&self, text: &str) -> String {
        if let Ok(rendered) = tokio::time::timeout(RENDER_TIMEOUT, self.render_inner(text)).await {
            rendered
        } else {
            self.degrade();
            escape_html(text)
        }
    }

    async fn render_inner(&self, text: &str) -> String {
        let mut result = String::new();
        let mut offset = 0;
        for capture in regex!(r"<(@!?|@&|#)([0-9]+)>").captures_iter(text) {
            let id = &capture[2];
            if !is_snowflake(id) {
                continue;
            }
            let matched = capture.get(0).expect("group 0 is the whole match");
            result.push_str(&escape_html(&text[offset..matched.start()]));
            let name = match &capture[1] {
                "#" => format!(
                    "#{}",
                    self.lookup(format!("/channels/{id}"), "name", "[error]")
                        .await
                ),
                "@&" => format!(
                    "@{}",
                    self.current_roles()
                        .await
                        .ok()
                        .and_then(|roles| roles.get(id).cloned())
                        .unwrap_or_else(|| "[unknown role]".into())
                ),
                _ => format!("@{}", self.nickname(id).await),
            };
            result.push_str(&escape_html(&name));
            offset = matched.end();
        }
        result.push_str(&escape_html(&text[offset..]));
        spoilers(&result)
    }

    async fn send(&self, text: &str, roles: bool) -> Result<String> {
        self.send_to(&self.config.lobby, text, roles).await
    }

    async fn send_to(&self, channel: &str, text: &str, roles: bool) -> Result<String> {
        let current = if roles {
            self.current_roles().await?
        } else {
            HashMap::new()
        };
        let role_ids: Vec<&String> = current
            .iter()
            .filter(|(_, name)| {
                *name == &self.config.ping_role || *name == &self.config.teacher_role
            })
            .map(|(id, _)| id)
            .collect();
        self.app()?;
        let response=self.transport.request(Method::POST,format!("/channels/{channel}/messages"),
            Some(json!({"content":text,"allowed_mentions":{"parse":[],"roles":if roles {json!(role_ids)} else {json!([])},"users":[],"replied_user":false}}))).await?;
        Ok(response["id"]
            .as_str()
            .context("Discord message identity missing")?
            .into())
    }

    /// Posts a server error alert to the development channel, without mentions.
    pub async fn alert(&self, text: &str) -> Result<()> {
        self.send_to(&self.config.development, text, false).await?;
        Ok(())
    }

    pub async fn mirror(&self, chat_id: i32, supplied: Option<&str>) -> Result<()> {
        let _guard = self.outbound.lock().await;
        self.app()?;
        let row=sqlx::query!("SELECT c.message,c.source,c.discord_message_id,u.username FROM chat_log c
             LEFT JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND c.room='lobby' AND c.deleted_at IS NULL", chat_id).fetch_optional(&self.pool).await?;
        let Some(row) = row else {
            return Ok(());
        };
        let source: String = row.source.clone();
        if source == "discord" || row.discord_message_id.clone().is_some() {
            return Ok(());
        }
        let message: String = row.message.clone();
        // Lobby chat is stored as HTML; Discord shows the decoded text.
        let persisted = decode_html(&message);
        let raw = supplied.unwrap_or(&persisted);
        if supplied.is_some() {
            let rendered = if source == "user" {
                self.render(raw).await
            } else {
                raw.to_owned()
            };
            ensure!(
                rendered == message,
                "Discord text differs from persisted public message"
            );
        }
        if matches!(
            lobby::classify_chat(raw),
            lobby::Classification::Private | lobby::Classification::Unknown
        ) {
            return Ok(());
        }
        let username = if source == "server" {
            String::new()
        } else {
            row.username.clone().unwrap_or_default()
        };
        let id = self.send(&outbound_text(&username, raw), true).await?;
        if link_copy(&self.pool, chat_id, &id).await? {
            web::publish_external(
                self.app()?.as_ref(),
                vec![Effect::Broadcast(Outgoing::new(
                    hanabi_protocol::server::CHAT_DELETE,
                    hanabi_protocol::ChatDelete {
                        chat_id: i64::from(chat_id),
                        room: hanabi_protocol::LobbyRoom::Lobby,
                    },
                ))],
            )
            .await?;
        }
        Ok(())
    }

    async fn publish_effects(&self, effects: Vec<Effect>) -> Result<()> {
        let app = self.app()?;
        let mut public = vec![];
        let mut mirrors = vec![];
        for effect in effects {
            match effect {
                Effect::DiscordMirror { chat_id, .. } => mirrors.push(chat_id),
                Effect::RuntimeChat { command, args, .. } => {
                    for response in app.info.runtime_response(&command, &args)? {
                        for item in lobby::server_chat(&self.pool, &response).await? {
                            if let Effect::DiscordMirror { chat_id, .. } = item {
                                mirrors.push(chat_id);
                            } else {
                                public.push(item);
                            }
                        }
                    }
                }
                Effect::Broadcast(_) => public.push(effect),
                _ => {}
            }
        }
        web::publish_external(&app, public).await?;
        for id in mirrors {
            self.mirror(id, None).await?;
        }
        Ok(())
    }

    async fn announce(&self, message: &str) -> Result<()> {
        self.app()?;
        let effects = lobby::server_chat(&self.pool, message).await?;
        // Poll both deliveries to completion; a slow or failed channel must not cancel the other.
        let plain = decode_html(message);
        let (lobby, development) = tokio::join!(
            self.publish_effects(effects),
            self.send_to(&self.config.development, &plain, true),
        );
        lobby.context("Sending lifecycle announcement to the lobby channel")?;
        development.context("Sending lifecycle announcement to the development channel")?;
        Ok(())
    }

    pub async fn announce_restart(&self, uptime: Duration, message: Option<&str>) -> Result<()> {
        self.announce(&format!(
            "{RESTART_PREFIX} {} ({}) - Uptime: {}{}",
            Utc::now().format("%a %b %d %H:%M:%S UTC %Y"),
            crate::restart::version(),
            crate::lifecycle::duration(uptime.as_secs()),
            downtime_reason(message),
        ))
        .await
    }

    pub async fn announce_stop(&self, uptime: Duration, message: Option<&str>) -> Result<()> {
        self.announce(&format!(
            "{STOP_PREFIX} {} ({}) - Uptime: {}{}",
            Utc::now().format("%a %b %d %H:%M:%S UTC %Y"),
            crate::restart::version(),
            crate::lifecycle::duration(uptime.as_secs()),
            downtime_reason(message),
        ))
        .await
    }

    pub async fn event(&self, event: Value) -> Result<()> {
        let _guard = self.incoming.lock().await;
        self.app()?;
        let data = &event["d"];
        match event["t"].as_str() {
            Some("READY" | "RESUMED") => {
                self.set_status(Status::Ready);
                if !self.announced.swap(true, Ordering::AcqRel) {
                    let now = Utc::now();
                    let mut message = format!(
                        "The server has successfully started at: {} ({})",
                        now.format("%a %b %d %H:%M:%S UTC %Y"),
                        crate::restart::version(),
                    );
                    if let Some(down) = last_shutdown(&self.pool).await? {
                        let seconds = (now - down).num_seconds().max(0).unsigned_abs();
                        write!(
                            message,
                            " - Downtime: {}",
                            crate::lifecycle::duration(seconds)
                        )?;
                    }
                    self.announce(&message).await?;
                }
            }
            Some("TRANSPORT_DISCONNECTED") => {
                self.set_status(Status::Degraded);
            }
            Some("MESSAGE_CREATE") => {
                if data["guild_id"] != self.config.guild
                    || data["channel_id"] != self.config.lobby
                    || data["author"]["id"] == self.bot_id
                {
                    return Ok(());
                }
                let id = data["id"]
                    .as_str()
                    .filter(|id| !id.is_empty())
                    .context("Missing message identity")?;
                let author = data["author"]["id"].as_str().context("Missing author")?;
                ensure!(
                    is_snowflake(id) && is_snowflake(author),
                    "Invalid Discord identity"
                );
                let content = data["content"].as_str().unwrap_or("");
                let subscription = content
                    .lines()
                    .map(|line| line.split(' ').next().unwrap_or("").to_ascii_lowercase())
                    .find(|cmd| cmd == "/subscribe" || cmd == "/unsubscribe");
                let Ok(text) = normalize_chat(subscription.as_deref().unwrap_or(content)) else {
                    return Ok(());
                };
                let class = lobby::classify_chat(&text);
                if subscription.is_none()
                    && matches!(
                        class,
                        lobby::Classification::Private | lobby::Classification::Unknown
                    )
                {
                    return Ok(());
                }
                let name = self.nickname(author).await;
                let rendered = self.render(&text).await;
                let inserted = insert_message(&self.pool, &name, &rendered, Some(id)).await?;
                let Some((chat_id, time)) = inserted else {
                    return Ok(());
                };
                if let Some(subscription) = subscription {
                    self.subscribe(author, &name, subscription == "/subscribe")
                        .await?;
                } else {
                    self.publish_effects(vec![Effect::Broadcast(Outgoing::new(
                        hanabi_protocol::server::CHAT,
                        hanabi_protocol::Chat {
                            chat_id: Some(i64::from(chat_id)),
                            who: Some(name.clone()),
                            room: Some("lobby".into()),
                            ..hanabi_protocol::Chat::new(
                                rendered,
                                hanabi_protocol::ChatSource::Discord,
                                crate::model::timestamp(time),
                            )
                        },
                    ))])
                    .await?;
                    if class == lobby::Classification::Public {
                        self.publish_effects(lobby::external_command(&self.pool, &text).await?)
                            .await?;
                    }
                }
            }
            Some("MESSAGE_DELETE" | "MESSAGE_DELETE_BULK") => {
                if data["channel_id"] != self.config.lobby {
                    return Ok(());
                }
                let ids: HashSet<&str> = if let Some(ids) = data["ids"].as_array() {
                    ids.iter().filter_map(Value::as_str).collect()
                } else {
                    data["id"].as_str().into_iter().collect()
                };
                for id in ids {
                    if let Some(chat_id) = delete_message(&self.pool, id).await? {
                        self.publish_effects(vec![Effect::Broadcast(Outgoing::new(
                            hanabi_protocol::server::CHAT_DELETE,
                            hanabi_protocol::ChatDelete {
                                chat_id: i64::from(chat_id),
                                room: hanabi_protocol::LobbyRoom::Lobby,
                            },
                        ))])
                        .await?;
                    }
                }
            }
            _ => {}
        }
        Ok(())
    }

    async fn subscribe(&self, author: &str, name: &str, add: bool) -> Result<()> {
        let current = self.current_roles().await?;
        let role = current
            .iter()
            .find(|(_, name)| *name == &self.config.ping_role)
            .map(|(id, _)| id)
            .context("Subscription role missing")?;
        let response = self
            .transport
            .request(
                if add { Method::PUT } else { Method::DELETE },
                format!(
                    "/guilds/{}/members/{author}/roles/{role}",
                    self.config.guild
                ),
                None,
            )
            .await;
        if let Err(error) = response {
            let report = crate::errors::Report::from_error(
                "Updating Discord subscription role",
                &error,
                None,
            );
            report.log();
            self.send(
                &format!(
                    "Error: the `@Ping Crew` role could not be {} your profile. {}",
                    if add { "added to" } else { "removed from" },
                    report.text()
                ),
                false,
            )
            .await?;
            return Ok(());
        }
        let action = if add {
            "is now a member of"
        } else {
            "has left"
        };
        let notice = format!("@{name} {action} the @Ping Crew.");
        let rendered = self.render(&notice).await;
        if let Some((id, time)) = insert_message(&self.pool, "", &rendered, None).await? {
            self.publish_effects(vec![Effect::Broadcast(Outgoing::new(
                hanabi_protocol::server::CHAT,
                hanabi_protocol::Chat {
                    chat_id: Some(i64::from(id)),
                    who: Some(String::new()),
                    room: Some("lobby".into()),
                    ..hanabi_protocol::Chat::new(
                        rendered,
                        hanabi_protocol::ChatSource::Discord,
                        crate::model::timestamp(time),
                    )
                },
            ))])
            .await?;
        }
        self.send(&format!("`@{name}` {action} the `@Ping Crew`."), false)
            .await?;
        Ok(())
    }
}

/// When the most recent server announcement is a graceful shutdown, returns when it was sent.
async fn last_shutdown(pool: &PgPool) -> Result<Option<DateTime<Utc>>> {
    let row = sqlx::query!(
        "SELECT message,datetime_sent FROM chat_log WHERE room='lobby' AND source='server'
         ORDER BY id DESC LIMIT 1"
    )
    .fetch_optional(pool)
    .await?;
    Ok(row
        .filter(|row| {
            row.message.starts_with(RESTART_PREFIX) || row.message.starts_with(STOP_PREFIX)
        })
        .map(|row| row.datetime_sent))
}

pub async fn insert_message(
    pool: &PgPool,
    name: &str,
    text: &str,
    message_id: Option<&str>,
) -> Result<Option<(i32, DateTime<Utc>)>> {
    let mut tx = pool.begin().await?;
    if let Some(id) = message_id {
        sqlx::query!("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", id)
            .execute(&mut *tx)
            .await?;
    }
    let result = sqlx::query!(
        "INSERT INTO chat_log(user_id,source,discord_name,message,room,discord_message_id)
         VALUES(0,'discord',$1,$2,'lobby',$3)
         ON CONFLICT(discord_message_id) WHERE discord_message_id IS NOT NULL DO NOTHING
         RETURNING id,datetime_sent",
        name,
        text,
        message_id,
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(result.map(|row| (row.id, row.datetime_sent)))
}

pub async fn delete_message(pool: &PgPool, id: &str) -> Result<Option<i32>> {
    ensure!(!id.is_empty(), "Missing Discord identity");
    let mut tx = pool.begin().await?;
    sqlx::query!("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", id)
        .execute(&mut *tx)
        .await?;
    let result = sqlx::query_scalar!(
        "INSERT INTO chat_log(user_id,source,message,room,discord_message_id,deleted_at)
         VALUES(0,'discord','','lobby',$1,NOW())
         ON CONFLICT(discord_message_id) WHERE discord_message_id IS NOT NULL
         DO UPDATE SET message='',discord_name=NULL,deleted_at=EXCLUDED.deleted_at
         WHERE chat_log.deleted_at IS NULL RETURNING id",
        id
    )
    .fetch_optional(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(result)
}

pub async fn link_copy(pool: &PgPool, chat_id: i32, id: &str) -> Result<bool> {
    ensure!(
        chat_id > 0 && !id.is_empty(),
        "Invalid Discord copy identity"
    );
    let mut tx = pool.begin().await?;
    sqlx::query!("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", id)
        .execute(&mut *tx)
        .await?;
    let existing = sqlx::query!(
        "SELECT id,deleted_at FROM chat_log WHERE discord_message_id=$1",
        id
    )
    .fetch_optional(&mut *tx)
    .await?;
    let mut deleted = false;
    if let Some(row) = existing
        && row.id != chat_id
    {
        ensure!(
            row.deleted_at.is_some(),
            "Discord copy belongs to another live message"
        );
        deleted=sqlx::query!("UPDATE chat_log SET message='',discord_name=NULL,deleted_at=NOW() WHERE id=$1 AND room='lobby' AND deleted_at IS NULL", chat_id).execute(&mut *tx).await?.rows_affected()>0;
    } else {
        sqlx::query!("UPDATE chat_log SET discord_message_id=$2 WHERE id=$1 AND room='lobby' AND deleted_at IS NULL", chat_id, id).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    Ok(deleted)
}

fn decode_html(text: &str) -> String {
    regex!(r"&(?:amp|apos|gt|lt|quot|#34|#39);")
        .replace_all(text, |captures: &regex::Captures<'_>| match &captures[0] {
            "&amp;" => "&",
            "&lt;" => "<",
            "&gt;" => ">",
            "&quot;" | "&#34;" => "\"",
            _ => "'",
        })
        .into_owned()
}

fn outbound_text(name: &str, text: &str) -> String {
    let content = text
        .split(' ')
        .map(|word| {
            if word.contains("://")
                && url::Url::parse(word).is_ok_and(|url| url.host_str().is_some())
            {
                format!("<{word}>")
            } else {
                word.into()
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    let mut safe = String::new();
    for ch in name.chars().filter(|c| !matches!(c, '\n' | '\r')) {
        if "*\\_`|~".contains(ch) {
            safe.push('\\');
        }
        safe.push(ch);
    }
    if name.is_empty() {
        content
    } else {
        format!("<**{safe}**> {content}")
    }
}

/// Discord's delimiter on each side of a spoiler.
const SPOILER: &str = "||";

fn spoilers(text: &str) -> String {
    let width = SPOILER.len();
    let mut result = String::new();
    let mut offset = 0;
    while let Some(start) = text[offset..].find(SPOILER).map(|i| i + offset) {
        if start > 0 && text.as_bytes()[start - 1] != b' ' {
            result.push_str(&text[offset..start + width]);
            offset = start + width;
            continue;
        }
        let Some(end) = text[start + width..]
            .find(SPOILER)
            .map(|i| i + start + width)
        else {
            break;
        };
        if end == start + width
            || (end + width < text.len() && text.as_bytes()[end + width] != b' ')
        {
            result.push_str(&text[offset..end + width]);
            offset = end + width;
            continue;
        }
        result.push_str(&text[offset..start]);
        result.push_str("<span class=\"spoiler\">");
        result.push_str(&text[start + width..end]);
        result.push_str("</span>");
        offset = end + width;
    }
    result.push_str(&text[offset..]);
    result
}

/// Announcements are stored as lobby chat HTML, so the administrator's text is escaped.
fn downtime_reason(message: Option<&str>) -> String {
    message.map_or_else(String::new, |message| {
        format!(" Reason: {}", escape_html(message))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rendering_does_not_double_decode_or_allow_mentions_through_names() {
        assert_eq!(decode_html("&amp;lt;secret&amp;gt;"), "&lt;secret&gt;");
        assert_eq!(
            spoilers("x ||&lt;safe&gt;|| y"),
            "x <span class=\"spoiler\">&lt;safe&gt;</span> y"
        );
        assert_eq!(
            outbound_text("a*\\\nb", "https://example.invalid/path"),
            "<**a\\*\\\\b**> <https://example.invalid/path>"
        );
        assert!(Configuration::read(&HashMap::new()).unwrap().is_none());
        assert!(
            Configuration::read(&HashMap::from([(
                "DISCORD_TOKEN".into(),
                "never-log-this".into()
            )]))
            .is_err()
        );
    }
    #[tokio::test]
    async fn discord_postgres_tombstones_duplicates_and_copy_races() {
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return;
        };
        let id = "111111111111111111";
        assert!(delete_message(&db.pool, id).await.unwrap().is_some());
        assert!(
            insert_message(&db.pool, "name", "must not resurrect", Some(id))
                .await
                .unwrap()
                .is_none()
        );
        assert!(delete_message(&db.pool, id).await.unwrap().is_none());
        let live = "222222222222222222";
        let (one, two) = tokio::join!(
            insert_message(&db.pool, "name", "one", Some(live)),
            insert_message(&db.pool, "name", "two", Some(live))
        );
        assert_ne!(one.unwrap().is_some(), two.unwrap().is_some());
        let author = db.user("Alice").await;
        let chat:i32=sqlx::query_scalar!("INSERT INTO chat_log(user_id,source,message,room) VALUES($1,'user','message','lobby') RETURNING id", author).fetch_one(&db.pool).await.unwrap();
        assert!(link_copy(&db.pool, chat, id).await.unwrap());
        let row = sqlx::query!(
            "SELECT user_id,message,deleted_at FROM chat_log WHERE id=$1",
            chat
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(row.user_id, author);
        assert_eq!(row.message, "");
        assert!(row.deleted_at.is_some());
        db.close().await;
    }
}
