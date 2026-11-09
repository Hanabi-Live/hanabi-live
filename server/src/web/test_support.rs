use super::*;
use crate::{
    accounts::test_support::TestDb,
    actors::{Hub, TableCommand},
    state::LiveState,
};

pub struct Fixture {
    pub app: Arc<App>,
    pub db: TestDb,
    pub url: String,
    pub address: SocketAddr,
    server: tokio::task::JoinHandle<std::io::Result<()>>,
    server_stop: CancellationToken,
    tasks: TaskTracker,
}

impl Fixture {
    pub async fn start() -> Option<Self> {
        std::env::var_os("HANABI_TEST_DATABASE_URL")?;
        let _ = rustls::crypto::ring::default_provider().install_default();
        let db = TestDb::create().await?;
        let state = LiveState::for_test(&db.pool).await.unwrap();
        let store = Store::fixture(db.pool.clone(), state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
        )
        .await
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let config = PublicConfig {
            root: std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."),
            session_secret: Arc::from("synthetic-browser-session-secret"),
            domain: Arc::from(address.to_string()),
            use_tls: false,
            client_version: Arc::from("42"),
            is_dev: true,
            seeded_deck: crate::game::seeded_deck,
            deck_size: crate::game::deck_size,
        };
        let app = App::new(
            store.clone(),
            hub,
            config,
            store.state_lost(),
            crate::server_info::test_info(),
        );
        let server_stop = CancellationToken::new();
        let stop = server_stop.clone();
        let server_app = app.clone();
        let server = tokio::spawn(async move {
            axum::serve(
                listener,
                router(server_app).into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(stop.cancelled_owned())
            .await
        });
        Some(Self {
            app,
            db,
            url: format!("http://{address}"),
            address,
            server,
            server_stop,
            tasks,
        })
    }

    pub async fn close(self) {
        self.app.accepting.store(false, Ordering::Release);
        drop(self.app.admission.write().await);
        let (reply, received) = oneshot::channel();
        self.app.hub.send(HubCommand::Quiesce(reply)).await.unwrap();
        for table in received.await.unwrap() {
            let (reply, received) = oneshot::channel();
            table.sender.send(TableCommand::Drain(reply)).await.unwrap();
            received.await.unwrap().unwrap();
        }
        let (reply, received) = oneshot::channel();
        self.app.hub.send(HubCommand::Stop(reply)).await.unwrap();
        received.await.unwrap();
        self.tasks.close();
        self.tasks.wait().await;
        self.app.shutdown.cancel();
        self.server_stop.cancel();
        self.app.connections.close();
        self.app.connections.wait().await;
        self.app.background.close();
        self.app.background.wait().await;
        self.server.await.unwrap().unwrap();
        self.app.store.close().await.unwrap();
        self.db.close().await;
    }
}
