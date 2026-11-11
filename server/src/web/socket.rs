//! The WebSocket connection: its sign-in, its first lobby messages, and the tasks that read and
//! write its frames.

use super::{
    App, MAX_LOGGED_CLIENT_TEXT,
    dispatch::{command_failure, dispatch},
    user,
};
use crate::errors::HttpError;
use crate::{
    accounts,
    actors::{HubCommand, request},
    lobby,
    transport::{Frame, Identity, Inbound, InboundBudget, Outbound, Session, frame},
};
use anyhow::{Context, Result};
use axum::{
    extract::{
        ConnectInfo, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, Uri},
    response::Response,
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use hanabi_protocol::UserId;
use std::{
    future::Future,
    net::SocketAddr,
    sync::{Arc, atomic::Ordering},
    task::Poll,
    time::Duration,
};
use tokio::sync::mpsc;
use tracing::Instrument;

/// How long loading a connecting user's lobby statistics may take.
const LOBBY_LOAD_DEADLINE: Duration = Duration::from_secs(10);
/// How long after creating an account a user is still welcomed as a first-time user.
const FIRST_TIME_USER_WINDOW: chrono::TimeDelta = chrono::TimeDelta::seconds(10);
/// The lobby chat messages sent to a user who connects.
const LOBBY_HISTORY_MESSAGES: i64 = 50;
/// How long sending an error to a rejected or failed connection may take.
const ERROR_SEND_TIMEOUT: Duration = Duration::from_secs(5);
/// How long writing one frame to a connection may take before it is dropped.
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
/// How long sending the last frames to a closing connection may take.
const CLOSE_SEND_TIMEOUT: Duration = Duration::from_secs(1);
/// The received messages a connection queues before reading pauses.
const INBOUND_QUEUE: usize = 64;
/// How often the server pings a connection. The pings keep idle connections open through
/// routers that drop quiet ones, and let `RECEIVE_TIMEOUT` find connections that have died.
const PING_INTERVAL: Duration = Duration::from_secs(30);
/// How long a connection may send nothing, not even a reply to a ping, before it is closed.
const RECEIVE_TIMEOUT: Duration = Duration::from_secs(60);

/// The account that a live connection signs in to, as `websocket` reads it before the upgrade.
pub(super) struct Account {
    pub(super) id: UserId,
    pub(super) name: String,
    pub(super) normalized_name: String,
    pub(super) created: DateTime<Utc>,
    pub(super) bot: bool,
}

impl Account {
    /// Reads the account with `id`, if it still exists.
    pub(super) async fn read(pool: &sqlx::PgPool, id: i32) -> sqlx::Result<Option<Self>> {
        Ok(sqlx::query!(
            "SELECT username,normalized_username,datetime_created,is_bot FROM users WHERE id=$1",
            id
        )
        .fetch_optional(pool)
        .await?
        .map(|row| Self {
            id: UserId(id),
            name: row.username,
            normalized_name: row.normalized_username,
            created: row.datetime_created,
            bot: row.is_bot,
        }))
    }
}

pub(super) struct Bootstrap {
    pub(super) name: String,
    pub(super) normalized_name: String,
    pub(super) bot: bool,
    pub(super) blocks: Vec<UserId>,
    pub(super) welcome: hanabi_protocol::Welcome,
    pub(super) initial: Vec<Frame>,
}

pub(super) async fn bootstrap(app: &App, account: Account, ip: &str) -> Result<Bootstrap> {
    let pool = &app.store.primary;
    let Account {
        id,
        name,
        normalized_name,
        created,
        bot,
    } = account;
    let (settings, friends, blocked, blocks, muted) = tokio::try_join!(
        lobby::get_settings(pool, id),
        lobby::friends(pool, id),
        lobby::blocked(pool, id),
        lobby::block_relations(pool, id),
        accounts::is_muted(pool, ip)
    )?;
    let welcome = hanabi_protocol::Welcome {
        user_id: id,
        username: name.clone(),
        muted,
        first_time_user: Utc::now() - created < FIRST_TIME_USER_WINDOW,
        settings,
        friends,
        blocked,
        playing_at_tables: vec![],
        spectating_at_table: None,
    };
    sqlx::query!(
        "UPDATE users SET datetime_last_login=NOW(),last_ip=$2 WHERE id=$1",
        id.0,
        ip
    )
    .execute(pool)
    .await?;
    Ok(Bootstrap {
        name,
        normalized_name,
        bot,
        blocks,
        welcome,
        initial: vec![frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading {},
        )],
    })
}

