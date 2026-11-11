//! The bridge between the lobby chat and a Discord server. Twilight's gateway receives Discord's
//! events, and its HTTP client sends the requests.

use super::{Server, alerts::Alerts};
use crate::transport::Outgoing;
use crate::{
    accounts::{escape_html, normalize_chat},
    actors::{HubCommand, request},
    lobby::{self, ExternalReply, SavedChat},
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use std::{
    collections::{HashMap, HashSet},
    fmt::Write as _,
    ops::RangeInclusive,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU8, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, mpsc};
use twilight_gateway::{
    CloseFrame, Event, EventTypeFlags, Intents, Shard, ShardId, StreamExt as _,
};
use twilight_http::Client;
use twilight_model::{
    channel::{ChannelType, message::AllowedMentions},
    id::{
        Id,
        marker::{ChannelMarker, GenericMarker, GuildMarker, RoleMarker, UserMarker},
    },
};

const RESTART_PREFIX: &str = "The server went down for a restart at:";
const STOP_PREFIX: &str = "The server is stopping gracefully at:";
/// The digits in a Discord identifier (a snowflake).
const SNOWFLAKE_DIGITS: RangeInclusive<usize> = 17..=20;
/// How long a Discord HTTP request may take.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
/// How long closing the gateway connection may take during shutdown.
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);
/// The gateway events queued before the gateway reader waits.
const EVENT_QUEUE: usize = 1000;
/// How long resolving Discord mentions in a message may take before the raw text is used.
const RENDER_TIMEOUT: Duration = Duration::from_secs(5);
/// The gateway intents we identify with.
const INTENTS: Intents = Intents::GUILDS
    .union(Intents::GUILD_MESSAGES)
    .union(Intents::DIRECT_MESSAGES)
    .union(Intents::MESSAGE_CONTENT);
/// The gateway events that the bridge handles. The gateway always sends its close events.
const EVENTS: EventTypeFlags = EventTypeFlags::READY
    .union(EventTypeFlags::RESUMED)
    .union(EventTypeFlags::MESSAGE_CREATE)
    .union(EventTypeFlags::MESSAGE_DELETE)
    .union(EventTypeFlags::MESSAGE_DELETE_BULK);

fn is_snowflake(id: &str) -> bool {
    SNOWFLAKE_DIGITS.contains(&id.len()) && id.bytes().all(|b| b.is_ascii_digit())
}

/// The Discord identifier that configuration field `key` holds.
fn configured_id<T>(key: &str, value: &str) -> Result<Id<T>> {
    value
        .parse()
        .ok()
        .filter(|_| is_snowflake(value))
        .with_context(|| {
            crate::errors::Fault::new(
                hanabi_protocol::NoticeCode::DiscordConfiguration,
                format!(
                    "{key} must contain a {}-{} digit Discord identifier.",
                    SNOWFLAKE_DIGITS.start(),
                    SNOWFLAKE_DIGITS.end()
                ),
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            )
        })
}

#[derive(Clone)]
pub struct Configuration {
    token: String,
    guild: Id<GuildMarker>,
    lobby: Id<ChannelMarker>,
    development: Id<ChannelMarker>,
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
                        hanabi_protocol::NoticeCode::DiscordConfiguration,
                        format!("Required configuration field {key} is missing or empty."),
                        axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    )
                })
        };
        Ok(Some(Self {
            token: value(TOKEN)?,
            guild: configured_id(GUILD, &value(GUILD)?)?,
            lobby: configured_id(LOBBY, &value(LOBBY)?)?,
            development: configured_id(DEVELOPMENT, &value(DEVELOPMENT)?)?,
            ping_role: value(PING_ROLE)?,
            teacher_role: value(TEACHER_ROLE)?,
        }))
    }

    /// An HTTP client for Discord that uses the configured token.
    fn client(&self) -> Client {
        Client::builder()
            .token(self.token.clone())
            .timeout(REQUEST_TIMEOUT)
            .build()
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
    server: Server,
    pool: PgPool,
    config: Configuration,
    http: Client,
    bot_id: Id<UserMarker>,
    outbound: Mutex<()>,
    incoming: Mutex<()>,
    status: AtomicU8,
    announced: AtomicBool,
}

