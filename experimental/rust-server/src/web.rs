//! Native browser routes and bounded WebSocket transport. Database work runs
//! behind the drain barrier; the hub owns session-generation publication.
#[cfg(test)]
mod integration_tests;
mod protocol;
#[cfg(test)]
pub(crate) mod test_support;

use crate::{
    accounts::{self, AccountConfig},
    actors::HubCommand,
    integrations::Integrations,
    lobby::{self, Caller, Effect},
    public_http::{self, PublicConfig},
    store::Store,
    transport::{Inbound, InboundBudget, Outbound, Session, SessionMetadata, frame},
};
use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    extract::{
        ConnectInfo, Request, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use sqlx::Row;
use std::{
    collections::HashMap,
    future::Future,
    net::SocketAddr,
    sync::{
        Arc, OnceLock, RwLock,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    task::Poll,
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub trait RuntimeStatus: Send + Sync {
    fn time_left(&self) -> String;
    fn shutting_down(&self) -> bool {
        false
    }
    fn maintenance_mode(&self) -> bool {
        false
    }
    fn shutdown_started_at(&self) -> Option<String> {
        None
    }
}

pub struct App {
    pub store: Store,
    pub hub: mpsc::Sender<HubCommand>,
    pub secret: String,
    pub version: String,
    pub accepting: AtomicBool,
    pub connections: TaskTracker,
    pub background: TaskTracker,
    pub shutdown: CancellationToken,
    pub lease_lost: CancellationToken,
    pub admission: Arc<tokio::sync::RwLock<()>>,
    generation: AtomicU64,
    sockets: Arc<Semaphore>,
    incoming_bytes: Arc<Semaphore>,
    public: PublicConfig,
    started: Instant,
    came_online: DateTime<Utc>,
    runtime: RwLock<Option<Arc<dyn RuntimeStatus>>>,
    integrations: OnceLock<Arc<Integrations>>,
    integration_started: AtomicBool,
}

impl App {
    pub fn is_development(&self) -> bool {
        self.public.is_dev
    }

    pub fn integration_status(&self) -> Value {
        self.integrations
            .get()
            .map(|integrations| integrations.status())
            .unwrap_or_else(|| json!({"discord":"disabled"}))
    }

    pub fn new(
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        public: PublicConfig,
        lease_lost: CancellationToken,
    ) -> Arc<Self> {
        Arc::new(Self {
            store,
            hub,
            secret: public.session_secret.to_string(),
            version: public.client_version.to_string(),
            accepting: AtomicBool::new(true),
            generation: AtomicU64::new(1),
            sockets: Arc::new(Semaphore::new(4096)),
            incoming_bytes: Arc::new(Semaphore::new(crate::transport::GLOBAL_INPUT_BYTES)),
            connections: TaskTracker::new(),
            background: TaskTracker::new(),
            shutdown: CancellationToken::new(),
            lease_lost,
            admission: Arc::new(tokio::sync::RwLock::new(())),
            public,
            started: Instant::now(),
            came_online: Utc::now(),
            runtime: RwLock::new(None),
            integrations: OnceLock::new(),
            integration_started: AtomicBool::new(false),
        })
    }

    pub fn set_runtime(&self, runtime: Arc<dyn RuntimeStatus>) {
        *self.runtime.write().unwrap_or_else(|e| e.into_inner()) = Some(runtime);
    }

    pub async fn start_integrations(
        self: &Arc<Self>,
        values: &HashMap<String, String>,
    ) -> Result<()> {
        ensure!(
            self.integration_started
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok(),
            "Integrations already initialized"
        );
        let integrations = Integrations::start(self.clone(), values).await?;
        self.integrations
            .set(integrations)
            .map_err(|_| anyhow::anyhow!("Integrations already initialized"))?;
        Ok(())
    }

    pub fn healthy(&self) -> bool {
        !self.shutdown.is_cancelled()
            && !self.lease_lost.is_cancelled()
            && self.store.check_state().is_ok()
    }

    pub fn telemetry(&self, operation: &'static str) {
        if let Some(integrations) = self.integrations.get() {
            integrations.report(operation);
        }
    }

    pub fn public_url(&self, path: &str) -> String {
        format!(
            "{}://{}{path}",
            if self.public.use_tls { "https" } else { "http" },
            self.public.domain
        )
    }
}

pub fn router(app: Arc<App>) -> Router {
    let accounts = accounts::router(
        app.store.primary.clone(),
        AccountConfig {
            secret: app.secret.clone(),
            domain: app.public.domain.to_string(),
            use_tls: app.public.use_tls,
            version: app.version.clone(),
            is_dev: app.public.is_dev,
        },
    );
    let authenticated = Router::new()
        .route("/ws", get(websocket))
        .with_state(app.clone())
        .merge(accounts)
        .layer(middleware::from_fn_with_state(app.clone(), check_origin));
    public_http::router(app.store.primary.clone(), app.public.clone()).merge(authenticated)
}

fn origin_allowed(headers: &HeaderMap, domain: &str, use_tls: bool) -> bool {
    let Some(origin) = headers.get(header::ORIGIN) else {
        return true;
    };
    let Some(origin) = origin.to_str().ok().and_then(|v| url::Url::parse(v).ok()) else {
        return false;
    };
    if origin.scheme() != if use_tls { "https" } else { "http" }
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
        || !origin.username().is_empty()
        || origin.password().is_some()
    {
        return false;
    }
    let scheme = if use_tls { "https" } else { "http" };
    let Some(configured) = url::Url::parse(&format!("{scheme}://{domain}")).ok() else {
        return false;
    };
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .and_then(|host| url::Url::parse(&format!("{scheme}://{host}")).ok())
    else {
        return false;
    };
    origin.host_str() == configured.host_str()
        && origin.host_str() == host.host_str()
        && origin.port_or_known_default() == host.port_or_known_default()
        && (configured.port().is_none()
            || configured.port_or_known_default() == origin.port_or_known_default())
}

async fn check_origin(State(app): State<Arc<App>>, request: Request, next: Next) -> Response {
    if !origin_allowed(request.headers(), &app.public.domain, app.public.use_tls) {
        return (StatusCode::FORBIDDEN, "Invalid request origin.\n").into_response();
    }
    let _admission = app.admission.clone().read_owned().await;
    if !app.healthy() || !app.accepting.load(Ordering::Acquire) {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "The server is draining for maintenance.\n",
        )
            .into_response();
    }
    next.run(request).await
}

struct Bootstrap {
    name: String,
    normalized_name: String,
    welcome: Value,
    initial: Vec<String>,
}

async fn bootstrap(app: &App, id: i32, ip: &str, reconnect: bool) -> Result<Bootstrap> {
    let pool = &app.store.primary;
    ensure!(
        !accounts::is_banned(pool, ip).await?,
        "Your IP address has been banned."
    );
    let row = sqlx::query(
        "SELECT username,normalized_username,datetime_created,
         (SELECT COUNT(*) FROM games g JOIN game_participants p ON p.game_id=g.id
          WHERE p.user_id=u.id AND g.end_condition=1) AS total FROM users u WHERE u.id=$1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .context("The authenticated user no longer exists.")?;
    let name: String = row.try_get("username")?;
    let normalized_name: String = row.try_get("normalized_username")?;
    let (settings, friends, muted) = tokio::try_join!(
        lobby::get_settings(pool, id),
        lobby::friends(pool, id),
        accounts::is_muted(pool, ip)
    )?;
    let created: DateTime<Utc> = row.try_get("datetime_created")?;
    let runtime = app
        .runtime
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    let mut welcome = json!({
        "userID":id,"username":name,"totalGames":row.try_get::<i64,_>("total")?,
        "muted":muted,"firstTimeUser":(Utc::now()-created).num_milliseconds()<10000,
        "settings":settings,"friends":friends,"connectionMode":if reconnect {"reconnect"} else {"initial"},
        "playingAtTables":[],"randomTableName":"","shuttingDown":runtime.as_ref().is_some_and(|r|r.shutting_down()),
        "maintenanceMode":runtime.as_ref().is_some_and(|r|r.maintenance_mode()),
    });
    if let Some(started) = runtime.as_ref().and_then(|r| r.shutdown_started_at()) {
        welcome["datetimeShutdownInit"] = json!(started);
    }
    let mut initial = vec![];
    if !reconnect {
        let (chat, own_ids, friend_ids) = tokio::try_join!(
            lobby::lobby_history(pool, 50),
            lobby::history_ids(pool, id, 0, 10, false),
            lobby::history_ids(pool, id, 0, 10, true)
        )?;
        let (own, friend_history) = tokio::try_join!(
            lobby::get_history(pool, &own_ids, false),
            lobby::get_history(pool, &friend_ids, false)
        )?;
        initial.push(frame("chatList", json!({"list":chat,"unread":0})));
        initial.push(frame("chat",json!({
            "msg":"Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>.",
            "source":"server","datetime":Utc::now(),"room":"lobby"
        })));
        let motd = app.public.root.join("motd.txt");
        match tokio::fs::read_to_string(motd).await {
            Ok(text) if !text.trim().is_empty()=>initial.push(frame("chat",json!({
                "msg":format!("[Server Notice] {}",text.trim()),"who":"","source":"server","datetime":Utc::now(),"room":"lobby"
            }))),
            Ok(_)=>{},
            Err(error) if error.kind()==std::io::ErrorKind::NotFound=>{},
            Err(error)=>return Err(error.into()),
        }
        initial.push(frame("gameHistory", json!(own)));
        if !friends.is_empty() {
            initial.push(frame("gameHistoryFriends", json!(friend_history)));
        }
    }
    sqlx::query("UPDATE users SET datetime_last_login=NOW(),last_ip=$2 WHERE id=$1")
        .bind(id)
        .bind(ip)
        .execute(pool)
        .await?;
    Ok(Bootstrap {
        name,
        normalized_name,
        welcome,
        initial,
    })
}

async fn websocket(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: axum::http::Uri,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !app.healthy() || !app.accepting.load(Ordering::Acquire) {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let Some(id) = accounts::session_id(&headers, &app.secret) else {
        return (StatusCode::UNAUTHORIZED, "A valid session is required.\n").into_response();
    };
    match accounts::is_banned(&app.store.primary, &address.ip().to_string()).await {
        Ok(false) => {}
        Ok(true) => {
            return (
                StatusCode::UNAUTHORIZED,
                "Your IP address has been banned.\n",
            )
                .into_response();
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
    match sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM users WHERE id=$1)")
        .bind(id)
        .fetch_one(&app.store.primary)
        .await
    {
        Ok(true) => {}
        Ok(false) => return StatusCode::UNAUTHORIZED.into_response(),
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
    let Ok(slot) = app.sockets.clone().try_acquire_owned() else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let Ok(generation) = app
        .generation
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
    else {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    };
    let reconnect = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
        .any(|(key, value)| key == "reconnect" && value == "1");
    upgrade
        .max_message_size(crate::transport::MAX_MESSAGE_BYTES)
        .max_frame_size(crate::transport::MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| async move {
            let tracker = app.connections.clone();
            tracker
                .track_future(async move {
                    let _slot = slot;
                    if connection(
                        socket,
                        app.clone(),
                        id,
                        generation,
                        address.ip().to_string(),
                        reconnect,
                    )
                    .await
                    .is_err()
                    {
                        app.telemetry("websocket");
                        eprintln!("WebSocket session failed.");
                    }
                })
                .await;
        })
}

async fn connection(
    mut socket: WebSocket,
    app: Arc<App>,
    id: i32,
    generation: u64,
    ip: String,
    reconnect: bool,
) -> Result<()> {
    let admission = app.admission.clone().read_owned().await;
    ensure!(
        app.accepting.load(Ordering::Acquire) && app.healthy(),
        "Server unavailable"
    );
    let data = match bootstrap(&app, id, &ip, reconnect).await {
        Ok(data) => data,
        Err(error) => {
            let _ = tokio::time::timeout(
                Duration::from_secs(5),
                socket.send(Message::Text(
                    frame("error", json!({"error":"Account initialization failed."})).into(),
                )),
            )
            .await;
            return Err(error);
        }
    };
    let store = app.store.clone();
    let shutdown = app.shutdown.clone();
    let (session, mut outgoing) = Session::with_health(
        SessionMetadata {
            user: id,
            name: data.name,
            normalized_name: data.normalized_name,
            ip,
            generation,
            hyphenated: data.welcome["settings"]["hyphenatedConventions"]
                .as_bool()
                .unwrap_or(false),
        },
        app.lease_lost.clone(),
        Arc::new(move || !shutdown.is_cancelled() && store.check_state().is_ok()),
    );
    let (mut sink, mut stream) = socket.split();
    let writer_session = session.clone();
    let writer_shutdown = app.shutdown.clone();
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                _=writer_session.cancel.cancelled()=>break,
                _=writer_session.lease_lost.cancelled()=>break,
                _=writer_shutdown.cancelled()=>break,
                next=outgoing.recv()=>{
                    let Some(Outbound {message,permit,completion,global_permit})=next else {break;};
                    let send=sink.send(message);
                    tokio::pin!(send);
                    // Recheck the monotonic Redis deadline on every poll, including
                    // the first poll after a stalled executor resumes.
                    let guarded=futures_util::future::poll_fn(|cx| {
                        if !writer_session.active() {Poll::Ready(None)}
                        else {send.as_mut().poll(cx).map(Some)}
                    });
                    let result=tokio::select! {
                        _=writer_session.cancel.cancelled()=>None,
                        _=writer_session.lease_lost.cancelled()=>None,
                        _=writer_shutdown.cancelled()=>None,
                        result=tokio::time::timeout(Duration::from_secs(5),guarded)=>result.ok().flatten(),
                    };
                    drop(permit);
                    drop(global_permit);
                    if !matches!(result,Some(Ok(()))) {break;}
                    if let Some(completion)=completion {let _=completion.send(());break;}
                }
            }
        }
        writer_session.cancel.cancel();
        let _ = tokio::time::timeout(Duration::from_secs(1), sink.send(Message::Close(None))).await;
    });
    let (incoming, mut commands) = mpsc::channel::<Inbound>(64);
    let incoming_bytes = InboundBudget::new(app.incoming_bytes.clone());
    let reader_session = session.clone();
    let reader_shutdown = app.shutdown.clone();
    let reader = tokio::spawn(async move {
        loop {
            tokio::select! {
                _=reader_session.cancel.cancelled()=>break,
                _=reader_session.lease_lost.cancelled()=>break,
                _=reader_shutdown.cancelled()=>break,
                next=stream.next()=>match next {
                    Some(Ok(Message::Text(text)))=>{
                        let Some(message)=incoming_bytes.admit(&reader_session,&text) else {break;};
                        if incoming.try_send(message).is_err() {
                            eprintln!("Closing connection with a saturated input command queue.");
                            reader_session.cancel.cancel();
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(_)|Message::Pong(_)))=>{},
                    _=>break,
                }
            }
        }
        reader_session.cancel.cancel();
    });
    let result = async {
        let (reply, received) = oneshot::channel();
        app.hub
            .send(HubCommand::Register {
                session: session.clone(),
                welcome: data.welcome,
                initial: data.initial,
                reply,
            })
            .await?;
        received.await??;
        drop(admission);
        loop {
            let command = tokio::select! {
                _=session.cancel.cancelled()=>break,
                _=app.shutdown.cancelled()=>break,
                command=commands.recv()=>command,
            };
            let Some(command) = command else {
                break;
            };
            // Once admitted, finish persistence rather than dropping a transaction
            // future on socket cancellation. Publication still checks generation.
            if let Err(error) = dispatch(&app, session.clone(), &command.text).await {
                if error
                    .downcast_ref::<hanabi_engine::ActionRejected>()
                    .is_some_and(|rejected| rejected.silent)
                {
                    continue;
                }
                let internal = error.chain().any(|cause| {
                    cause.is::<sqlx::Error>()
                        || cause.is::<redis::RedisError>()
                        || cause.is::<reqwest::Error>()
                });
                let warning = if internal {
                    app.telemetry("websocket-command");
                    "Something went wrong on the server.".into()
                } else {
                    accounts::escape_html(&error.to_string())
                };
                session.emit(&frame("warning", json!({"warning":warning})));
            }
        }
        Ok::<(), anyhow::Error>(())
    }
    .await;
    drop(commands);
    session.cancel.cancel();
    let _ = app.hub.send(HubCommand::Logout(session)).await;
    reader.await?;
    writer.await?;
    result
}

pub async fn publish_external(app: &App, effects: Vec<Effect>) -> Result<()> {
    ensure!(app.healthy(), "Server ownership unavailable");
    let (reply, received) = oneshot::channel();
    app.hub
        .send(HubCommand::ExternalEffects { effects, reply })
        .await?;
    received.await?
}

async fn publish(app: &App, session: Arc<Session>, effects: Vec<Effect>) -> Result<()> {
    let mut ordinary = vec![];
    let mut mirrors = vec![];
    for effect in effects {
        match effect {
            Effect::DiscordMirror {
                chat_id, message, ..
            } => mirrors.push((chat_id, message)),
            Effect::RuntimeChat { command, args, .. } => {
                for message in runtime_response(app, &command, &args)? {
                    for effect in lobby::server_chat(&app.store.primary, &message).await? {
                        if let Effect::DiscordMirror {
                            chat_id, message, ..
                        } = effect
                        {
                            mirrors.push((chat_id, message));
                        } else {
                            ordinary.push(effect);
                        }
                    }
                }
            }
            effect => ordinary.push(effect),
        }
    }
    let (reply, received) = oneshot::channel();
    app.hub
        .send(HubCommand::LobbyEffects {
            session,
            effects: ordinary,
            reply,
        })
        .await?;
    received.await??;
    if let Some(integrations) = app.integrations.get() {
        for (id, raw) in mirrors {
            integrations.mirror(id, Some(&raw)).await;
        }
    }
    Ok(())
}

pub fn runtime_response(app: &App, command: &str, args: &[String]) -> Result<Vec<String>> {
    Ok(match command {
        "uptime" => vec![
            format!(
                "The server came online at: {}",
                app.came_online.format("%a %b %d %H:%M:%S UTC %Y")
            ),
            format!(
                "Uptime: {}",
                format_duration(app.started.elapsed().as_secs())
            ),
        ],
        "timeleft" => vec![
            app.runtime
                .read()
                .unwrap_or_else(|e| e.into_inner())
                .as_ref()
                .map(|r| r.time_left())
                .unwrap_or_else(|| "The server is not scheduled to shutdown any time soon.".into()),
        ],
        "replay" => {
            if args.is_empty() {
                vec!["The format of the /replay command is: /replay [game ID] [turn number]".into()]
            } else {
                let mut numbers = vec![];
                for argument in args.iter().take(2) {
                    match argument.parse::<i64>() {
                        Ok(number) => numbers.push(number),
                        Err(_) => {
                            return Ok(vec![if argument.parse::<f64>().is_ok() {
                                "The /replay command only accepts integers.".into()
                            } else {
                                format!("\"{}\" is not a number.", accounts::escape_html(argument))
                            }]);
                        }
                    }
                }
                vec![app.public_url(&format!(
                        "/replay/{}{}",
                        numbers[0],
                        numbers
                            .get(1)
                            .map(|turn| format!("#{turn}"))
                            .unwrap_or_default()
                    ))]
            }
        }
        _ => anyhow::bail!("Invalid runtime chat command"),
    })
}

fn format_duration(seconds: u64) -> String {
    let unit =
        |value: u64, name: &str| format!("{value} {name}{}", if value == 1 { "" } else { "s" });
    if seconds < 60 {
        return unit(seconds, "second");
    }
    if seconds < 3600 {
        return unit((seconds + 30) / 60, "minute");
    }
    let total_hours = seconds / 3600;
    let minutes = seconds / 60 - total_hours * 60;
    let days = (total_hours - 1) / 24;
    let hours = total_hours - days * 24;
    if days > 0 {
        format!(
            "{}, {}, and {}",
            unit(days, "day"),
            unit(hours, "hour"),
            unit(minutes, "minute")
        )
    } else {
        format!("{} and {}", unit(hours, "hour"), unit(minutes, "minute"))
    }
}

async fn dispatch(app: &App, session: Arc<Session>, input: &str) -> Result<()> {
    let _admission = app.admission.clone().read_owned().await;
    ensure!(
        app.accepting.load(Ordering::Acquire) && app.healthy() && session.active(),
        "Server unavailable"
    );
    let (command, mut data) = match protocol::parse(input) {
        Ok(parsed) => parsed,
        Err(_) => {
            session.emit(&frame(
                "warning",
                json!({"warning":"Invalid command data."}),
            ));
            return Ok(());
        }
    };
    let mut measurement = crate::metrics::COMMAND_METRICS.start(&command);
    let (reply, received) = oneshot::channel();
    app.hub
        .send(HubCommand::Directory {
            session: session.clone(),
            reply,
        })
        .await?;
    let online = received.await??;
    let caller = Caller {
        id: session.user,
        name: session.name.clone(),
        normalized_name: session.normalized_name.clone(),
        ip: session.ip.clone(),
        generation: session.generation,
    };
    let effects = if command == "chat" {
        let text = data["msg"].as_str().context("Missing message")?;
        let room = data["room"].as_str().context("Missing room")?;
        let mut rendered = None;
        if room == "lobby"
            && let Ok(normalized) = accounts::normalize_chat(text)
            && matches!(
                lobby::classify_chat(&normalized),
                lobby::Classification::Text | lobby::Classification::Public
            )
            && let Some(integrations) = app.integrations.get()
        {
            rendered = Some(integrations.render(&normalized).await);
        }
        lobby::dispatch_chat(
            &app.store.primary,
            &app.secret,
            &caller,
            text,
            room,
            rendered.as_deref(),
        )
        .await?
    } else if lobby::handles_command(&command) {
        lobby::dispatch(
            &app.store.primary,
            &app.secret,
            &caller,
            &online,
            &command,
            std::mem::take(&mut data),
        )
        .await?
    } else {
        None
    };
    if let Some(effects) = effects {
        publish(app, session, effects).await?;
        measurement.success();
        return Ok(());
    }
    ensure!(
        !accounts::is_banned(&app.store.primary, &session.ip).await?,
        "Your IP address has been banned."
    );
    if command == "chat" {
        data["publicBaseURL"] = json!(app.public_url(""));
    }
    if command == "chat"
        && let Some(message) = data["msg"].as_str()
        && let Ok(message) = accounts::normalize_chat(message)
        && let Some(lobby::GeneralResponse::Runtime { command, args }) =
            lobby::general_response(&message)
    {
        data["runtimeResponses"] = json!(runtime_response(app, &command, &args)?);
    }
    let (reply, received) = oneshot::channel();
    let request = if command == "getName" {
        HubCommand::Name { session, reply }
    } else {
        HubCommand::Client {
            session,
            command,
            data,
            reply,
        }
    };
    app.hub.send(request).await?;
    received.await??;
    measurement.success();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn origins_allow_real_browser_and_bots_but_not_cross_site() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "example.invalid".parse().unwrap());
        assert!(origin_allowed(&headers, "example.invalid", true));
        headers.insert(header::ORIGIN, "https://example.invalid".parse().unwrap());
        assert!(origin_allowed(&headers, "example.invalid", true));
        for origin in [
            "null",
            "https://evil.invalid",
            "http://example.invalid",
            "https://example.invalid:444",
            "https://example.invalid@evil.invalid",
            "https://example.invalid/path",
        ] {
            headers.insert(header::ORIGIN, origin.parse().unwrap());
            assert!(
                !origin_allowed(&headers, "example.invalid", true),
                "{origin}"
            );
        }
        headers.insert(header::HOST, "localhost:8080".parse().unwrap());
        headers.insert(header::ORIGIN, "http://localhost:8080".parse().unwrap());
        assert!(origin_allowed(&headers, "localhost", false));
    }
}
