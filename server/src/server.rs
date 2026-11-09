use crate::{
    actors::Hub,
    config::Config,
    game,
    integrations::IntegrationSlot,
    lifecycle::{Control, Lifecycle, Runtime, StopReason, drain_game_runtime},
    migrations, operations,
    public_http::PublicConfig,
    release, restart,
    server_info::ServerInfo,
    store::Store,
    tls,
    web::{App, router},
};
use anyhow::{Context, Result, bail, ensure};
use std::{
    net::{SocketAddr, TcpListener},
    path::Path,
    sync::Arc,
    time::Duration,
};
use tokio::{sync::mpsc, task::JoinSet};
use tokio_util::task::TaskTracker;

/// Runs the `hanabi-live` command with the process arguments.
pub fn main() -> Result<()> {
    let arguments: Vec<_> = std::env::args().skip(1).collect();
    if arguments == ["--version"] {
        println!("{}", restart::version());
        return Ok(());
    }
    if arguments
        .first()
        .is_some_and(|argument| argument == "migrate")
    {
        let apply = match &arguments[1..] {
            [action] if action == "status" => false,
            [action] if action == "apply" => true,
            _ => bail!("Usage: hanabi-live migrate status|apply"),
        };
        let _lock = release::enter(release::Mode::Inspect)?;
        let config = Config::load(Path::new(".env"))?;
        return tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()?
            .block_on(migrations::run(&config, apply));
    }
    ensure!(
        arguments.is_empty() || arguments == ["--check-startup"],
        "Only --check-startup, --version, and migrate status|apply are supported"
    );
    let _release_lock = release::enter(if arguments.is_empty() {
        release::Mode::Run
    } else {
        release::Mode::Inspect
    })?;
    // Logs go to standard error as text. journald, which runs the server, adds the time.
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .without_time()
        .init();
    // Load once before Tokio starts; dotenv values never mutate process-wide environment.
    let config = Config::load(Path::new(".env"))?;
    let version = restart::validate_assets(&config)?;
    let root = config.root.clone();
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()?;
    let replace = if arguments.is_empty() {
        runtime.block_on(run(config, version))?
    } else {
        runtime.block_on(tls::configuration(&config))?;
        false
    };
    drop(runtime);
    if replace {
        restart::replace(&root)?;
    }
    Ok(())
}

fn bind(host: &str, port: u16) -> Result<TcpListener> {
    let listener = TcpListener::bind((host, port))
        .with_context(|| format!("Cannot bind listener at {host}:{port}"))?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

/// How long a client may take to send an HTTP/1 request's headers.
const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(30);
/// The most bytes an HTTP/1 connection buffers.
const MAX_HTTP1_BUFFER_BYTES: usize = 64 * crate::KIB;
/// How often an idle HTTP/2 connection is pinged.
const HTTP2_KEEP_ALIVE_INTERVAL: Duration = Duration::from_secs(30);
/// How long an HTTP/2 ping may go unanswered before the connection closes.
const HTTP2_KEEP_ALIVE_TIMEOUT: Duration = Duration::from_secs(10);
/// How long an HTTP request may take before the server answers 408.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// How long a client may take to complete a TLS handshake.
const TLS_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);
/// How long shutdown waits to cancel in-flight lobby reads, which is optional.
const LOBBY_READ_CANCEL_TIMEOUT: Duration = Duration::from_millis(250);
/// How long shutdown waits for every game to save before it reports a non-durable stop.
const GAME_DRAIN_DEADLINE: Duration = Duration::from_secs(120);
/// How long listeners have to finish their connections once shutdown closes them.
const LISTENER_SHUTDOWN_GRACE: Duration = Duration::from_secs(30);

fn http_settings<A>(server: &mut axum_server::Server<SocketAddr, A>) {
    server
        .http_builder()
        .http1()
        .timer(hyper_util::rt::TokioTimer::new())
        .header_read_timeout(HEADER_READ_TIMEOUT)
        .max_buf_size(MAX_HTTP1_BUFFER_BYTES);
    server
        .http_builder()
        .http2()
        .timer(hyper_util::rt::TokioTimer::new())
        .keep_alive_interval(Some(HTTP2_KEEP_ALIVE_INTERVAL))
        .keep_alive_timeout(HTTP2_KEEP_ALIVE_TIMEOUT);
}