impl Bridge {
    /// Connects to Discord and checks the configured roles and channels. `listen` then starts
    /// receiving its events. Tests pass their own `http` client.
    pub async fn start(
        server: Server,
        config: Configuration,
        http: Option<Client>,
    ) -> Result<Arc<Self>> {
        let http = http.unwrap_or_else(|| config.client());
        let bot_id = http.current_user().await?.model().await?.id;
        let roles = roles(&http, config.guild).await?;
        for (key, configured) in [
            ("DISCORD_PING_CREW_ROLE_NAME", &config.ping_role),
            ("DISCORD_TRUSTED_TEACHER_ROLE_NAME", &config.teacher_role),
        ] {
            if !roles.values().any(|name| name == configured) {
                return Err(crate::errors::Fault::new(
                    hanabi_protocol::NoticeCode::DiscordRoleMissing,
                    format!("The role configured by {key} was not found in the Discord guild."),
                    axum::http::StatusCode::BAD_GATEWAY,
                )
                .into());
            }
        }
        for (key, channel) in [
            ("DISCORD_CHANNEL_SYNC_WITH_LOBBY", config.lobby),
            ("DISCORD_CHANNEL_WEBSITE_DEVELOPMENT", config.development),
        ] {
            let channel = http.channel(channel).await?.model().await?;
            if channel.guild_id != Some(config.guild)
                || !matches!(
                    channel.kind,
                    ChannelType::GuildText | ChannelType::GuildAnnouncement
                )
            {
                return Err(crate::errors::Fault::new(hanabi_protocol::NoticeCode::DiscordChannelInvalid,
                    format!("The channel configured by {key} is not a text/announcement channel in the configured guild."),
                    axum::http::StatusCode::BAD_GATEWAY).into());
            }
        }
        Ok(Arc::new(Self {
            pool: server.pool.clone(),
            server,
            config,
            http,
            bot_id,
            outbound: Mutex::new(()),
            incoming: Mutex::new(()),
            status: AtomicU8::new(Status::Connecting as u8),
            announced: AtomicBool::new(false),
        }))
    }

    /// Connects to Discord's gateway and handles its events until the server shuts down. A failed
    /// event is reported to `alerts`.
    pub fn listen(self: &Arc<Self>, alerts: Arc<Alerts>) {
        let server = &self.server;
        let (events, receiver) = mpsc::channel(EVENT_QUEUE);
        let mut shard = Shard::new(ShardId::ONE, self.config.token.clone(), INTENTS);
        let lifecycle = server.lifecycle.clone();
        // The shard reconnects and resumes by itself.
        server.background.spawn(async move {
            loop {
                let next = tokio::select! {
                    ()=lifecycle.ownership_lost.cancelled()=>return,
                    ()=lifecycle.shutdown().cancelled()=>break,
                    next=shard.next_event(EVENTS)=>next,
                };
                match next {
                    None => return,
                    Some(Ok(event)) => {
                        if events.try_send(event).is_err() {
                            tracing::error!("Discord event capacity exhausted; dropping an event.");
                        }
                    }
                    Some(Err(error)) => {
                        crate::errors::Report::from_error(
                            "Receiving a Discord gateway event",
                            &error.into(),
                        )
                        .log();
                    }
                }
            }
            shard.close(CloseFrame::NORMAL);
            // The shard sends its close frame as it is polled.
            let _ = tokio::time::timeout(CLOSE_TIMEOUT, async {
                while let Some(next) = shard.next_event(EventTypeFlags::empty()).await {
                    if matches!(next, Ok(Event::GatewayClose(_))) {
                        break;
                    }
                }
            })
            .await;
        });
        self.handle(receiver, alerts);
    }

