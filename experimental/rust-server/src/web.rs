use crate::{
    actors::{Command, HubCommand},
    cookie,
    game::{Action, Card},
    model::Snapshot,
    store::Store,
    transport::{Outbound, Session, frame},
};
use anyhow::{Context, Result, bail, ensure};
use argon2::{
    Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString,
};
use axum::{
    Form, Router,
    extract::{
        ConnectInfo, DefaultBodyLimit, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use futures_util::{SinkExt, StreamExt};
use rand::rngs::OsRng;
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use std::{
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Semaphore, mpsc, oneshot};
use tokio_util::task::TaskTracker;

pub struct App {
    pub store: Store,
    pub hub: mpsc::Sender<HubCommand>,
    pub secret: String,
    pub version: String,
    pub accepting: AtomicBool,
    pub generation: AtomicU64,
    pub hashing: Arc<Semaphore>,
    pub sockets: Arc<Semaphore>,
    pub connections: TaskTracker,
}

pub fn router(app: Arc<App>) -> Router {
    Router::new()
        .route(
            "/",
            get(|| async { "Rust benchmark PoC; not a production server.\n" }),
        )
        .route("/login", post(login))
        .route("/ws", get(websocket))
        .layer(DefaultBodyLimit::max(8192))
        .with_state(app)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    username: String,
    password: String,
    version: String,
}

async fn login(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Form(input): Form<Login>,
) -> Response {
    if headers.contains_key(header::ORIGIN) || !app.accepting.load(Ordering::Acquire) {
        return (
            StatusCode::FORBIDDEN,
            "This PoC accepts local benchmark clients only.",
        )
            .into_response();
    }
    if input.version != app.version
        || input.username.is_empty()
        || input.username.len() > 15
        || !input
            .username
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        || input.password.is_empty()
        || input.password.len() > 1024
    {
        return (StatusCode::BAD_REQUEST, "Unsupported login input.").into_response();
    }
    let Ok(permit) = app.hashing.clone().try_acquire_owned() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Password worker capacity exhausted.",
        )
            .into_response();
    };
    match login_inner(&app, input, address.ip().to_string(), permit).await {
        Ok(Some(id)) => match cookie::encode(id, &app.secret, Utc::now().timestamp()) {
            Ok(value) => (
                [(
                    header::SET_COOKIE,
                    format!(
                        "hanabi.sid={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000"
                    ),
                )],
                "OK\n",
            )
                .into_response(),
            Err(error) => {
                eprintln!("Session encoding failed: {error}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Session failure.").into_response()
            }
        },
        Ok(None) => (
            StatusCode::UNAUTHORIZED,
            "That is not the correct password.",
        )
            .into_response(),
        Err(error) => {
            eprintln!("Login failed: {error}");
            (StatusCode::INTERNAL_SERVER_ERROR, "Login failed.").into_response()
        }
    }
}

async fn login_inner(
    app: &App,
    input: Login,
    ip: String,
    permit: tokio::sync::OwnedSemaphorePermit,
) -> Result<Option<i32>> {
    let banned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM banned_ips WHERE ip=$1)")
        .bind(&ip)
        .fetch_one(&app.store.primary)
        .await?;
    ensure!(!banned, "Banned IP");
    let normalized = input.username.to_ascii_lowercase();
    let row = sqlx::query(
        "SELECT id,password_hash,old_password_hash FROM users WHERE normalized_username=$1",
    )
    .bind(&normalized)
    .fetch_optional(&app.store.primary)
    .await?;
    if let Some(row) = row {
        ensure!(
            row.try_get::<Option<String>, _>("old_password_hash")?
                .is_none(),
            "Legacy password upgrades are outside this PoC"
        );
        let id: i32 = row.try_get("id")?;
        let hash: String = row.try_get("password_hash")?;
        let valid = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            PasswordHash::new(&hash)
                .map(|hash| {
                    Argon2::default()
                        .verify_password(input.password.as_bytes(), &hash)
                        .is_ok()
                })
                .map_err(|error| anyhow::anyhow!("Invalid stored password hash: {error}"))
        })
        .await??;
        if !valid {
            return Ok(None);
        }
        sqlx::query("UPDATE users SET datetime_last_login=NOW(),last_ip=$2 WHERE id=$1")
            .bind(id)
            .bind(ip)
            .execute(&app.store.primary)
            .await?;
        return Ok(Some(id));
    }
    let password = input.password;
    let hash = tokio::task::spawn_blocking(move || -> Result<String> {
        let _permit = permit;
        let params =
            Params::new(65536, 3, 4, Some(32)).map_err(|error| anyhow::anyhow!("{error}"))?;
        let algorithm = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
        Ok(algorithm
            .hash_password(password.as_bytes(), &SaltString::generate(&mut OsRng))
            .map_err(|error| anyhow::anyhow!("Password hash failed: {error}"))?
            .to_string())
    })
    .await??;
    let id = sqlx::query_scalar(
        "INSERT INTO users(username,normalized_username,password_hash,last_ip) VALUES($1,$2,$3,$4)
        ON CONFLICT(normalized_username) DO NOTHING RETURNING id",
    )
    .bind(input.username)
    .bind(normalized)
    .bind(hash)
    .bind(ip)
    .fetch_optional(&app.store.primary)
    .await?;
    ensure!(
        id.is_some(),
        "Account was registered concurrently; retry login"
    );
    Ok(id)
}