pub(super) async fn lobby_initial(app: &App, id: UserId) -> Result<(Vec<Frame>, i64)> {
    let pool = &app.store.lobby_reads;
    let total = crate::database::normal_game_count(pool, id, true).await?;
    let mut initial = vec![];
    let chat = lobby::lobby_history(pool, LOBBY_HISTORY_MESSAGES).await?;
    initial.push(frame(
        hanabi_protocol::server::CHAT_LIST,
        hanabi_protocol::ChatList {
            messages: chat,
            unread: 0,
        },
    ));
    initial.push(frame(hanabi_protocol::server::CHAT, hanabi_protocol::Chat {
        ..hanabi_protocol::Chat::new(
            "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>.",
            hanabi_protocol::ChatSource::Server,
            crate::model::timestamp(Utc::now()),
        )
    }));
    let motd = app.public.root.join("motd.txt");
    match tokio::fs::read_to_string(motd).await {
        Ok(text) if !text.trim().is_empty() => initial.push(frame(
            hanabi_protocol::server::CHAT,
            hanabi_protocol::Chat::new(
                format!("[Server Notice] {}", text.trim()),
                hanabi_protocol::ChatSource::Server,
                crate::model::timestamp(Utc::now()),
            ),
        )),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok((initial, total))
}

pub(super) fn load_lobby(app: Arc<App>, session: Arc<Session>) {
    let Ok(session_slot) = session.lobby_load.clone().try_acquire_owned() else {
        session.emit(&frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading {},
        ));
        return;
    };
    let slot = app.lobby_slots.clone().try_acquire_owned();
    let tracker = app.background.clone();
    tracker.spawn(async move {
        let _session_slot = session_slot;
        let result = async {
            let _slot = slot.map_err(|_| crate::errors::Fault::new(
                "lobby_queue_full", "The lobby read queue is full. Please retry statistics shortly.",
                StatusCode::SERVICE_UNAVAILABLE))?;
            tokio::time::timeout(
                LOBBY_LOAD_DEADLINE,
                lobby_initial(&app, session.user),
            )
            .await
            .map_err(|_| crate::errors::Fault::new(
                "lobby_load_timeout",
                format!(
                    "Loading lobby statistics exceeded the {}-second deadline. Please retry statistics.",
                    LOBBY_LOAD_DEADLINE.as_secs()
                ),
                StatusCode::GATEWAY_TIMEOUT))?
        };
        let result = tokio::select! {
            () = session.cancel.cancelled() => return,
            () = app.lifecycle.read_shutdown.cancelled() => return,
            result = result => result,
        };
        let Ok(_admission) = app.lifecycle.admit().await else {
            return;
        };
        if !session.active() {
            return;
        }
        match result {
            Ok((messages, total)) => {
                for message in messages {
                    session.emit(&message);
                }
                session.emit(&frame(
                    hanabi_protocol::server::LOBBY_STATUS,
                    hanabi_protocol::LobbyStatus::Ready { total_games: total },
                ));
            }
            Err(error) => {
                let report = crate::errors::Report::from_error(
                    "Loading lobby statistics",
                    &error.context(crate::errors::LobbyRead),
                );
                report.log();
                session.emit(&frame(
                    hanabi_protocol::server::LOBBY_STATUS,
                    hanabi_protocol::LobbyStatus::Error { message: Some(report.text()) },
                ));
            }
        }
    });
}