    /// Handles the gateway's events from `receiver` until the server shuts down.
    pub(super) fn handle(
        self: &Arc<Self>,
        mut receiver: mpsc::Receiver<Event>,
        alerts: Arc<Alerts>,
    ) {
        let inbound = self.clone();
        let lifecycle = self.server.lifecycle.clone();
        self.server.background.spawn(async move {
            loop {
                let event = tokio::select! {
                    ()=lifecycle.shutdown().cancelled()=>break,
                    event=receiver.recv()=>event,
                };
                let Some(event) = event else {
                    break;
                };
                let Ok(_admission) = lifecycle.admit().await else {
                    continue;
                };
                if let Err(error) = inbound.event(event).await {
                    inbound.set_status(Status::Degraded);
                    let report =
                        crate::errors::Report::from_error("Processing Discord event", &error);
                    report.log();
                    alerts.report(&report);
                }
            }
            inbound.set_status(Status::Closed);
        });
    }

    /// Fails once the server is shutting down or has lost ownership of the live tables.
    fn available(&self) -> Result<()> {
        ensure!(
            self.server.lifecycle.healthy(),
            "Server ownership unavailable"
        );
        Ok(())
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

    async fn channel_name(&self, id: Id<ChannelMarker>) -> Option<String> {
        self.http.channel(id).await.ok()?.model().await.ok()?.name
    }

    async fn nickname(&self, id: Id<UserMarker>) -> String {
        let member = async {
            self.http
                .guild_member(self.config.guild, id)
                .await
                .ok()?
                .model()
                .await
                .ok()
        };
        member.await.map_or_else(
            || "[error]".into(),
            |member| member.nick.unwrap_or(member.user.name),
        )
    }

    async fn current_roles(&self) -> Result<HashMap<Id<RoleMarker>, String>> {
        roles(&self.http, self.config.guild).await
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
            let Some(id) = id
                .parse()
                .ok()
                .filter(|_| is_snowflake(id))
                .and_then(Id::<GenericMarker>::new_checked)
            else {
                continue;
            };
            let matched = capture.get(0).expect("group 0 is the whole match");
            result.push_str(&escape_html(&text[offset..matched.start()]));
            let name = match &capture[1] {
                "#" => format!(
                    "#{}",
                    self.channel_name(id.cast())
                        .await
                        .unwrap_or_else(|| "[error]".into())
                ),
                "@&" => format!(
                    "@{}",
                    self.current_roles()
                        .await
                        .ok()
                        .and_then(|mut roles| roles.remove(&id.cast()))
                        .unwrap_or_else(|| "[unknown role]".into())
                ),
                _ => format!("@{}", self.nickname(id.cast()).await),
            };
            result.push_str(&escape_html(&name));
            offset = matched.end();
        }
        result.push_str(&escape_html(&text[offset..]));
        spoilers(&result)
    }

    async fn send(&self, text: &str, roles: bool) -> Result<String> {
        self.send_to(self.config.lobby, text, roles).await
    }

    /// Posts `text` to `channel`, and returns the message's ID. With `roles`, the message can
    /// mention the ping and teacher roles; it never mentions anyone else.
    async fn send_to(&self, channel: Id<ChannelMarker>, text: &str, roles: bool) -> Result<String> {
        let roles = if roles {
            self.current_roles()
                .await?
                .into_iter()
                .filter(|(_, name)| {
                    *name == self.config.ping_role || *name == self.config.teacher_role
                })
                .map(|(id, _)| id)
                .collect()
        } else {
            Vec::new()
        };
        let mentions = AllowedMentions {
            roles,
            ..AllowedMentions::default()
        };
        self.available()?;
        let message = self
            .http
            .create_message(channel)
            .content(text)
            .allowed_mentions(Some(&mentions))
            .await?
            .model()
            .await?;
        Ok(message.id.to_string())
    }

