use crate::{
    actors::HubCommand,
    lifecycle::{Control, StopReason},
    operations::{Operation, router},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::ConnectInfo,
    http::{Request, StatusCode},
};
use serde_json::json;
use sqlx::PgPool;
use std::{
    net::SocketAddr,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::mpsc;
use tower::ServiceExt;

pub(crate) struct Harness {
    pub control: Arc<Control>,
    pub operations: Arc<Mutex<Vec<Operation>>>,
    pub active: Arc<AtomicU64>,
    pub stops: mpsc::Receiver<StopReason>,
    task: tokio::task::JoinHandle<()>,
}
impl Harness {
    pub fn new(pool: PgPool) -> Self {
        let (hub, mut commands) = mpsc::channel(16);
        let (stop, stops) = mpsc::channel(1);
        let operations = Arc::new(Mutex::new(Vec::new()));
        let events = operations.clone();
        let active = Arc::new(AtomicU64::new(1));
        let count = active.clone();
        let task = tokio::spawn(async move {
            while let Some(command) = commands.recv().await {
                if let HubCommand::Operations { command, reply } = command {
                    let result = match &command {
                        Operation::Inspect => {
                            json!({"activeGames":count.load(Ordering::Acquire),"users":[],"tables":[
                            {"id":7,"name":"Old table","created":"2020-01-01T00:00:00Z","running":true,"replay":false,"frozen":false}]})
                        }
                        _ => json!({}),
                    };
                    events.lock().unwrap().push(command);
                    let _ = reply.send(Ok(result));
                }
            }
        });
        let control = Control::new(
            hub,
            pool,
            PathBuf::from(env!("CARGO_MANIFEST_DIR")),
            "test-commit".into(),
            stop,
        );
        control.activate();
        Self {
            control,
            operations,
            active,
            stops,
            task,
        }
    }
    pub async fn close(self) {
        self.control.begin_drain().await;
        self.task.abort();
        let _ = self.task.await;
    }
}
async fn request(app: Router, path: &str, body: Option<&str>) -> (StatusCode, String) {
    let mut request = Request::builder()
        .method(if body.is_some() { "POST" } else { "GET" })
        .uri(path)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(Body::from(body.unwrap_or("").to_owned()))
        .unwrap();
    request
        .extensions_mut()
        .insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
    let response = app.oneshot(request).await.unwrap();
    assert_eq!(response.headers()["cache-control"], "no-store");
    let status = response.status();
    (
        status,
        String::from_utf8(
            to_bytes(response.into_body(), 1024 * 1024)
                .await
                .unwrap()
                .to_vec(),
        )
        .unwrap(),
    )
}
#[tokio::test]
async fn graceful_stop_is_loopback_only_and_rejects_repeated_requests() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let mut h = Harness::new(pool);
    let app = router(h.control.clone());
    for (peer, browser) in [("192.0.2.1:1234", false), ("127.0.0.1:1234", true)] {
        let mut builder = Request::builder().uri("/gracefulStop");
        if browser {
            builder = builder.header("Origin", "http://localhost");
        }
        let mut request = builder.body(Body::empty()).unwrap();
        request
            .extensions_mut()
            .insert(ConnectInfo(peer.parse::<SocketAddr>().unwrap()));
        assert_eq!(
            app.clone().oneshot(request).await.unwrap().status(),
            StatusCode::FORBIDDEN
        );
    }
    assert!(h.stops.try_recv().is_err());
    let long = format!("/gracefulStop?message={}", "a".repeat(501));
    assert_eq!(
        request(app.clone(), &long, None).await.0,
        StatusCode::BAD_REQUEST
    );
    assert!(h.stops.try_recv().is_err());
    assert_eq!(
        request(
            app.clone(),
            "/gracefulStop?message=+Upgrading+the+database.+",
            None
        )
        .await
        .0,
        StatusCode::OK
    );
    assert!(matches!(
        h.stops.recv().await,
        Some(StopReason::GracefulStop(Some(message))) if message == "Upgrading the database."
    ));
    assert!(h.operations.lock().unwrap().is_empty());
    assert_eq!(
        request(app, "/gracefulStop", None).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    h.close().await;
}
#[tokio::test]
async fn loopback_routes_admission() {
    let pool = sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let h = Harness::new(pool);
    let app = router(h.control.clone());
    let (status, body) = request(app.clone(), "/version", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("test-commit"), "{body}");
    // Each command takes only its own parameters, and a body only if it reads one.
    for (path, body, expected) in [
        ("/version?verbose", None, "takes no parameters"),
        ("/gracefulStop?message=a&message=b", None, "more than once"),
        (
            "/ban?username=Alice",
            Some("username=Alice"),
            "takes no parameters",
        ),
        (
            "/ban",
            Some("username=Alice&reason=x"),
            "This URL takes: username.",
        ),
    ] {
        let (status, text) = request(app.clone(), path, body).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{path}");
        assert!(text.contains(expected), "{path}: {text}");
    }
    let mut with_body = Request::builder()
        .uri("/version")
        .body(Body::from("x"))
        .unwrap();
    with_body
        .extensions_mut()
        .insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
    assert_eq!(
        app.clone().oneshot(with_body).await.unwrap().status(),
        StatusCode::BAD_REQUEST
    );
    for removed in ["/getLongTables", "/terminate?tableID=7"] {
        assert_eq!(
            request(app.clone(), removed, None).await.0,
            StatusCode::NOT_FOUND
        );
    }
    let mut browser = Request::builder()
        .uri("/gracefulStop")
        .header("Origin", "")
        .body(Body::empty())
        .unwrap();
    browser
        .extensions_mut()
        .insert(ConnectInfo("127.0.0.1:1234".parse::<SocketAddr>().unwrap()));
    assert_eq!(
        app.clone().oneshot(browser).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let mut remote = Request::builder()
        .uri("/gracefulStop")
        .body(Body::empty())
        .unwrap();
    remote
        .extensions_mut()
        .insert(ConnectInfo("192.0.2.1:1234".parse::<SocketAddr>().unwrap()));
    assert_eq!(
        app.clone().oneshot(remote).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    h.control.begin_drain().await;
    assert_eq!(
        request(app, "/gracefulStop", None).await.0,
        StatusCode::SERVICE_UNAVAILABLE
    );
    h.close().await;
}
#[tokio::test]
async fn moderation_uses_canonical_accounts_and_persists_ip_actions() {
    let Some(db) = crate::accounts::test_support::TestDb::create().await else {
        return;
    };
    let user = db.user("Alice").await;
    let h = Harness::new(db.pool.clone());
    let app = router(h.control.clone());
    assert_eq!(
        request(app.clone(), "/ban", Some("username=ALICE")).await.1,
        "success\n"
    );
    let banned: bool = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM banned_ips WHERE user_id=$1) AS \"v!\"",
        user
    )
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert!(banned);
    assert!(
        request(app.clone(), "/ban", Some("username=Alice"))
            .await
            .1
            .contains("already banned")
    );
    assert_eq!(
        request(app.clone(), "/mute", Some("username=Alice"))
            .await
            .1,
        "success\n"
    );
    assert!(
        request(app.clone(), "/mute", Some("username=Alice"))
            .await
            .1
            .contains("already muted")
    );
    assert_eq!(
        request(app.clone(), "/ban", Some("")).await.0,
        StatusCode::BAD_REQUEST
    );
    assert!(
        request(app.clone(), "/ban", Some("username=Missing"))
            .await
            .1
            .contains("does not exist")
    );
    let (status, body) = request(app, "/metrics", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let metrics: serde_json::Value = serde_json::from_str(&body).unwrap();
    assert!(metrics["database"]["totalConnections"].as_u64().unwrap() > 0);
    assert!(
        h.operations
            .lock()
            .unwrap()
            .iter()
            .any(|o| matches!(o,Operation::Ban{user_id,..} if *user_id==user))
    );
    h.close().await;
    db.close().await;
}

#[tokio::test]
async fn metrics_report_actual_primary_and_archive_connection_budgets() -> anyhow::Result<()> {
    let Some(db) = crate::accounts::test_support::TestDb::create().await else {
        return Ok(());
    };
    let result:anyhow::Result<()>=async{
    #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
        "CREATE TABLE schema_version(version INTEGER NOT NULL); INSERT INTO schema_version VALUES({});",
        crate::store::SCHEMA_VERSION
    )))
    .execute(&db.pool)
    .await?;
    let redis = crate::test_redis::RedisFixture::start(true).await?;
    let options = db.pool.connect_options();
    let test_url = url::Url::parse(&std::env::var("HANABI_TEST_DATABASE_URL")?)?;
    let host = test_url
        .query_pairs()
        .find(|(key, _)| key == "host").map_or_else(|| options.get_host().to_owned(), |(_, value)| value.into_owned());
    let password = percent_encoding::percent_decode_str(test_url.password().unwrap_or(""))
        .decode_utf8()?
        .into_owned();
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..");
    let config = crate::config::Config::from_values(
        &root,
        &[
            ("SESSION_SECRET", "test".repeat(32)),
            ("REDIS_URL", redis.url.clone()),
            ("DB_HOST", host),
            ("DB_PORT", options.get_port().to_string()),
            ("DB_USER", options.get_username().to_owned()),
            ("DB_PASSWORD", password),
            (
                "DB_NAME",
                options
                    .get_database()
                    .expect("disposable database")
                    .to_owned(),
            ),
        ]
        .into_iter()
        .map(|(key, value)| (key.into(), value))
        .collect(),
    )?;
    let store = crate::store::Store::connect(&config).await?;
    let h = Harness::new(store.primary.clone());
    let app = crate::web::App::new(
        store.clone(),
        h.control.hub.clone(),
        crate::public_http::PublicConfig {
            root,
            session_secret: config.secret().into(),
            domain: "localhost".into(),
            use_tls: false,
            client_version: "1".into(),
            is_dev: true,
            seeded_deck: crate::game::seeded_deck,
            deck_size: crate::game::deck_size,
        },
        store.state_lost(),
crate::server_info::test_info(),
    );
    h.control.attach_application(Arc::downgrade(&app));
    let (status, body) = request(router(h.control.clone()), "/metrics", None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let report: serde_json::Value = serde_json::from_str(&body)?;
    for (pool, max) in [
        (&report["database"], 8),
        (&report["recovery"]["database"], 2),
    ] {
        assert_eq!(pool["maxConnections"], max);
        assert!((1..=max).contains(&pool["totalConnections"].as_u64().unwrap()));
    }
    assert_eq!(report["recovery"]["authority"], "Redis AOF/WAITAOF");
    assert_eq!(store.lobby_reads.options().get_max_connections(), 2);
    let mut reader = store.lobby_reads.acquire().await?;
    #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
    let read_only: String = sqlx::query_scalar("SHOW default_transaction_read_only").fetch_one(&mut *reader).await?;
    assert_eq!(read_only, "on");
    let reader_pid: i32 = sqlx::query_scalar!("SELECT pg_backend_pid() AS \"v!\"").fetch_one(&mut *reader).await?;
    let slow_read = tokio::spawn(async move {
        sqlx::query!("SELECT pg_sleep(10)").execute(&mut *reader).await
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let running: bool = sqlx::query_scalar!("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND state='active' AND query='SELECT pg_sleep(10)') AS \"v!\"", reader_pid).fetch_one(&store.primary).await?;
            if running { return Ok::<_, sqlx::Error>(()); }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }).await??;
    store.cancel_lobby_reads().await?;
    let cancelled = tokio::time::timeout(Duration::from_millis(500), slow_read).await??
        .expect_err("Background read survived maintenance cancellation");
    assert_eq!(cancelled.as_database_error().and_then(sqlx::error::DatabaseError::code).as_deref(), Some("57014"));
    let usable: i32 = sqlx::query_scalar!("SELECT 1 AS \"v!\"").fetch_one(&store.primary).await?;
    assert_eq!(usable, 1, "Read cancellation interfered with the primary pool");
    h.close().await;
    app.shutdown.cancel();
    store.close().await?;
    Ok(())
    }.await;
    db.close().await;
    result
}