pub(super) async fn websocket(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: Uri,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !app.lifecycle.healthy() || !app.lifecycle.accepting() {
        return crate::errors::Report::known("Opening a live connection", "server_unavailable",
            if app.lifecycle.healthy() { "The server is not accepting connections while it starts or drains for maintenance." } else { "Live-state recovery or ownership is unavailable. Wait for recovery before reconnecting." },
            StatusCode::SERVICE_UNAVAILABLE).response(true);
    }
    let query = match accounts::account_query(uri.query(), &["account", "version"]) {
        Ok(query) => query,
        Err(message) => {
            return HttpError::refused(StatusCode::BAD_REQUEST, message).json();
        }
    };
    let version = query.get("version").unwrap_or_default().to_owned();
    let ip = address.ip();
    let Some(id) = accounts::session_id(&headers, &app.public.session_secret, uri.query()) else {
        tracing::warn!("Rejected websocket from {ip} without a valid session.");
        return HttpError::refused(StatusCode::UNAUTHORIZED, "A valid session is required.").json();
    };
    match accounts::is_banned(&app.store.primary, &address.ip().to_string()).await {
        Ok(false) => {}
        Ok(true) => {
            tracing::warn!("Rejected websocket for account {id} from banned IP: {ip}");
            return accounts::banned();
        }
        Err(error) => {
            return crate::errors::Report::from_error("Checking live-connection access", &error)
                .response(true);
        }
    }
    let account = match Account::read(&app.store.primary, id).await {
        Ok(Some(account)) => Account {
            // A bot's first connection marks the account below.
            bot: account.bot || version == accounts::BOT_VERSION,
            ..account
        },
        Ok(None) => {
            tracing::warn!("Rejected websocket for deleted account {id} from IP: {ip}");
            return HttpError::refused(
                StatusCode::UNAUTHORIZED,
                "The account for this session no longer exists. Please sign in again.",
            )
            .json();
        }
        Err(error) => {
            return crate::errors::Report::from_error(
                "Checking the live-connection account",
                &error.into(),
            )
            .response(true);
        }
    };
    let Ok(slot) = app.sockets.clone().try_acquire_owned() else {
        return crate::errors::Report::known(
            "Opening a live connection",
            "connection_limit",
            "The server has reached its live-connection limit. Please retry shortly.",
            StatusCode::SERVICE_UNAVAILABLE,
        )
        .response(true);
    };
    let Ok(generation) = app
        .generation
        .try_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
    else {
        return crate::errors::Report::known("Opening a live connection", "session_generation_exhausted",
            "The server's session identifier space is exhausted. An administrator must restart the server.",
            StatusCode::SERVICE_UNAVAILABLE).response(true);
    };
    let version_check = accounts::validate_client_version(&version, &app.public.client_version);
    if version == accounts::BOT_VERSION {
        tracing::info!("Accepted bot websocket for account {id} from IP: {ip}");
        if let Err(error) = accounts::mark_bot(&app.store.primary, id).await {
            return crate::errors::Report::from_error("Recording a bot connection", &error)
                .response(true);
        }
    }
    let span = tracing::info_span!("session", user = %id, generation);
    upgrade
        .max_message_size(crate::transport::MAX_MESSAGE_BYTES)
        .max_frame_size(crate::transport::MAX_MESSAGE_BYTES)
        .on_upgrade(move |mut socket| async move {
            let tracker = app.connections.clone();
            tracker
                .track_future(
                    async move {
                    let _slot = slot;
                    let result = match version_check {
                        Ok(()) => {
                            connection(
                                socket,
                                app.clone(),
                                account,
                                generation,
                                address.ip().to_string(),
                            )
                            .await
                        }
                        Err(message) => {
                            tracing::warn!(
                                "Rejected websocket for account {id} from {ip} with version: {:?}",
                                version
                                    .chars()
                                    .take(MAX_LOGGED_CLIENT_TEXT)
                                    .collect::<String>()
                            );
                            // Browsers cannot read HTTP errors from a failed WebSocket upgrade.
                            // Clients reload on "outdatedClient"; the error that follows explains
                            // the problem when a reload did not help. Clients of every earlier
                            // release read these two messages, so they must keep this form.
                            tokio::time::timeout(ERROR_SEND_TIMEOUT, async {
                                socket
                                    .send(Message::Text(frame(
                                        hanabi_protocol::server::OUTDATED_CLIENT,
                                        hanabi_protocol::Empty {},
                                    )))
                                    .await?;
                                socket
                                    .send(Message::Text(frame(
                                        hanabi_protocol::server::ERROR,
                                        hanabi_protocol::Notice::new(message),
                                    )))
                                    .await?;
                                socket.close().await
                            })
                            .await
                            .context("Timed out reporting an incompatible client version")
                            .and_then(|result| {
                                result.context("Reporting an incompatible client version")
                            })
                        }
                    };
                    if let Err(error) = result {
                        let report = crate::errors::Report::from_error("WebSocket session", &error);
                        report.log();
                        app.alert(&report);
                    }
                    }
                    .instrument(span),
                )
                .await;
        })
}