    /// Posts a server error alert to the development channel, without mentions.
    pub async fn alert(&self, text: &str) -> Result<()> {
        self.send_to(self.config.development, text, false).await?;
        Ok(())
    }
    pub async fn mirror(&self, chat_id: i32, supplied: Option<&str>) -> Result<()> {
        let _guard = self.outbound.lock().await;
        self.available()?;
        let row=sqlx::query!("SELECT c.message,c.source,c.discord_message_id,u.username FROM chat_log c
             LEFT JOIN users u ON u.id=c.user_id WHERE c.id=$1 AND c.table_id IS NULL AND c.deleted_at IS NULL", chat_id).fetch_optional(&self.pool).await?;
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
            self.broadcast(vec![Outgoing::new(
                hanabi_protocol::server::CHAT_DELETE,
                hanabi_protocol::ChatDelete {
                    chat_id: hanabi_protocol::ChatId(i64::from(chat_id)),
                },
            )])
            .await?;
        }
        Ok(())
    }

    /// Sends messages to everyone in the lobby.
    async fn broadcast(&self, messages: Vec<Outgoing>) -> Result<()> {
        self.available()?;
        request(&self.server.hub, |reply| HubCommand::Broadcast {
            messages,
            reply,
        })
        .await?
        .map_err(anyhow::Error::from)
    }

    /// Publishes server messages saved to the lobby chat, then copies them to Discord.
    async fn publish_saved(&self, saved: Vec<SavedChat>) -> Result<()> {
        let mut messages = vec![];
        let mut mirrors = vec![];
        for chat in saved {
            messages.push(chat.broadcast);
            mirrors.push(chat.chat_id);
        }
        self.broadcast(messages).await?;
        for id in mirrors {
            self.mirror(id, None).await?;
        }
        Ok(())
    }

    /// Publishes the reply to a public chat command from Discord.
    async fn publish_reply(&self, reply: Option<ExternalReply>) -> Result<()> {
        let saved = match reply {
            None => return Ok(()),
            Some(ExternalReply::Saved(saved)) => vec![saved],
            Some(ExternalReply::Runtime { command, args }) => {
                self.available()?;
                let mut saved = vec![];
                for response in self.server.info.runtime_response(&command, &args)? {
                    saved.push(lobby::server_chat(&self.pool, &response).await?);
                }
                saved
            }
        };
        self.publish_saved(saved).await
    }

    /// Posts a lifecycle message to the development channel. With `lobby`, also saves it to the
    /// lobby chat and posts it to the lobby channel.
    async fn announce(&self, message: &str, lobby: bool) -> Result<()> {
        self.available()?;
        let plain = decode_html(message);
        if !lobby {
            self.send_to(self.config.development, &plain, true)
                .await
                .context("Sending lifecycle announcement to the development channel")?;
            return Ok(());
        }
        let saved = lobby::server_chat(&self.pool, message).await?;
        // Poll both deliveries to completion; a slow or failed channel must not cancel the other.
        let (lobby, development) = tokio::join!(
            self.publish_saved(vec![saved]),
            self.send_to(self.config.development, &plain, true),
        );
        lobby.context("Sending lifecycle announcement to the lobby channel")?;
        development.context("Sending lifecycle announcement to the development channel")?;
        Ok(())
    }

    /// Only a restart with a reason is announced in the lobby.
    pub async fn announce_restart(&self, uptime: Duration, message: Option<&str>) -> Result<()> {
        self.announce(
            &format!(
                "{RESTART_PREFIX} {} ({}) - Uptime: {}{}",
                Utc::now().format("%a %b %d %H:%M:%S UTC %Y"),
                crate::restart::version(),
                crate::lifecycle::duration(uptime.as_secs()),
                downtime_reason(message),
            ),
            message.is_some(),
        )
        .await
    }

