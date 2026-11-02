use anyhow::{Result, ensure};
use axum::serve::ListenerExt;
use hanabi_rust_poc::{
    actors::{Hub, HubCommand, TableCommand},
    config::Config,
    store::Store,
    web::{App, router},
};
use std::{
    collections::HashSet,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::sync::{Semaphore, oneshot};
use tokio_util::task::TaskTracker;

fn main() -> Result<()> {
    let config = Config::load(Path::new(".env"))?;
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?
        .block_on(run(config))
}

async fn run(config: Config) -> Result<()> {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    let version = tokio::fs::read_to_string("public/js/bundles/version.txt")
        .await?
        .trim()
        .to_owned();
    let text = tokio::fs::read_to_string("misc/word_list.txt").await?;
    let mut seen = HashSet::new();
    let words: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|word| !word.is_empty() && seen.insert((*word).to_owned()))
        .map(str::to_owned)
        .collect();
    ensure!(words.len() >= 3, "Dictionary has too few distinct words");
    let store = Store::connect(&config).await?;
    let tables = TaskTracker::new();
    let hub = Hub::start(store.clone(), Arc::new(words), tables.clone()).await?;
    let app = Arc::new(App {
        store,
        hub,
        secret: config.secret().to_owned(),
        version,
        accepting: AtomicBool::new(true),
        generation: AtomicU64::new(1),
        hashing: Arc::new(Semaphore::new(4)),
        sockets: Arc::new(Semaphore::new(128)),
        connections: TaskTracker::new(),
    });
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", config.port())).await?;
    let address = listener.local_addr()?;
    let listener = listener.tap_io(|connection| {
        if let Err(error) = connection.set_nodelay(true) {
            eprintln!("Failed to enable TCP_NODELAY: {error}");
        }
    });
    let (stop, stopped) = oneshot::channel::<()>();
    let service = tokio::spawn(
        axum::serve(
            listener,
            router(app.clone()).into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            let _ = stopped.await;
        })
        .into_future(),
    );
    println!("Server listening at http://{address}");
    tokio::select! { _=interrupt.recv()=>{}, _=terminate.recv()=>{} }
    app.accepting.store(false, Ordering::Release);
    let (reply, received) = oneshot::channel();
    app.hub.send(HubCommand::Quiesce(reply)).await?;
    for table in received.await? {
        let (reply, drained) = oneshot::channel();
        if table.sender.send(TableCommand::Drain(reply)).await.is_ok() {
            drained.await??;
        }
    }
    tables.close();
    tables.wait().await;
    let (reply, received) = oneshot::channel();
    app.hub.send(HubCommand::Stop(reply)).await?;
    received.await?;
    let _ = stop.send(());
    service.await??;
    app.connections.close();
    app.connections.wait().await;
    app.store.close().await;
    println!("Rust PoC drained successfully.");
    Ok(())
}