fn settings() -> Value {
    json!({"desktopNotification":false,"soundMove":0,"soundTimer":true,"keldonMode":false,
        "colorblindMode":false,"realLifeMode":false,"reverseHands":false,"styleNumbers":false,
        "showTimerInUntimed":false,"volume":50,"speedrunPreplay":false,"speedrunMode":false,
        "hyphenatedConventions":false,"createTableVariant":"No Variant","createTableTimed":false,
        "createTableTimeBaseMinutes":2,"createTableTimePerTurnSeconds":20,"createTableSpeedrun":false,
        "createTableCardCycle":false,"createTableDeckPlays":false,"createTableEmptyClues":false,
        "createTableOneExtraCard":false,"createTableOneLessCard":false,"createTableAllOrNothing":false,
        "createTableDetrimentalCharacters":false,"createTableMaxPlayers":5})
}
fn camel(input: &str) -> String {
    let mut uppercase = false;
    input
        .chars()
        .filter_map(|c| {
            if c == '_' {
                uppercase = true;
                None
            } else if uppercase {
                uppercase = false;
                Some(c.to_ascii_uppercase())
            } else {
                Some(c)
            }
        })
        .collect()
}

async fn histories(store: &Store, ids: &[i32]) -> Result<Value> {
    if ids.is_empty() {
        return Ok(json!([]));
    }
    let rows=sqlx::query("SELECT g.*,
        (SELECT jsonb_agg(u.username ORDER BY LOWER(u.username)) FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id) names,
        (SELECT count(*) FROM games x WHERE x.seed=g.seed) seed_count,
        (SELECT count(*) FROM game_tags WHERE game_id=g.id) tag_count
        FROM games g WHERE EXISTS(SELECT 1 FROM game_participants p WHERE p.game_id=g.id AND p.user_id=ANY($1))
        ORDER BY g.id DESC LIMIT 100").bind(ids).fetch_all(&store.primary).await?;
    let mut result = Vec::new();
    for row in rows {
        crate::store::validate_standard_record(&row)?;
        ensure!(
            row.try_get::<i64, _>("tag_count")? == 0,
            "Authored tags are outside this PoC"
        );
        result.push(json!({"id":row.try_get::<i32,_>("id")?,"options":crate::game::options(),
            "seed":row.try_get::<String,_>("seed")?,"score":row.try_get::<i16,_>("score")?,
            "numTurns":row.try_get::<i16,_>("num_turns")?,"endCondition":row.try_get::<i16,_>("end_condition")?,
            "datetimeStarted":row.try_get::<DateTime<Utc>,_>("datetime_started")?,
            "datetimeFinished":row.try_get::<DateTime<Utc>,_>("datetime_finished")?,
            "numGamesOnThisSeed":row.try_get::<i64,_>("seed_count")?,"playerNames":row.try_get::<Value,_>("names")?,
            "incrementNumGames":false,"tags":""}));
    }
    Ok(json!(result))
}

async fn bootstrap(store: &Store, id: i32, ip: &str) -> Result<(String, Value, Vec<String>)> {
    let row=sqlx::query("SELECT u.username,u.datetime_created,
        (SELECT count(*) FROM game_participants WHERE user_id=u.id) total,
        (SELECT to_jsonb(s)-'user_id' FROM user_settings s WHERE s.user_id=u.id LIMIT 1) settings,
        (SELECT COALESCE(jsonb_agg(f.friend_id),'[]'::jsonb) FROM user_friends f WHERE f.user_id=u.id) friends,
        (SELECT COALESCE(jsonb_agg(v.username ORDER BY LOWER(v.username)),'[]'::jsonb) FROM user_friends f JOIN users v ON v.id=f.friend_id WHERE f.user_id=u.id) friend_names,
        EXISTS(SELECT 1 FROM muted_ips WHERE ip=$2) muted, EXISTS(SELECT 1 FROM banned_ips WHERE ip=$2) banned
        FROM users u WHERE u.id=$1").bind(id).bind(ip).fetch_optional(&store.primary).await?.context("Unknown account")?;
    ensure!(!row.try_get::<bool, _>("banned")?, "Banned account");
    let name: String = row.try_get("username")?;
    let mut preferences = settings();
    if let Some(Value::Object(stored)) = row.try_get::<Option<Value>, _>("settings")? {
        for (key, value) in stored {
            preferences[camel(&key)] = value;
        }
    }
    let friend_ids: Vec<i32> = serde_json::from_value(row.try_get("friends")?)?;
    let own_ids = [id];
    let (own, friends) =
        tokio::try_join!(histories(store, &own_ids), histories(store, &friend_ids))?;
    let rows=sqlx::query("SELECT c.id,c.message,c.source,c.datetime_sent,
        CASE WHEN c.source='discord' THEN c.discord_name ELSE COALESCE(u.username,'Hanab Live') END who
        FROM chat_log c LEFT JOIN users u ON u.id=c.user_id
        WHERE c.room='lobby' AND c.deleted_at IS NULL ORDER BY c.datetime_sent DESC,c.id DESC LIMIT 50")
        .fetch_all(&store.primary).await?;
    let mut chat = Vec::new();
    for row in rows.into_iter().rev() {
        chat.push(json!({"chatID":row.try_get::<i32,_>("id")?,"msg":row.try_get::<String,_>("message")?,
            "source":row.try_get::<String,_>("source")?,"who":row.try_get::<Option<String>,_>("who")?.unwrap_or_else(||"Hanab Live".into()),
            "datetime":row.try_get::<DateTime<Utc>,_>("datetime_sent")?,"room":"lobby"}));
    }
    sqlx::query("UPDATE users SET datetime_last_login=NOW(),last_ip=$2 WHERE id=$1")
        .bind(id)
        .bind(ip)
        .execute(&store.primary)
        .await?;
    let created: DateTime<Utc> = row.try_get("datetime_created")?;
    let welcome = json!({"userID":id,"username":name,"totalGames":row.try_get::<i64,_>("total")?,
        "muted":row.try_get::<bool,_>("muted")?,"firstTimeUser":(Utc::now()-created).num_seconds()<10,
        "settings":preferences,"connectionMode":"initial","friends":row.try_get::<Value,_>("friend_names")?,
        "playingAtTables":[],"randomTableName":"","shuttingDown":false,"maintenanceMode":false});
    let mut initial = vec![
        frame("chatList", json!({"list":chat,"unread":0})),
        frame("gameHistory", own),
    ];
    if !friend_ids.is_empty() {
        initial.push(frame("gameHistoryFriends", friends));
    }
    Ok((name, welcome, initial))
}

async fn websocket(
    State(app): State<Arc<App>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if headers.contains_key(header::ORIGIN) || !app.accepting.load(Ordering::Acquire) {
        return (
            StatusCode::FORBIDDEN,
            "This PoC is restricted to benchmark clients.",
        )
            .into_response();
    }
    let encoded = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| {
            value
                .split(';')
                .filter_map(|field| field.trim().split_once('='))
                .find(|(name, _)| *name == cookie::NAME)
                .map(|(_, value)| value)
        });
    let Some(id) =
        encoded.and_then(|value| cookie::decode(value, &app.secret, Utc::now().timestamp()).ok())
    else {
        return (StatusCode::UNAUTHORIZED, "A valid session is required.").into_response();
    };
    let Ok(slot) = app.sockets.clone().try_acquire_owned() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "Connection capacity exhausted.",
        )
            .into_response();
    };
    let generation = match app
        .generation
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
    {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::SERVICE_UNAVAILABLE, "Session IDs exhausted.").into_response();
        }
    };
    upgrade
        .max_message_size(8192)
        .max_frame_size(8192)
        .on_upgrade(move |socket| async move {
            let connections = app.connections.clone();
            connections
                .track_future(async move {
                    let _slot = slot;
                    if let Err(error) =
                        connection(socket, app, id, generation, address.ip().to_string()).await
                    {
                        eprintln!("WebSocket session failed: {error}");
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
    let (name, welcome, initial) = match bootstrap(&app.store, id, &ip).await {
        Ok(data) => data,
        Err(error) => {
            let _ = socket
                .send(Message::Text(
                    frame("error", json!({"error":"Account initialization failed."})).into(),
                ))
                .await;
            return Err(error);
        }
    };
    let hyphenated = welcome["settings"]["hyphenatedConventions"]
        .as_bool()
        .context("Malformed account settings")?;
    let (session, mut outgoing) = Session::new(id, name, generation, hyphenated);
    let (mut sink, mut stream) = socket.split();
    let writer_session = session.clone();
    let writer = tokio::spawn(async move {
        loop {
            tokio::select! {
                _=writer_session.cancel.cancelled()=>break,
                next=outgoing.recv()=>{
                    let Some(Outbound{message,permit})=next else{break;};
                    let result=tokio::select! {
                        _=writer_session.cancel.cancelled()=>break,
                        result=tokio::time::timeout(Duration::from_secs(5),sink.send(message))=>result,
                    };
                    drop(permit);
                    if !matches!(result,Ok(Ok(()))) {eprintln!("WebSocket writer failed or timed out");writer_session.cancel.cancel();break;}
                }
            }
        }
        let _ = tokio::time::timeout(Duration::from_secs(1), sink.send(Message::Close(None))).await;
    });
    let (incoming, mut commands) = mpsc::channel::<String>(64);
    let reader_session = session.clone();
    let reader = tokio::spawn(async move {
        loop {
            tokio::select! {
                _=reader_session.cancel.cancelled()=>break,
                next=stream.next()=>match next {
                    Some(Ok(Message::Text(text)))=>{
                        if incoming.try_send(text.to_string()).is_err() {eprintln!("Inbound command queue full");break;}
                    }
                    Some(Ok(Message::Ping(_)|Message::Pong(_)))=>{},
                    Some(Ok(Message::Close(_)))|None=>break,
                    Some(Ok(_))|Some(Err(_))=>{eprintln!("Invalid or failed WebSocket frame");break;}
                }
            }
        }
        reader_session.cancel.cancel();
    });
    let result=async {
        let (reply,received)=oneshot::channel();
        app.hub.send(HubCommand::Register{session:session.clone(),welcome,initial,reply}).await?;
        received.await??;
        loop {
            let command=tokio::select!{_=session.cancel.cancelled()=>break, command=commands.recv()=>command};
            let Some(command)=command else{break;};
            let result=tokio::select!{
                _=session.cancel.cancelled()=>break,
                result=dispatch(&app,session.clone(),&command)=>result,
            };
            if let Err(error)=result {
                eprintln!("PoC command rejected: {error}");
                let warning = if error.downcast_ref::<sqlx::Error>().is_some() {
                    "Database operation failed.".to_owned()
                } else { error.to_string() };
                session.emit(&frame("warning", json!({"warning":warning})));
            }
        }
        Ok::<(),anyhow::Error>(())
    }.await;
    session.cancel.cancel();
    let _ = app.hub.send(HubCommand::Logout(session)).await;
    reader.await?;
    writer.await?;
    result
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TableArgs {
    #[serde(rename = "tableID")]
    table_id: u64,
    #[serde(default, rename = "requestID")]
    request_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JoinArgs {
    #[serde(rename = "tableID")]
    table_id: u64,
    #[serde(default)]
    password: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionArgs {
    #[serde(rename = "tableID")]
    table_id: u64,
    #[serde(rename = "type")]
    kind: u8,
    target: i32,
    #[serde(default)]
    value: i32,
    #[serde(default)]
    #[serde(rename = "requestID")]
    request_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CustomDeck {
    players: Vec<String>,
    deck: Vec<Card>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    name: String,
    #[serde(default)]
    #[serde(rename = "gameJSON")]
    game_json: Option<CustomDeck>,
    #[serde(default)]
    options: Option<Value>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayArgs {
    source: String,
    visibility: String,
    #[serde(rename = "databaseID")]
    database_id: i32,
}

async fn dispatch(app: &App, session: Arc<Session>, text: &str) -> Result<()> {
    ensure!(
        text.len() <= 8192 && app.accepting.load(Ordering::Acquire),
        "Server unavailable or oversized input"
    );
    let (name, body) = text.split_once(' ').unwrap_or((text, "{}"));
    let (reply, received) = oneshot::channel();
    let command = match name {
        "getName" => {
            ensure!(
                serde_json::from_str::<Value>(body)? == json!({}),
                "Invalid name request"
            );
            HubCommand::Name { session, reply }
        }
        "tableCreate" => {
            let args: CreateArgs = serde_json::from_str(body)?;
            ensure!(
                !args.name.trim().is_empty()
                    && args.name.len() <= 45
                    && args
                        .name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b' ' || b == b'-'),
                "Unsupported table name or special prefix"
            );
            if let Some(options) = args.options {
                ensure!(
                    options == json!({}) || options == json!({"variantName":"No Variant"}),
                    "Only default standard options are supported"
                );
            }
            let deck = if let Some(custom) = args.game_json {
                ensure!(
                    custom.players.len() == 2,
                    "Exactly two players are supported"
                );
                crate::game::encode_deck(&custom.deck)?;
                Some(custom.deck)
            } else {
                None
            };
            let player = app.store.player(session.user, session.name.clone()).await?;
            HubCommand::Create {
                session,
                player,
                name: args.name,
                deck,
                reply,
            }
        }
        "tableJoin" => {
            let args: JoinArgs = serde_json::from_str(body)?;
            ensure!(
                args.password.is_empty(),
                "Password-protected tables are outside this PoC"
            );
            let player = app.store.player(session.user, session.name.clone()).await?;
            HubCommand::Route {
                session,
                table: args.table_id,
                command: Command::Join(player),
                reply,
            }
        }
        "action" => {
            let args: ActionArgs = serde_json::from_str(body)?;
            ensure!(args.kind <= 3, "Unsupported action");
            HubCommand::Route {
                session,
                table: args.table_id,
                command: Command::Action(
                    Action {
                        kind: args.kind,
                        target: args.target,
                        value: args.value,
                    },
                    args.request_id,
                ),
                reply,
            }
        }
        "replayCreate" => {
            let args: ReplayArgs = serde_json::from_str(body)?;
            ensure!(
                args.source == "id" && args.visibility == "solo" && args.database_id > 0,
                "Only solo historical replays are supported"
            );
            let (allocate, allocated) = oneshot::channel();
            app.hub.send(HubCommand::Allocate(allocate)).await?;
            let allocation = allocated.await??;
            let snapshot: Snapshot = app
                .store
                .historical(args.database_id, allocation.id, session.user)
                .await?;
            HubCommand::Replay {
                session,
                snapshot: Box::new(snapshot),
                allocation,
                reply,
            }
        }
        "tableStart" | "loaded" | "getGameInfo1" | "getGameInfo2" | "tableReattend"
        | "tableUnattend" => {
            let args: TableArgs = serde_json::from_str(body)?;
            let command = match name {
                "tableStart" => Command::Start(args.request_id),
                "loaded" => Command::Loaded(args.request_id),
                "getGameInfo1" => Command::Info(1),
                "getGameInfo2" => Command::Info(2),
                "tableReattend" => Command::Reattend,
                _ => Command::Unattend,
            };
            HubCommand::Route {
                session,
                table: args.table_id,
                command,
                reply,
            }
        }
        _ => bail!("Unsupported PoC command: {name}"),
    };
    app.hub.send(command).await?;
    received.await?
}