    pub async fn announce_stop(&self, uptime: Duration, message: Option<&str>) -> Result<()> {
        self.announce(
            &format!(
                "{STOP_PREFIX} {} ({}) - Uptime: {}{}",
                Utc::now().format("%a %b %d %H:%M:%S UTC %Y"),
                crate::restart::version(),
                crate::lifecycle::duration(uptime.as_secs()),
                downtime_reason(message),
            ),
            true,
        )
        .await
    }

    pub async fn event(&self, event: Event) -> Result<()> {
        let _guard = self.incoming.lock().await;
        self.available()?;
        match event {
            Event::Ready(_) | Event::Resumed => {
                self.set_status(Status::Ready);
                if !self.announced.swap(true, Ordering::AcqRel) {
                    let now = Utc::now();
                    let mut message = format!(
                        "The server has successfully started at: {} ({})",
                        now.format("%a %b %d %H:%M:%S UTC %Y"),
                        crate::restart::version(),
                    );
                    // A restart without a reason was not announced in the lobby, so neither is
                    // the startup that follows it.
                    let quiet = self.server.info.quiet_restart();
                    let down = match quiet {
                        Some(time) => Some(time),
                        None => last_shutdown(&self.pool).await?,
                    };
                    if let Some(down) = down {
                        let seconds = (now - down).num_seconds().max(0).unsigned_abs();
                        write!(
                            message,
                            " - Downtime: {}",
                            crate::lifecycle::duration(seconds)
                        )?;
                    }
                    self.announce(&message, quiet.is_none()).await?;
                }
            }
            Event::GatewayClose(_) => {
                self.set_status(Status::Degraded);
            }
            Event::MessageCreate(message) => {
                if message.guild_id != Some(self.config.guild)
                    || message.channel_id != self.config.lobby
                    || message.author.id == self.bot_id
                {
                    return Ok(());
                }
                let id = message.id.to_string();
                let author = message.author.id;
                let content = message.content.as_str();
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
                let inserted =
                    insert_message(&self.pool, Some(&name), &rendered, Some(&id)).await?;
                let Some((chat_id, time)) = inserted else {
                    return Ok(());
                };
                if let Some(subscription) = subscription {
                    self.subscribe(author, &name, subscription == "/subscribe")
                        .await?;
                } else {
                    self.broadcast(vec![Outgoing::new(
                        hanabi_protocol::server::CHAT,
                        hanabi_protocol::Chat {
                            chat_id: Some(hanabi_protocol::ChatId(i64::from(chat_id))),
                            username: Some(name.clone().into()),
                            ..hanabi_protocol::Chat::new(
                                rendered,
                                hanabi_protocol::ChatSource::Discord,
                                hanabi_protocol::Timestamp::from(time),
                            )
                        },
                    )])
                    .await?;
                    if class == lobby::Classification::Public {
                        self.publish_reply(lobby::external_command(&self.pool, &text).await?)
                            .await?;
                    }
                }
            }
            Event::MessageDelete(deleted) if deleted.channel_id == self.config.lobby => {
                self.delete(&[deleted.id.to_string()]).await?;
            }
            Event::MessageDeleteBulk(deleted) if deleted.channel_id == self.config.lobby => {
                let ids = deleted
                    .ids
                    .iter()
                    .map(ToString::to_string)
                    .collect::<HashSet<_>>();
                self.delete(&ids.into_iter().collect::<Vec<_>>()).await?;
            }
            _ => {}
        }
        Ok(())
    }

    /// Removes the lobby copies of Discord messages that were deleted.
    async fn delete(&self, ids: &[String]) -> Result<()> {
        for id in ids {
            if let Some(chat_id) = delete_message(&self.pool, id).await? {
                self.broadcast(vec![Outgoing::new(
                    hanabi_protocol::server::CHAT_DELETE,
                    hanabi_protocol::ChatDelete {
                        chat_id: hanabi_protocol::ChatId(i64::from(chat_id)),
                    },
                )])
                .await?;
            }
        }
        Ok(())
    }

