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
    time::{Duration, Instant},
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

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
    pub lease_lost: CancellationToken,
    pub admission: Arc<tokio::sync::RwLock<()>>,
    generation: AtomicU64,
    sockets: Arc<Semaphore>,
    incoming_bytes: Arc<Semaphore>,
    lobby_slots: Arc<Semaphore>,
    public: PublicConfig,
    started: Instant,
    came_online: DateTime<Utc>,
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

    pub async fn announce_restart(&self) {
        if let Some(integrations) = self.integrations.get() {
            integrations.announce_restart(self.started.elapsed()).await;
        }
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
            lobby_slots: Arc::new(Semaphore::new(64)),
            connections: TaskTracker::new(),
            background: TaskTracker::new(),
            shutdown: CancellationToken::new(),
            read_shutdown: CancellationToken::new(),
            lease_lost,
            admission: Arc::new(tokio::sync::RwLock::new(())),
            public,
            started: Instant::now(),
            came_online: Utc::now(),
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
            && !self.lease_lost.is_cancelled()
            && self.store.check_state().is_ok()
    }

    pub fn telemetry(&self, report: &crate::errors::Report) {
        if let Some(integrations) = self.integrations.get() {
            integrations.report(report);
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
    public_http::router(app.store.lobby_reads.clone(), app.public.clone()).merge(authenticated)
}

fn origin_allowed(headers: &HeaderMap, uri: &Uri, domain: &str, use_tls: bool) -> bool {
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
        .map(|authority| authority.as_str())
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
    use crate::tls::SITE_HOSTS;
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

async fn check_origin(State(app): State<Arc<App>>, request: Request, next: Next) -> Response {
    if !origin_allowed(
        request.headers(),
        request.uri(),
        &app.public.domain,
        app.public.use_tls,
    ) {
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
    let row = sqlx::query!(
        "SELECT username,normalized_username,datetime_created FROM users WHERE id=$1",
        id
    )
    .fetch_optional(pool)
    .await?
    .context("The authenticated user no longer exists.")?;
    let name: String = row.username.clone();
    let normalized_name: String = row.normalized_username.clone();
    let (settings, friends, muted) = tokio::try_join!(
        lobby::get_settings(pool, id),
        lobby::friends(pool, id),
        accounts::is_muted(pool, ip)
    )?;
    let created: DateTime<Utc> = row.datetime_created;
    let welcome = json!({
        "userID":id,"username":name,"totalGames":null,
        "muted":muted,"firstTimeUser":(Utc::now()-created).num_milliseconds()<10000,
        "settings":settings,"friends":friends,"connectionMode":if reconnect {"reconnect"} else {"initial"},
        "playingAtTables":[],
        // Required by already-open clients; neither retired mode can be enabled.
        "shuttingDown":false,
        "maintenanceMode":false,
    });
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
        welcome,
        initial: vec![frame(
            "lobbyStatus",
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
        )],
    })
}

async fn lobby_initial(app: &App, id: i32, reconnect: bool) -> Result<(Vec<String>, i64)> {
    let pool = &app.store.lobby_reads;
    let total = crate::database::normal_game_count(pool, id, true).await?;
    let mut initial = vec![];
    if !reconnect {
        let chat = lobby::lobby_history(pool, 50).await?;
        initial.push(frame("chatList", json!({"list":chat,"unread":0})));
        initial.push(frame("chat", hanabi_protocol::Chat {
            room: Some("lobby".into()),
            ..hanabi_protocol::Chat::new(
                "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Discord chat</a>.",
                hanabi_protocol::ChatSource::Server,
                Utc::now().to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true),
            )
        }));
        let motd = app.public.root.join("motd.txt");
        match tokio::fs::read_to_string(motd).await {
            Ok(text) if !text.trim().is_empty() => initial.push(frame(
                "chat",
                hanabi_protocol::Chat {
                    who: Some(String::new()),
                    room: Some("lobby".into()),
                    ..hanabi_protocol::Chat::new(
                        format!("[Server Notice] {}", text.trim()),
                        hanabi_protocol::ChatSource::Server,
                        Utc::now().to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true),
                    )
                },
            )),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok((initial, total))
}

fn load_lobby(app: Arc<App>, session: Arc<Session>, reconnect: bool) {
    let Ok(session_slot) = session.lobby_load.clone().try_acquire_owned() else {
        session.emit(&frame(
            "lobbyStatus",
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
                Duration::from_secs(10),
                lobby_initial(&app, session.user, reconnect),
            )
            .await
            .map_err(|_| crate::errors::Fault::new(
                "lobby_load_timeout", "Loading lobby statistics exceeded the 10-second deadline. Please retry statistics.",
                StatusCode::GATEWAY_TIMEOUT))?
        };
        let result = tokio::select! {
            _ = session.cancel.cancelled() => return,
            _ = app.read_shutdown.cancelled() => return,
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
                    "lobbyStatus",
                    hanabi_protocol::LobbyStatus::Ready { total_games: total },
                ));
            }
            Err(error) => {
                let report = crate::errors::Report::from_error("Loading lobby statistics", &error, Some(2));
                report.log();
                session.emit(&frame(
                    "lobbyStatus",
                    hanabi_protocol::LobbyStatus::Error { total_games: (), message: Some(report.text()) },
                ));
            }
        }
    });
}