async fn connection(
    mut socket: WebSocket,
    app: Arc<App>,
    account: Account,
    generation: u64,
    ip: String,
) -> Result<()> {
    let id = account.id;
    let admission = app
        .lifecycle
        .admit()
        .await
        .map_err(|refusal| anyhow::anyhow!("Server unavailable: {refusal:?}"))?;
    let data = match bootstrap(&app, account, &ip).await {
        Ok(data) => data,
        Err(error) => {
            let _ = tokio::time::timeout(
                ERROR_SEND_TIMEOUT,
                socket.send(Message::Text(frame(
                    hanabi_protocol::server::ERROR,
                    hanabi_protocol::Notice::new("Account initialization failed."),
                ))),
            )
            .await;
            return Err(error);
        }
    };
    let (session, mut outgoing) = Session::with_token(
        Identity {
            user: id,
            name: data.name,
            normalized_name: data.normalized_name,
            ip,
            bot: data.bot,
        },
        generation,
        app.lifecycle.connection_token(),
        app.outgoing_bytes.clone(),
    );
    let (mut sink, mut stream) = socket.split();
    let writer_session = session.clone();
    let writer = tokio::spawn(async move {
        let mut ping = tokio::time::interval_at(
            tokio::time::Instant::now() + PING_INTERVAL,
            PING_INTERVAL,
        );
        ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                ()=writer_session.cancel.cancelled()=>break,
                _=ping.tick()=>{
                    let sent=tokio::time::timeout(WRITE_TIMEOUT,sink.send(Message::Ping(axum::body::Bytes::new()))).await;
                    if !matches!(sent,Ok(Ok(()))) {break;}
                }
                next=outgoing.recv()=>{
                    let Some(Outbound {message,permit,completion,global_permit})=next else {break;};
                    let send=sink.send(message);
                    tokio::pin!(send);
                    // Recheck live-table ownership on every poll, including the first poll
                    // after a stalled executor resumes.
                    let guarded=futures_util::future::poll_fn(|cx| {
                        if writer_session.active() {send.as_mut().poll(cx).map(Some)} else {Poll::Ready(None)}
                    });
                    let result=tokio::select! {
                        ()=writer_session.cancel.cancelled()=>None,
                        result=tokio::time::timeout(WRITE_TIMEOUT,guarded)=>result.ok().flatten(),
                    };
                    drop(permit);
                    drop(global_permit);
                    if !matches!(result,Some(Ok(()))) {break;}
                    if let Some(completion)=completion {let _=completion.send(());break;}
                }
            }
        }
        writer_session.cancel.cancel();
        if writer_session.was_superseded() {
            let report = crate::errors::Report::known(
                "Keeping the live connection",
                crate::errors::SESSION_REPLACED,
                "This account connected in another browser tab or window. Reconnect here only if you want to move the connection back.",
                StatusCode::CONFLICT,
            );
            report.log();
            let message = frame(hanabi_protocol::server::ERROR, report.notice());
            let _ =
                tokio::time::timeout(CLOSE_SEND_TIMEOUT, sink.send(Message::Text(message)))
                    .await;
        }
        let _ = tokio::time::timeout(CLOSE_SEND_TIMEOUT, sink.send(Message::Close(None))).await;
    }.in_current_span());
    let (incoming, mut commands) = mpsc::channel::<Inbound>(INBOUND_QUEUE);
    let incoming_bytes = InboundBudget::new(app.incoming_bytes.clone());
    let reader_session = session.clone();
    let reader = tokio::spawn(async move {
        loop {
            tokio::select! {
                ()=reader_session.cancel.cancelled()=>break,
                next=tokio::time::timeout(RECEIVE_TIMEOUT,stream.next())=>match next {
                    Err(_)=>{
                        tracing::info!("Closing a connection that sent nothing for {} seconds.",RECEIVE_TIMEOUT.as_secs());
                        break;
                    }
                    Ok(next)=>match next {
                    Some(Ok(Message::Text(text)))=>{
                        let Some(message)=incoming_bytes.admit(&reader_session,&text) else {break;};
                        if incoming.try_send(message).is_err() {
                            tracing::warn!("Closing connection with a saturated input command queue.");
                            reader_session.cancel.cancel();
                            break;
                        }
                    }
                    Some(Ok(Message::Ping(_)|Message::Pong(_)))=>{},
                    _=>break,
                    },
                }
            }
        }
        reader_session.cancel.cancel();
    }.in_current_span());
    let result = async {
        request(&app.hub, |reply| HubCommand::Register {
            session: session.clone(),
            blocks: data.blocks.into_iter().collect(),
            welcome: data.welcome,
            initial: data.initial,
            reply,
        })
        .await?
        .map_err(anyhow::Error::from)?;
        let user = app.users.task(&app, session.user);
        user.send(user::UserCommand::Current(session.generation))
            .await?;
        drop(admission);
        load_lobby(app.clone(), session.clone());
        loop {
            let command = tokio::select! {
                ()=session.cancel.cancelled()=>break,
                command=commands.recv()=>command,
            };
            let Some(command) = command else {
                break;
            };
            // Once admitted, finish persistence rather than dropping a transaction
            // future on socket cancellation. Publication still checks generation.
            if let Err(error) = dispatch(&app, &user, session.clone(), &command.text).await {
                let Some(failure) = command_failure(error, &command.text) else {
                    continue;
                };
                if let Some(report) = &failure.report {
                    report.log();
                    if failure.alert {
                        app.alert(report);
                    }
                }
                session.emit(&frame(hanabi_protocol::server::WARNING, failure.warning));
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