fn request_timeout(router: axum::Router) -> axum::Router {
    router.layer(tower_http::timeout::TimeoutLayer::with_status_code(
        axum::http::StatusCode::REQUEST_TIMEOUT,
        REQUEST_TIMEOUT,
    ))
}

async fn run(config: Config, version: String) -> Result<bool> {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    let mut interrupt = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?;
    let tls_config = tls::configuration(&config).await?;
    if config.use_tls() {
        tokio::fs::create_dir_all(config.root.join("letsencrypt/.well-known/acme-challenge"))
            .await?;
    }
    let public = bind(config.listen_host(), config.port())?;
    let address = public.local_addr()?;
    let operations_listener = bind(crate::config::LOOPBACK_IPV4, config.localhost_port)?;
    let operations_address = operations_listener.local_addr()?;
    let redirect = if config.use_tls() {
        Some(bind(config.listen_host(), crate::config::HTTP_PORT)?)
    } else {
        None
    };
    let store = Store::connect(&config).await?;
    let tables = TaskTracker::new();
    let info = Arc::new(ServerInfo::new(config.use_tls(), &config.domain));
    let integrations = IntegrationSlot::default();
    let hub = match Hub::start(
        store.clone(),
        tables.clone(),
        info.clone(),
        integrations.clone(),
    )
    .await
    {
        Ok(hub) => hub,
        Err(error) => {
            if let Err(close) = store.close().await {
                tracing::error!("Startup storage cleanup failed: {close:#}");
            }
            return Err(error).context("Failed to recover durable game state");
        }
    };
    let lifecycle = Lifecycle::new(store.ownership_lost());
    let app = App::new(
        store,
        hub,
        PublicConfig {
            root: config.root.clone(),
            session_secret: config.secret().into(),
            domain: config.domain.clone().into(),
            use_tls: config.use_tls(),
            client_version: version.into(),
            is_dev: config.is_dev(),
            seeded_deck: game::seeded_deck,
            deck_size: game::deck_size,
        },
        lifecycle.clone(),
        info,
        integrations,
    );
    let (stops, mut stop_requests) = mpsc::channel(1);
    let control = Control::new(
        lifecycle.clone(),
        app.hub.clone(),
        app.store.primary.clone(),
        Some(Runtime {
            store: app.store.clone(),
            integrations: app.integrations.clone(),
        }),
        config.root.clone(),
        restart::version().into(),
        stops,
    );
    let mut failures = Vec::new();
    let mut handles = Vec::new();
    let mut services = JoinSet::new();
    let startup: Result<()> = async {
        let public_handle = axum_server::Handle::new();
        handles.push(public_handle.clone());
        let routes = router(app.clone());
        let routes = if config.use_tls() {
            tls::canonical_host_router(routes, &config.domain, address.port())
        } else {
            routes
        };
        let service = request_timeout(routes).into_make_service_with_connect_info::<SocketAddr>();
        if let Some(tls) = tls_config {
            let mut server = axum_server::from_tcp_rustls(public, tls)?
                .map(|acceptor| {
                    acceptor
                        .handshake_timeout(TLS_HANDSHAKE_TIMEOUT)
                        .acceptor(axum_server::accept::NoDelayAcceptor::new())
                })
                .handle(public_handle);
            http_settings(&mut server);
            services.spawn(async move { ("HTTPS", server.serve(service).await) });
        } else {
            let mut server = axum_server::from_tcp(public)?
                .acceptor(axum_server::accept::NoDelayAcceptor::new())
                .handle(public_handle);
            http_settings(&mut server);
            services.spawn(async move { ("HTTP", server.serve(service).await) });
        }
        let operations_handle = axum_server::Handle::new();
        handles.push(operations_handle.clone());
        let mut server = axum_server::from_tcp(operations_listener)?.handle(operations_handle);
        http_settings(&mut server);
        let service = request_timeout(operations::router(control.clone()))
            .into_make_service_with_connect_info::<SocketAddr>();
        services.spawn(async move { ("operations", server.serve(service).await) });
        if let Some(redirect) = redirect {
            let redirect_handle = axum_server::Handle::new();
            handles.push(redirect_handle.clone());
            let mut server = axum_server::from_tcp(redirect)?.handle(redirect_handle);
            http_settings(&mut server);
            let service = request_timeout(tls::redirect_router(
                &config.root,
                &config.domain,
                address.port(),
            ))
            .into_make_service_with_connect_info::<SocketAddr>();
            services.spawn(async move { ("HTTP redirect", server.serve(service).await) });
        }
        app.store.check_state()?;
        lifecycle.activate();
        let integration_app = app.clone();
        let integrations = config.integrations.clone();
        app.background.spawn(async move {
            tokio::select! {
                () = integration_app.lifecycle.shutdown.cancelled() => {},
                result = integration_app.start_integrations(&integrations) => {
                    if let Err(error) = result {
                        tracing::warn!("Optional integrations failed to initialize: {error:#}");
                    }
                }
            }
        });
        tracing::info!(
            "Server listening at {}://{address}",
            if config.use_tls() { "https" } else { "http" }
        );
        tracing::info!("Localhost operations listening at http://{operations_address}");
        tracing::info!(
            "The server has successfully started at: {} ({})",
            control.started.to_rfc3339(),
            control.version
        );
        Ok(())
    }
    .await;
    let reason = if let Err(error) = startup {
        StopReason::Failure(format!("Runtime startup failed: {error:#}"))
    } else {
        tokio::select! {
            biased;
            ()=lifecycle.ownership_lost.cancelled()=>StopReason::OwnershipLost,
            _=interrupt.recv()=>StopReason::Shutdown,
            _=terminate.recv()=>StopReason::Shutdown,
            request=stop_requests.recv()=>request.unwrap_or_else(||StopReason::Failure("Lifecycle control channel closed".into())),
            service=services.join_next()=>StopReason::Failure(format!("HTTP listener exited unexpectedly: {service:?}"))
        }
    };
    let replace = matches!(reason, StopReason::Restart(_));
    match &reason {
        StopReason::OwnershipLost => {
            failures.push("Live-table ownership or durability was lost".into());
            lifecycle.shutdown.cancel();
        }
        StopReason::Failure(message) => failures.push(message.clone()),
        _ => {}
    }
    lifecycle.stop_admitting();
    match tokio::time::timeout(LOBBY_READ_CANCEL_TIMEOUT, app.store.cancel_lobby_reads()).await {
        Ok(Ok(())) => {}
        result => tracing::warn!("Optional read cancellation did not complete: {result:?}"),
    }
    lifecycle.drain().await;
    match tokio::time::timeout(
        GAME_DRAIN_DEADLINE,
        drain_game_runtime(&app, &tables, &reason),
    )
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(error)) => failures.push(format!("{error:#}")),
        Err(_) => failures.push(
            "Game runtime drain exceeded its deadline; shutdown cannot be reported as durable"
                .into(),
        ),
    }
    lifecycle.shutdown.cancel();
    for handle in handles {
        handle.graceful_shutdown(Some(LISTENER_SHUTDOWN_GRACE));
    }
    while let Some(service) = services.join_next().await {
        match service {
            Ok((_, Ok(()))) => {}
            Ok((name, Err(error))) => {
                failures.push(format!("{name} listener shutdown failed: {error}"));
            }
            Err(error) => failures.push(format!("HTTP listener task failed: {error}")),
        }
    }
    app.connections.close();
    app.background.close();
    app.connections.wait().await;
    app.background.wait().await;
    if let Err(error) = app.store.check_state() {
        failures.push(format!("Final state ownership check failed: {error:#}"));
    }
    if let Err(error) = app.store.close().await {
        failures.push(format!("Storage shutdown failed: {error:#}"));
    }
    ensure!(
        failures.is_empty(),
        "Server shutdown failed: {}",
        failures.join("; ")
    );
    tracing::info!("The server successfully shut down.");
    Ok(replace)
}
