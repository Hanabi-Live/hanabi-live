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
    http::{HeaderMap, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use hanabi_protocol::ClientMessage;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    future::Future,
    net::SocketAddr,
    sync::{
        Arc, OnceLock,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    task::Poll,
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// How long loading a connecting user's lobby statistics may take.
const LOBBY_LOAD_DEADLINE: Duration = Duration::from_secs(10);
/// How long after creating an account a user is still welcomed as a first-time user.
const FIRST_TIME_USER_WINDOW: chrono::TimeDelta = chrono::TimeDelta::seconds(10);
/// The lobby chat messages sent to a user who connects.
const LOBBY_HISTORY_MESSAGES: i64 = 50;
/// The most characters of a client-supplied value, such as an origin or a version, that a log
/// line repeats.
const MAX_LOGGED_CLIENT_TEXT: usize = 100;
/// The most WebSocket connections open at once.
const MAX_SOCKETS: usize = 4096;
/// The most lobby statistics loads that can run at once.
const LOBBY_SLOTS: usize = 64;
/// How long sending an error to a rejected or failed connection may take.
const ERROR_SEND_TIMEOUT: Duration = Duration::from_secs(5);
/// How long writing one frame to a connection may take before it is dropped.
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
/// How long sending the last frames to a closing connection may take.
const CLOSE_SEND_TIMEOUT: Duration = Duration::from_secs(1);
/// The received messages a connection queues before reading pauses.
const INBOUND_QUEUE: usize = 64;

pub struct App {
    pub store: Store,
    pub hub: mpsc::Sender<HubCommand>,
    pub secret: String,
    pub version: String,
    pub accepting: AtomicBool,
    pub connections: TaskTracker,
    pub background: TaskTracker,
    pub shutdown: CancellationToken,
    pub read_shutdown: CancellationToken,
    pub ownership_lost: CancellationToken,
    pub admission: Arc<tokio::sync::RwLock<()>>,
    generation: AtomicU64,
    sockets: Arc<Semaphore>,
    incoming_bytes: Arc<Semaphore>,
    lobby_slots: Arc<Semaphore>,
    public: PublicConfig,
    pub info: Arc<crate::server_info::ServerInfo>,
    integrations: OnceLock<Arc<Integrations>>,
    integration_started: AtomicBool,
}

impl App {
    pub fn is_development(&self) -> bool {
        self.public.is_dev
    }

    pub fn integration_status(&self) -> Value {
        self.integrations.get().map_or_else(
            || json!({"discord":"disabled"}),
            |integrations| integrations.status(),
        )
    }

    pub async fn announce_restart(&self, message: Option<&str>) {
        if let Some(integrations) = self.integrations.get() {
            integrations
                .announce_restart(self.info.uptime(), message)
                .await;
        }
    }

    pub async fn announce_stop(&self, message: Option<&str>) {
        if let Some(integrations) = self.integrations.get() {
            integrations
                .announce_stop(self.info.uptime(), message)
                .await;
        }
    }

    pub fn new(
        store: Store,
        hub: mpsc::Sender<HubCommand>,
        public: PublicConfig,
        ownership_lost: CancellationToken,
        info: Arc<crate::server_info::ServerInfo>,
    ) -> Arc<Self> {
        Arc::new(Self {
            store,
            hub,
            secret: public.session_secret.to_string(),
            version: public.client_version.to_string(),
            accepting: AtomicBool::new(true),
            generation: AtomicU64::new(1),
            sockets: Arc::new(Semaphore::new(MAX_SOCKETS)),
            incoming_bytes: Arc::new(Semaphore::new(crate::transport::GLOBAL_INPUT_BYTES)),
            lobby_slots: Arc::new(Semaphore::new(LOBBY_SLOTS)),
            connections: TaskTracker::new(),
            background: TaskTracker::new(),
            shutdown: CancellationToken::new(),
            read_shutdown: CancellationToken::new(),
            ownership_lost,
            admission: Arc::new(tokio::sync::RwLock::new(())),
            public,
            info,
            integrations: OnceLock::new(),
            integration_started: AtomicBool::new(false),
        })
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
            && !self.ownership_lost.is_cancelled()
            && self.store.check_state().is_ok()
    }

    pub fn alert(&self, report: &crate::errors::Report) {
        if let Some(integrations) = self.integrations.get() {
            integrations.report(report);
        }
    }

    pub fn public_url(&self, path: &str) -> String {
        self.info.public_url(path)
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
    public_http::router(app.store.lobby_reads.clone(), &app.public)
        .merge(authenticated)
        .fallback(|uri: Uri| async move { route_error(&uri, StatusCode::NOT_FOUND, "Not found.") })
        .method_not_allowed_fallback(|uri: Uri| async move {
            route_error(
                &uri,
                StatusCode::METHOD_NOT_ALLOWED,
                "This URL does not accept that method.",
            )
        })
        .layer(middleware::from_fn(reject_get_bodies))
        .layer(middleware::from_fn_with_state(app, alert_server_errors))
}

/// Whether a URL answers with JSON rather than an HTML page, which decides the form of its errors.
fn serves_json(path: &str) -> bool {
    path.starts_with("/api/")
        || path == "/export"
        || path.starts_with("/export/")
        || matches!(
            path,
            "/login" | "/logout" | "/test" | "/test-cookie" | "/ws"
        )
}

fn route_error(uri: &Uri, status: StatusCode, message: &str) -> Response {
    if serves_json(uri.path()) {
        accounts::api_error(status, message)
    } else {
        (status, message.to_owned()).into_response()
    }
}

/// Rejects a GET or HEAD request that has a body: no route reads one.
async fn reject_get_bodies(request: Request, next: Next) -> Response {
    let has_body = request.headers().contains_key(header::TRANSFER_ENCODING)
        || request
            .headers()
            .get(header::CONTENT_LENGTH)
            .is_some_and(|length| length.as_bytes() != b"0");
    if has_body
        && matches!(
            *request.method(),
            axum::http::Method::GET | axum::http::Method::HEAD
        )
    {
        return accounts::api_error(StatusCode::BAD_REQUEST, "GET requests cannot have a body.");
    }
    next.run(request).await
}

/// Posts HTTP server errors to the error alerts. Error responses carry their report (see
/// `Report::response`), so only failures the server reported are posted.
async fn alert_server_errors(
    State(app): State<Arc<App>>,
    request: Request,
    next: Next,
) -> Response {
    let response = next.run(request).await;
    if response.status().is_server_error()
        && let Some(report) = response.extensions().get::<crate::errors::Report>()
    {
        app.alert(report);
    }
    response
}

fn origin_allowed(headers: &HeaderMap, uri: &Uri, domain: &str, use_tls: bool) -> bool {
    use crate::tls::SITE_HOSTS;

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
    let header_host = match headers.get(header::HOST) {
        Some(value) => match value.to_str() {
            Ok(value) => Some(value),
            Err(_) => return false,
        },
        None => None,
    };
    let parse_host = |value: &str| {
        url::Url::parse(&format!("{scheme}://{value}"))
            .ok()
            .filter(|host| {
                host.path() == "/"
                    && host.query().is_none()
                    && host.fragment().is_none()
                    && host.username().is_empty()
                    && host.password().is_none()
            })
    };
    // HTTP/2 carries :authority in the request URI, not necessarily in a Host header.
    let Some(host) = uri
        .authority()
        .map(axum::http::uri::Authority::as_str)
        .or(header_host)
        .and_then(parse_host)
    else {
        return false;
    };
    if let Some(value) = header_host {
        let Some(header_host) = parse_host(value) else {
            return false;
        };
        if header_host.host_str() != host.host_str()
            || header_host.port_or_known_default() != host.port_or_known_default()
        {
            return false;
        }
    }
    let configured_host = origin.host_str() == configured.host_str()
        || (configured
            .host_str()
            .is_some_and(|host| SITE_HOSTS.contains(&host))
            && origin
                .host_str()
                .is_some_and(|host| SITE_HOSTS.contains(&host)));
    configured_host
        && origin.host_str() == host.host_str()
        && origin.port_or_known_default() == host.port_or_known_default()
        && (configured.port().is_none()
            || configured.port_or_known_default() == origin.port_or_known_default())
}

fn log_rejection(request: &Request, reason: &str) {
    let ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map_or("an unknown address".to_owned(), |ConnectInfo(address)| {
            address.ip().to_string()
        });
    // Clients control the origin, so it is escaped and shortened.
    let origin: String =
        request
            .headers()
            .get(header::ORIGIN)
            .map_or("no origin".to_owned(), |origin| {
                format!("{origin:?}")
                    .chars()
                    .take(MAX_LOGGED_CLIENT_TEXT)
                    .collect()
            });
    eprintln!(
        "Rejected {} from {ip} with {origin} because of {reason}.",
        request.uri().path()
    );
}

async fn check_origin(State(app): State<Arc<App>>, request: Request, next: Next) -> Response {
    if !origin_allowed(
        request.headers(),
        request.uri(),
        &app.public.domain,
        app.public.use_tls,
    ) {
        log_rejection(&request, "an invalid origin");
        return accounts::api_error(StatusCode::FORBIDDEN, "Invalid request origin.");
    }
    let _admission = app.admission.clone().read_owned().await;
    if !app.healthy() || !app.accepting.load(Ordering::Acquire) {
        log_rejection(&request, "the server draining");
        return accounts::api_error(
            StatusCode::SERVICE_UNAVAILABLE,
            "The server is draining for maintenance.",
        );
    }
    next.run(request).await
}

struct Bootstrap {
    name: String,
    normalized_name: String,
    bot: bool,
    blocks: Vec<i32>,
    welcome: hanabi_protocol::Welcome,
    initial: Vec<String>,
}

async fn bootstrap(app: &App, id: i32, ip: &str) -> Result<Bootstrap> {
    let pool = &app.store.primary;
    ensure!(
        !accounts::is_banned(pool, ip).await?,
        "Your IP address has been banned."
    );
    let row = sqlx::query!(
        "SELECT username,normalized_username,datetime_created,is_bot FROM users WHERE id=$1",
        id
    )
    .fetch_optional(pool)
    .await?
    .context("The authenticated user no longer exists.")?;
    let name: String = row.username.clone();
    let normalized_name: String = row.normalized_username.clone();
    let (settings, friends, blocks, muted) = tokio::try_join!(
        lobby::get_settings(pool, id),
        lobby::friends(pool, id),
        lobby::block_relations(pool, id),
        accounts::is_muted(pool, ip)
    )?;
    let created: DateTime<Utc> = row.datetime_created;
    let welcome = hanabi_protocol::Welcome {
        user_id: hanabi_protocol::UserId(id),
        username: name.clone(),
        total_games: None,
        muted,
        first_time_user: Utc::now() - created < FIRST_TIME_USER_WINDOW,
        settings,
        friends,
        playing_at_tables: vec![],
        discon_spectating_table: None,
        discon_shadowing_seat: None,
    };
    sqlx::query!(
        "UPDATE users SET datetime_last_login=NOW(),last_ip=$2 WHERE id=$1",
        id,
        ip
    )
    .execute(pool)
    .await?;
    Ok(Bootstrap {
        name,
        normalized_name,
        bot: row.is_bot,
        blocks,
        welcome,
        initial: vec![frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
        )],
    })
}

async fn lobby_initial(app: &App, id: i32) -> Result<(Vec<String>, i64)> {
    let pool = &app.store.lobby_reads;
    let total = crate::database::normal_game_count(pool, id, true).await?;
    let mut initial = vec![];
    let chat = lobby::lobby_history(pool, LOBBY_HISTORY_MESSAGES).await?;
    initial.push(frame(
        hanabi_protocol::server::CHAT_LIST,
        hanabi_protocol::ChatList {
            list: chat,
            unread: 0,
        },
    ));
    initial.push(frame(hanabi_protocol::server::CHAT, hanabi_protocol::Chat {
        room: Some("lobby".into()),
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
            hanabi_protocol::Chat {
                who: Some(String::new()),
                room: Some("lobby".into()),
                ..hanabi_protocol::Chat::new(
                    format!("[Server Notice] {}", text.trim()),
                    hanabi_protocol::ChatSource::Server,
                    crate::model::timestamp(Utc::now()),
                )
            },
        )),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    Ok((initial, total))
}

fn load_lobby(app: Arc<App>, session: Arc<Session>) {
    let Ok(session_slot) = session.lobby_load.clone().try_acquire_owned() else {
        session.emit(&frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
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
            () = app.read_shutdown.cancelled() => return,
            result = result => result,
        };
        let _admission = app.admission.read().await;
        if !app.accepting.load(Ordering::Acquire) || !app.healthy() || !session.active() {
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
                let report = crate::errors::Report::from_error("Loading lobby statistics", &error, Some(crate::store::LOBBY_READ_TIMEOUT));
                report.log();
                session.emit(&frame(
                    hanabi_protocol::server::LOBBY_STATUS,
                    hanabi_protocol::LobbyStatus::Error { total_games: (), message: Some(report.text()) },
                ));
            }
        }
    });
}

async fn websocket(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: Uri,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !app.healthy() || !app.accepting.load(Ordering::Acquire) {
        return crate::errors::Report::known("Opening a live connection", "server_unavailable",
            if app.healthy() { "The server is not accepting connections while it starts or drains for maintenance." } else { "Live-state recovery or ownership is unavailable. Wait for recovery before reconnecting." },
            StatusCode::SERVICE_UNAVAILABLE).response(true);
    }
    let query = match accounts::account_query(uri.query(), &["account", "version"]) {
        Ok(query) => query,
        Err(message) => return accounts::api_error(StatusCode::BAD_REQUEST, message),
    };
    let version = query.get("version").unwrap_or_default().to_owned();
    let ip = address.ip();
    let Some(id) = accounts::session_id(&headers, &app.secret, uri.query()) else {
        eprintln!("Rejected websocket from {ip} without a valid session.");
        return accounts::api_error(StatusCode::UNAUTHORIZED, "A valid session is required.");
    };
    match accounts::is_banned(&app.store.primary, &address.ip().to_string()).await {
        Ok(false) => {}
        Ok(true) => {
            eprintln!("Rejected websocket for account {id} from banned IP: {ip}");
            return accounts::banned();
        }
        Err(error) => {
            return crate::errors::Report::from_error(
                "Checking live-connection access",
                &error,
                Some(crate::store::DATABASE_TIMEOUT),
            )
            .response(true);
        }
    }
    match sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id=$1) AS \"value!\"",
        id
    )
    .fetch_one(&app.store.primary)
    .await
    {
        Ok(true) => {}
        Ok(false) => {
            eprintln!("Rejected websocket for deleted account {id} from IP: {ip}");
            return accounts::api_error(
                StatusCode::UNAUTHORIZED,
                "The account for this session no longer exists. Please sign in again.",
            );
        }
        Err(error) => {
            return crate::errors::Report::from_error(
                "Checking the live-connection account",
                &error.into(),
                Some(crate::store::DATABASE_TIMEOUT),
            )
            .response(true);
        }
    }
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
    let version_check = accounts::validate_client_version(&version, &app.version);
    if version == accounts::BOT_VERSION {
        eprintln!("Accepted bot websocket for account {id} from IP: {ip}");
        if let Err(error) = accounts::mark_bot(&app.store.primary, id).await {
            return crate::errors::Report::from_error(
                "Recording a bot connection",
                &error,
                Some(crate::store::DATABASE_TIMEOUT),
            )
            .response(true);
        }
    }
    upgrade
        .max_message_size(crate::transport::MAX_MESSAGE_BYTES)
        .max_frame_size(crate::transport::MAX_MESSAGE_BYTES)
        .on_upgrade(move |mut socket| async move {
            let tracker = app.connections.clone();
            tracker
                .track_future(async move {
                    let _slot = slot;
                    let result = match version_check {
                        Ok(()) => {
                            connection(
                                socket,
                                app.clone(),
                                id,
                                generation,
                                address.ip().to_string(),
                            )
                            .await
                        }
                        Err(message) => {
                            eprintln!(
                                "Rejected websocket for account {id} from {ip} with version: {:?}",
                                version
                                    .chars()
                                    .take(MAX_LOGGED_CLIENT_TEXT)
                                    .collect::<String>()
                            );
                            // Browsers cannot read HTTP errors from a failed WebSocket upgrade.
                            // Current clients reload on "outdatedClient"; the error that follows
                            // explains the problem when a reload did not help.
                            tokio::time::timeout(ERROR_SEND_TIMEOUT, async {
                                socket
                                    .send(Message::Text(
                                        frame(
                                            hanabi_protocol::server::OUTDATED_CLIENT,
                                            hanabi_protocol::Empty {},
                                        )
                                        .into(),
                                    ))
                                    .await?;
                                socket
                                    .send(Message::Text(
                                        frame(
                                            hanabi_protocol::server::ERROR,
                                            hanabi_protocol::ErrorNotice { error: message },
                                        )
                                        .into(),
                                    ))
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
                        let report = crate::errors::Report::from_error(
                            "WebSocket session",
                            &error,
                            Some(crate::store::DATABASE_TIMEOUT),
                        );
                        report.log();
                        app.alert(&report);
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
) -> Result<()> {
    let admission = app.admission.clone().read_owned().await;
    ensure!(
        app.accepting.load(Ordering::Acquire) && app.healthy(),
        "Server unavailable"
    );
    let data = match bootstrap(&app, id, &ip).await {
        Ok(data) => data,
        Err(error) => {
            let _ = tokio::time::timeout(
                ERROR_SEND_TIMEOUT,
                socket.send(Message::Text(
                    frame(
                        hanabi_protocol::server::ERROR,
                        hanabi_protocol::ErrorNotice {
                            error: "Account initialization failed.".into(),
                        },
                    )
                    .into(),
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
            h_group: data.welcome.settings.h_group_conventions,
            h_group_level: data.welcome.settings.h_group_level,
            bot: data.bot,
        },
        app.ownership_lost.clone(),
        Arc::new(move || !shutdown.is_cancelled() && store.check_state().is_ok()),
    );
    for other in data.blocks {
        session.set_blocked(other, true);
    }
    let (mut sink, mut stream) = socket.split();
    let writer_session = session.clone();
    let writer_shutdown = app.shutdown.clone();
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                ()=writer_session.cancel.cancelled()=>break,
                ()=writer_session.ownership_lost.cancelled()=>break,
                ()=writer_shutdown.cancelled()=>break,
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
                        ()=writer_session.ownership_lost.cancelled()=>None,
                        ()=writer_shutdown.cancelled()=>None,
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
            let message = frame(
                hanabi_protocol::server::ERROR,
                hanabi_protocol::ErrorNotice {
                    error: report.text(),
                },
            );
            let _ =
                tokio::time::timeout(CLOSE_SEND_TIMEOUT, sink.send(Message::Text(message.into())))
                    .await;
        }
        let _ = tokio::time::timeout(CLOSE_SEND_TIMEOUT, sink.send(Message::Close(None))).await;
    });
    let (incoming, mut commands) = mpsc::channel::<Inbound>(INBOUND_QUEUE);
    let incoming_bytes = InboundBudget::new(app.incoming_bytes.clone());
    let reader_session = session.clone();
    let reader_shutdown = app.shutdown.clone();
    let reader = tokio::spawn(async move {
        loop {
            tokio::select! {
                ()=reader_session.cancel.cancelled()=>break,
                ()=reader_session.ownership_lost.cancelled()=>break,
                ()=reader_shutdown.cancelled()=>break,
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
        load_lobby(app.clone(), session.clone());
        loop {
            let command = tokio::select! {
                ()=session.cancel.cancelled()=>break,
                ()=app.shutdown.cancelled()=>break,
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
                let failure = command_failure(&error, &command.text);
                if let Some(report) = &failure.report {
                    report.log();
                    if failure.alert {
                        app.alert(report);
                    }
                }
                let warning = failure.warning;
                session.emit(&frame(
                    hanabi_protocol::server::WARNING,
                    hanabi_protocol::Warning { warning },
                ));
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

/// What a player is told about a command that failed, and the report of a failure.
struct CommandFailure {
    warning: String,
    /// Absent for a rejection, which is the server working as intended.
    report: Option<crate::errors::Report>,
    /// Whether the failure is posted to the error alerts. For now, only failures of storage,
    /// services, and the runtime are.
    alert: bool,
}

fn command_failure(error: &anyhow::Error, command: &str) -> CommandFailure {
    if crate::errors::is_rejection(error) {
        return CommandFailure {
            warning: accounts::escape_html(&error.to_string()),
            report: None,
            alert: false,
        };
    }
    let internal = error.chain().any(|cause| {
        cause.is::<sqlx::Error>()
            || cause.is::<reqwest::Error>()
            || cause.is::<crate::errors::Fault>()
            || cause.is::<std::io::Error>()
            || cause.is::<tokio::time::error::Elapsed>()
            || cause.is::<tokio::task::JoinError>()
    });
    let name = protocol::command_name(command).unwrap_or("unknown command");
    let operation = match name {
        "historyGet" => "Loading game history".to_owned(),
        "historyGetSeed" => "Loading seed history".to_owned(),
        "setting" => "Saving preferences".to_owned(),
        _ => format!("Command {name}"),
    };
    let report = if internal {
        crate::errors::Report::from_error(
            operation,
            error,
            // History reads use the lobby read pool.
            Some(if matches!(name, "historyGet" | "historyGetSeed") {
                crate::store::LOBBY_READ_TIMEOUT
            } else {
                crate::store::DATABASE_TIMEOUT
            }),
        )
    } else {
        // The server wrote this description, so the player sees all of it.
        crate::errors::Report::known(
            operation,
            crate::errors::COMMAND_FAILED,
            format!("{error:#}"),
            StatusCode::INTERNAL_SERVER_ERROR,
        )
    };
    CommandFailure {
        warning: accounts::escape_html(&report.text()),
        report: Some(report),
        alert: internal,
    }
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
            Effect::RuntimeChat {
                command,
                args,
                room,
            } => {
                for message in app.info.runtime_response(&command, &args)? {
                    if command == "uptime" {
                        ordinary.push(lobby::notice(&session.name, &message, &room));
                        continue;
                    }
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

fn history_command(message: &ClientMessage) -> bool {
    matches!(
        message,
        ClientMessage::HistoryGet(_) | ClientMessage::HistoryGetSeed(_)
    )
}

async fn dispatch(app: &Arc<App>, session: Arc<Session>, input: &str) -> Result<()> {
    let _admission = app.admission.clone().read_owned().await;
    if !app.healthy() {
        return Err(crate::errors::Fault::new("live_state_unavailable",
            "Live-state recovery or ownership is unavailable. Do not repeat game actions; wait for recovery.",
            StatusCode::SERVICE_UNAVAILABLE).into());
    }
    if !app.accepting.load(Ordering::Acquire) {
        return Err(crate::errors::Fault::new(
            crate::errors::SERVER_DRAINING,
            "The server is not accepting new commands during startup or maintenance.",
            StatusCode::SERVICE_UNAVAILABLE,
        )
        .into());
    }
    ensure_or_reject!(
        session.active(),
        "This session was replaced or disconnected. Reconnect before sending commands."
    );
    let message = match protocol::parse(input) {
        Ok(parsed) => parsed,
        Err(error) => {
            let detail = if let Some(json) = error.downcast_ref::<serde_json::Error>() {
                format!(
                    "Invalid JSON at line {}, column: {}",
                    json.line(),
                    json.column()
                )
            } else {
                error.to_string()
            };
            let command = protocol::command_name(input).unwrap_or("unrecognized command");
            session.emit(&frame(
                hanabi_protocol::server::WARNING,
                hanabi_protocol::Warning {
                    warning: accounts::escape_html(&format!("Cannot process {command}: {detail}")),
                },
            ));
            return Ok(());
        }
    };
    let mut measurement = crate::metrics::COMMAND_METRICS.start(message.name());
    if let ClientMessage::LobbyLoad(_) = message {
        session.emit(&frame(
            hanabi_protocol::server::LOBBY_STATUS,
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
        ));
        load_lobby(app.clone(), session);
        measurement.success();
        return Ok(());
    }
    // Lobby commands write to the database before the hub publishes their effects, so confirm
    // that this session is still current first. The hub checks game commands itself when it
    // routes them. Only private messages need the list of online users.
    let online = if lobby::handles(&message) {
        let (reply, received) = oneshot::channel();
        app.hub
            .send(HubCommand::Directory {
                session: session.clone(),
                users: matches!(message, ClientMessage::ChatPM(_)),
                reply,
            })
            .await?;
        received.await??
    } else {
        Vec::new()
    };
    let caller = Caller {
        id: session.user,
        name: session.name.clone(),
        normalized_name: session.normalized_name.clone(),
        ip: session.ip.clone(),
        generation: session.generation,
    };
    let effects = match message {
        ClientMessage::Chat(request) => {
            let text = request.msg.as_str();
            let room = request.room.as_str();
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
            let effects = lobby::dispatch_chat(
                &app.store.primary,
                &app.secret,
                &caller,
                text,
                room,
                rendered.as_deref(),
            )
            .await?;
            // Table chat goes to its table.
            effects.ok_or(ClientMessage::Chat(request))
        }
        message if lobby::handles(&message) => {
            let history = history_command(&message);
            let work = lobby::dispatch(
                if history {
                    &app.store.lobby_reads
                } else {
                    &app.store.primary
                },
                &app.secret,
                &caller,
                &online,
                message,
            );
            let effects = if history {
                tokio::select! {
                    () = app.read_shutdown.cancelled() => return Ok(()),
                    result = work => result?,
                }
            } else {
                work.await?
            };
            Ok(effects.context("A lobby command had no lobby handler")?)
        }
        message => Err(message),
    };
    let message = match effects {
        Ok(effects) => {
            publish(app, session, effects).await?;
            measurement.success();
            return Ok(());
        }
        Err(message) => message,
    };
    let (reply, received) = oneshot::channel();
    let request = if let ClientMessage::Sync(_) = message {
        HubCommand::Sync { session, reply }
    } else {
        HubCommand::Client {
            session,
            message,
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
    fn command_failures_show_rejections_as_they_are_and_report_everything_else() {
        let command = r#"tableJoin {"tableID":1}"#;
        let rejected = command_failure(&rejection!("This table is full."), command);
        assert_eq!(rejected.warning, "This table is full.");
        assert!(rejected.report.is_none() && !rejected.alert);

        let unexpected = command_failure(
            &anyhow::anyhow!("Duplicate table installation").context("Installing the table"),
            command,
        );
        let report = unexpected.report.expect("reported failure");
        assert_eq!(report.code, crate::errors::COMMAND_FAILED);
        assert!(!unexpected.alert);
        assert_eq!(
            unexpected.warning,
            format!(
                "Command tableJoin failed: Installing the table: Duplicate table installation \
                 [Reference: {}]",
                report.diagnostic_id
            )
        );

        let storage = command_failure(&sqlx::Error::PoolClosed.into(), command);
        assert!(storage.alert && storage.report.is_some());
        assert!(!storage.warning.contains("PoolClosed"));
    }
    #[test]
    fn origins_allow_real_browser_and_bots_but_not_cross_site() {
        let uri = Uri::from_static("/login");
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "example.invalid".parse().unwrap());
        assert!(origin_allowed(&headers, &uri, "example.invalid", true));
        headers.insert(header::ORIGIN, "https://example.invalid".parse().unwrap());
        assert!(origin_allowed(&headers, &uri, "example.invalid", true));
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
                !origin_allowed(&headers, &uri, "example.invalid", true),
                "{origin}"
            );
        }
        headers.insert(header::HOST, "localhost:8080".parse().unwrap());
        headers.insert(header::ORIGIN, "http://localhost:8080".parse().unwrap());
        assert!(origin_allowed(&headers, &uri, "localhost", false));
    }

    #[test]
    fn origins_support_http2_and_site_aliases_without_allowing_cross_origin_requests() {
        for host in [
            "hanab.live",
            "hanabi.live",
            "www.hanab.live",
            "www.hanabi.live",
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::ORIGIN, format!("https://{host}").parse().unwrap());
            let uri: Uri = format!("https://{host}/login").parse().unwrap();
            assert!(origin_allowed(&headers, &uri, "hanab.live", true));
            assert!(!origin_allowed(&headers, &uri, "example.invalid", true));
            headers.insert(header::HOST, host.parse().unwrap());
            assert!(origin_allowed(
                &headers,
                &Uri::from_static("/login"),
                "hanab.live",
                true
            ));
            headers.insert(header::HOST, "evil.invalid".parse().unwrap());
            assert!(!origin_allowed(&headers, &uri, "hanab.live", true));
        }
        let mut headers = HeaderMap::new();
        headers.insert(header::ORIGIN, "https://hanabi.live".parse().unwrap());
        assert!(!origin_allowed(
            &headers,
            &Uri::from_static("https://hanab.live/login"),
            "hanab.live",
            true
        ));
        headers.insert(header::ORIGIN, "https://evil.invalid".parse().unwrap());
        assert!(!origin_allowed(
            &headers,
            &Uri::from_static("https://evil.invalid/login"),
            "hanab.live",
            true
        ));
    }
}
