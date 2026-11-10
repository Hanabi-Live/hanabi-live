//! Native browser routes and bounded WebSocket transport. Database work runs
//! behind the drain barrier; the hub owns session-generation publication.
mod dispatch;
#[cfg(test)]
mod integration_tests;
mod protocol;
mod socket;
#[cfg(test)]
pub(crate) mod test_support;
mod user;

use crate::errors::HttpError;
use crate::{
    accounts::{self, AccountConfig},
    actors::HubCommand,
    integrations::{IntegrationSlot, Integrations},
    lifecycle::Lifecycle,
    public_http::{self, PublicConfig},
    store::Store,
};
use anyhow::{Result, ensure};
use axum::{
    Router,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tokio::sync::{Semaphore, mpsc};
use tokio_util::task::TaskTracker;
/// The most characters of a client-supplied value, such as an origin or a version, that a log
/// line repeats.
const MAX_LOGGED_CLIENT_TEXT: usize = 100;
/// The most WebSocket connections open at once.
const MAX_SOCKETS: usize = 4096;
/// The most lobby statistics loads that can run at once.
const LOBBY_SLOTS: usize = 64;

pub struct App {
    pub store: Store,
    pub hub: mpsc::Sender<HubCommand>,
    pub lifecycle: Arc<Lifecycle>,
    pub connections: TaskTracker,
    pub background: TaskTracker,
    generation: AtomicU64,
    sockets: Arc<Semaphore>,
    incoming_bytes: Arc<Semaphore>,
    outgoing_bytes: Arc<Semaphore>,
    lobby_slots: Arc<Semaphore>,
    public: PublicConfig,
    pub info: Arc<crate::server_info::ServerInfo>,
    pub integrations: IntegrationSlot,
    integration_started: AtomicBool,
    /// Each connected user's lobby task.
    users: user::Users,
}

impl App {
    pub fn is_development(&self) -> bool {
        self.public.is_dev
    }

    /// The client version that this server serves, which connecting clients must match.
    pub fn client_version(&self) -> &str {
        &self.public.client_version
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
        lifecycle: Arc<Lifecycle>,
        info: Arc<crate::server_info::ServerInfo>,
        integrations: IntegrationSlot,
    ) -> Arc<Self> {
        Arc::new(Self {
            store,
            hub,
            lifecycle,
            generation: AtomicU64::new(1),
            sockets: Arc::new(Semaphore::new(MAX_SOCKETS)),
            incoming_bytes: Arc::new(Semaphore::new(crate::transport::GLOBAL_INPUT_BYTES)),
            outgoing_bytes: Arc::new(Semaphore::new(crate::transport::GLOBAL_OUTPUT_BYTES)),
            lobby_slots: Arc::new(Semaphore::new(LOBBY_SLOTS)),
            connections: TaskTracker::new(),
            background: TaskTracker::new(),
            public,
            info,
            integrations,
            integration_started: AtomicBool::new(false),
            users: user::Users::default(),
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

    pub fn alert(&self, report: &crate::errors::Report) {
        if let Some(integrations) = self.integrations.get() {
            integrations.report(report);
        }
    }
}

pub use dispatch::publish_external;

pub fn router(app: Arc<App>) -> Router {
    let accounts = accounts::router(
        app.store.primary.clone(),
        AccountConfig {
            secret: app.public.session_secret.to_string(),
            domain: app.public.domain.to_string(),
            use_tls: app.public.use_tls,
            version: app.public.client_version.to_string(),
            is_dev: app.public.is_dev,
        },
    );
    let authenticated = Router::new()
        .route("/ws", get(socket::websocket))
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
        HttpError::refused(status, message).json()
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
        return HttpError::refused(StatusCode::BAD_REQUEST, "GET requests cannot have a body.")
            .json();
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
    tracing::warn!(
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
        return HttpError::refused(StatusCode::FORBIDDEN, "Invalid request origin.").json();
    }
    let Ok(_admission) = app.lifecycle.admit().await else {
        log_rejection(&request, "the server draining");
        return HttpError::refused(
            StatusCode::SERVICE_UNAVAILABLE,
            "The server is draining for maintenance.",
        )
        .json();
    };
    next.run(request).await
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