    async fn subscribe(&self, author: Id<UserMarker>, name: &str, add: bool) -> Result<()> {
        let current = self.current_roles().await?;
        let role = current
            .iter()
            .find(|(_, name)| *name == &self.config.ping_role)
            .map(|(id, _)| *id)
            .context("Subscription role missing")?;
        let response = if add {
            self.http
                .add_guild_member_role(self.config.guild, author, role)
                .await
        } else {
            self.http
                .remove_guild_member_role(self.config.guild, author, role)
                .await
        };
        if let Err(error) = response {
            let report = crate::errors::Report::from_error(
                "Updating Discord subscription role",
                &error.into(),
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
        if let Some((id, time)) = insert_message(&self.pool, None, &rendered, None).await? {
            self.broadcast(vec![Outgoing::new(
                hanabi_protocol::server::CHAT,
                hanabi_protocol::Chat {
                    chat_id: Some(hanabi_protocol::ChatId(i64::from(id))),
                    ..hanabi_protocol::Chat::new(
                        rendered,
                        hanabi_protocol::ChatSource::Discord,
                        hanabi_protocol::Timestamp::from(time),
                    )
                },
            )])
            .await?;
        }
        self.send(&format!("`@{name}` {action} the `@Ping Crew`."), false)
            .await?;
        Ok(())
    }
}

/// The roles of `guild`, by ID.
async fn roles(http: &Client, guild: Id<GuildMarker>) -> Result<HashMap<Id<RoleMarker>, String>> {
    Ok(http
        .roles(guild)
        .await?
        .model()
        .await?
        .into_iter()
        .map(|role| (role.id, role.name))
        .collect())
}

/// When the most recent server announcement is a graceful shutdown, returns when it was sent.
async fn last_shutdown(pool: &PgPool) -> Result<Option<DateTime<Utc>>> {
    let row = sqlx::query!(
        "SELECT message,datetime_sent FROM chat_log WHERE table_id IS NULL AND source='server'
         ORDER BY datetime_sent DESC,id DESC LIMIT 1"
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
    name: Option<&str>,
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
        "INSERT INTO chat_log(user_id,source,discord_name,message,discord_message_id)
         VALUES(NULL,'discord',$1,$2,$3)
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
        "INSERT INTO chat_log(user_id,source,message,discord_message_id,deleted_at)
         VALUES(NULL,'discord','',$1,NOW())
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
        deleted=sqlx::query!("UPDATE chat_log SET message='',discord_name=NULL,deleted_at=NOW() WHERE id=$1 AND table_id IS NULL AND deleted_at IS NULL", chat_id).execute(&mut *tx).await?.rows_affected()>0;
    } else {
        sqlx::query!("UPDATE chat_log SET discord_message_id=$2 WHERE id=$1 AND table_id IS NULL AND deleted_at IS NULL", chat_id, id).execute(&mut *tx).await?;
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
            insert_message(&db.pool, Some("name"), "must not resurrect", Some(id))
                .await
                .unwrap()
                .is_none()
        );
        assert!(delete_message(&db.pool, id).await.unwrap().is_none());
        let live = "222222222222222222";
        let (one, two) = tokio::join!(
            insert_message(&db.pool, Some("name"), "one", Some(live)),
            insert_message(&db.pool, Some("name"), "two", Some(live))
        );
        assert_ne!(one.unwrap().is_some(), two.unwrap().is_some());
        let author = db.user("Alice").await;
        let chat: i32 = sqlx::query_scalar!(
            "INSERT INTO chat_log(user_id,source,message) VALUES($1,'user','message') RETURNING id",
            author
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert!(link_copy(&db.pool, chat, id).await.unwrap());
        let row = sqlx::query!(
            "SELECT user_id,message,deleted_at FROM chat_log WHERE id=$1",
            chat
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        assert_eq!(row.user_id, Some(author));
        assert_eq!(row.message, "");
        assert!(row.deleted_at.is_some());
        db.close().await;
    }
}