async fn websocket(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: axum::http::Uri,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !app.healthy() || !app.accepting.load(Ordering::Acquire) {
        return crate::errors::Report::known("Opening a live connection", "server_unavailable",
            if !app.healthy() { "Live-state recovery or ownership is unavailable. Wait for recovery before reconnecting." }
            else { "The server is not accepting connections while it starts or drains for maintenance." },
            StatusCode::SERVICE_UNAVAILABLE).response(false);
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
        Err(error) => {
            return crate::errors::Report::from_error(
                "Checking live-connection access",
                &error,
                Some(30),
            )
            .response(false);
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
            return (
                StatusCode::UNAUTHORIZED,
                "The account for this session no longer exists. Please sign in again.",
            )
                .into_response();
        }
        Err(error) => {
            return crate::errors::Report::from_error(
                "Checking the live-connection account",
                &error.into(),
                Some(30),
            )
            .response(false);
        }
    }
    let Ok(slot) = app.sockets.clone().try_acquire_owned() else {
        return crate::errors::Report::known(
            "Opening a live connection",
            "connection_limit",
            "The server has reached its live-connection limit. Please retry shortly.",
            StatusCode::SERVICE_UNAVAILABLE,
        )
        .response(false);
    };
    let Ok(generation) = app
        .generation
        .try_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
    else {
        return crate::errors::Report::known("Opening a live connection", "session_generation_exhausted",
            "The server's session identifier space is exhausted. An administrator must restart the server.",
            StatusCode::SERVICE_UNAVAILABLE).response(false);
    };
    let reconnect = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
        .any(|(key, value)| key == "reconnect" && value == "1");
    let fast_resume = url::form_urlencoded::parse(uri.query().unwrap_or("").as_bytes())
        .any(|(key, value)| key == "fastResume" && value == "1");
    upgrade
        .max_message_size(crate::transport::MAX_MESSAGE_BYTES)
        .max_frame_size(crate::transport::MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| async move {
            let tracker = app.connections.clone();
            tracker
                .track_future(async move {
                    let _slot = slot;
                    if let Err(error) = connection(
                        socket,
                        app.clone(),
                        id,
                        generation,
                        address.ip().to_string(),
                        reconnect,
                        fast_resume,
                    )
                    .await
                    {
                        let report = crate::errors::Report::from_error(
                            "WebSocket session",
                            &error,
                            Some(30),
                        );
                        report.log();
                        app.telemetry(&report);
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
    fast_resume: bool,
) -> Result<()> {
    let admission = app.admission.clone().read_owned().await;
    ensure!(
        app.accepting.load(Ordering::Acquire) && app.healthy(),
        "Server unavailable"
    );
    let data = match async {
        let mut data = bootstrap(&app, id, &ip, reconnect).await?;
        if !fast_resume {
            // Older clients require a numeric total and the original bootstrap ordering.
            let (initial, total) = lobby_initial(&app, id, reconnect).await?;
            data.welcome["totalGames"] = json!(total);
            data.initial = initial;
        }
        Ok::<_, anyhow::Error>(data)
    }
    .await
    {
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
        if fast_resume {
            load_lobby(app.clone(), session.clone(), false);
        }
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
                        || cause.is::<crate::errors::Fault>()
                        || cause.is::<std::io::Error>()
                        || cause.is::<tokio::time::error::Elapsed>()
                        || cause.is::<tokio::task::JoinError>()
                });
                let warning = if internal {
                    let name = protocol::command_name(&command.text).unwrap_or("unknown command");
                    let operation = match name {
                        "historyGet" => "Loading game history".to_owned(),
                        "historyGetSeed" => "Loading seed history".to_owned(),
                        "setting" => "Saving preferences".to_owned(),
                        _ => format!("Command {name}"),
                    };
                    let report = crate::errors::Report::from_error(
                        operation,
                        &error,
                        Some(if history_command(name) { 2 } else { 30 }),
                    );
                    report.log();
                    app.telemetry(&report);
                    accounts::escape_html(&report.text())
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
            Effect::RuntimeChat {
                command,
                args,
                room,
            } => {
                for message in runtime_response(app, &command, &args)? {
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

fn history_command(command: &str) -> bool {
    matches!(command, "historyGet" | "historyGetSeed" | "chatPlayerInfo")
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
            "server_draining",
            "The server is not accepting new commands during startup or maintenance.",
            StatusCode::SERVICE_UNAVAILABLE,
        )
        .into());
    }
    ensure!(
        session.active(),
        "This session was replaced or disconnected. Reconnect before sending commands."
    );
    let (command, mut data) = match protocol::parse(input) {
        Ok(parsed) => parsed,
        Err(error) => {
            let detail = if let Some(json) = error.downcast_ref::<serde_json::Error>() {
                format!(
                    "Invalid JSON at line {}, column {}.",
                    json.line(),
                    json.column()
                )
            } else {
                error.to_string()
            };
            let command = protocol::command_name(input).unwrap_or("unrecognized command");
            session.emit(&frame(
                "warning",
                json!({"warning":accounts::escape_html(&format!("Cannot process {command}: {detail}"))}),
            ));
            return Ok(());
        }
    };
    let mut measurement = crate::metrics::COMMAND_METRICS.start(&command);
    if command == "lobbyLoad" {
        session.emit(&frame(
            "lobbyStatus",
            hanabi_protocol::LobbyStatus::Loading { total_games: () },
        ));
        load_lobby(app.clone(), session, false);
        measurement.success();
        return Ok(());
    }
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
        let request = hanabi_protocol::decode::<hanabi_protocol::ChatRequest>(&data)?;
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
        let history = history_command(&command);
        let work = lobby::dispatch(
            if history {
                &app.store.lobby_reads
            } else {
                &app.store.primary
            },
            &app.secret,
            &caller,
            &online,
            &command,
            std::mem::take(&mut data),
        );
        if history {
            tokio::select! {
                _ = app.read_shutdown.cancelled() => return Ok(()),
                result = work => result?,
            }
        } else {
            work.await?
        }
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
    let request = if command == "sync" {
        HubCommand::Sync { session, reply }
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
