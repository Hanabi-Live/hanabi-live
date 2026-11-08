use crate::config::Config;
use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    extract::{Path, Request, State},
    http::{Method, StatusCode, Uri, header, uri::Authority},
    middleware::{self, Next},
    response::{IntoResponse, Redirect, Response},
    routing::get,
};
use std::{collections::HashSet, path::PathBuf, sync::Arc};

pub(crate) const SITE_HOSTS: [&str; 4] = [
    "hanab.live",
    "hanabi.live",
    "www.hanab.live",
    "www.hanabi.live",
];

pub async fn configuration(
    config: &Config,
) -> Result<Option<axum_server::tls_rustls::RustlsConfig>> {
    // Redis and optional HTTPS integrations also use Rustls when the HTTP listener is plain.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let Some(cert) = &config.tls_cert_file else {
        return Ok(None);
    };
    let key = config
        .tls_key_file
        .as_ref()
        .context("TLS private key is missing")?;
    Ok(Some(
        axum_server::tls_rustls::RustlsConfig::from_pem_file(cert, key)
            .await
            .context("Unable to load TLS certificate and private key")?,
    ))
}

/// Static services follow symlinks, so validate their roots before opening any listener.
pub fn validate_static_roots(config: &Config) -> Result<()> {
    let private_files = [Some(config.root.join(".env")), config.tls_key_file.clone()];
    let private: Vec<_> = private_files
        .into_iter()
        .flatten()
        .filter_map(|p| p.canonicalize().ok())
        .collect();
    for directory in [
        config.root.join("public"),
        config.root.join("letsencrypt/.well-known/acme-challenge"),
    ] {
        if !directory.exists() {
            continue;
        }
        let root = directory.canonicalize()?;
        let mut pending = vec![root.clone()];
        let mut visited = HashSet::new();
        while let Some(path) = pending.pop() {
            let canonical = path
                .canonicalize()
                .with_context(|| format!("Invalid static path: {}", path.display()))?;
            ensure!(
                !private.contains(&canonical),
                "A private configuration or TLS key file is reachable through static assets"
            );
            ensure!(
                canonical.file_name().is_none_or(|name| name != ".env"),
                "Environment files must not be reachable through static assets"
            );
            if canonical.is_dir() && visited.insert(canonical.clone()) {
                for entry in std::fs::read_dir(canonical)? {
                    pending.push(entry?.path());
                }
            }
        }
    }
    Ok(())
}

#[derive(Clone)]
struct RedirectState {
    origin: Arc<str>,
    acme: PathBuf,
}
fn https_origin(domain: &str, https_port: u16) -> String {
    let host = if domain.contains(':') {
        format!("[{domain}]")
    } else {
        domain.into()
    };
    if https_port == 443 {
        format!("https://{host}")
    } else {
        format!("https://{host}:{https_port}")
    }
}

pub fn canonical_host_router(router: Router, domain: &str, https_port: u16) -> Router {
    if domain != "hanab.live" {
        return router;
    }
    router.layer(middleware::from_fn_with_state(
        Arc::<str>::from(https_origin(domain, https_port)),
        canonical_host,
    ))
}

async fn canonical_host(State(origin): State<Arc<str>>, request: Request, next: Next) -> Response {
    let path = request.uri().path();
    // Keep existing alias tabs' sockets and background requests working. New page requests
    // move to the cookie domain before either client attempts to sign in or connect.
    let navigation = matches!(*request.method(), Method::GET | Method::HEAD)
        && path != "/ws"
        && path != "/test-cookie"
        && !path.starts_with("/api/")
        && !request.headers().contains_key(header::UPGRADE)
        && request
            .headers()
            .get("sec-fetch-mode")
            .is_none_or(|mode| mode == "navigate");
    let authority = request.uri().authority().cloned().or_else(|| {
        request
            .headers()
            .get(header::HOST)
            .and_then(|host| host.to_str().ok())
            .and_then(|host| host.parse::<Authority>().ok())
    });
    if navigation
        && authority.is_some_and(|authority| {
            let host = authority.host();
            !host.eq_ignore_ascii_case("hanab.live")
                && SITE_HOSTS
                    .iter()
                    .any(|alias| host.eq_ignore_ascii_case(alias))
        })
    {
        let mut response = Redirect::permanent(&format!(
            "{origin}{}",
            request
                .uri()
                .path_and_query()
                .map_or("/", |path| path.as_str())
        ))
        .into_response();
        response.headers_mut().insert(
            header::VARY,
            axum::http::HeaderValue::from_static("Sec-Fetch-Mode, Upgrade"),
        );
        return response;
    }
    next.run(request).await
}

pub fn redirect_router(root: &std::path::Path, domain: &str, https_port: u16) -> Router {
    let origin = https_origin(domain, https_port);
    Router::new()
        .route("/.well-known/acme-challenge/{token}", get(challenge))
        .fallback(redirect)
        .with_state(RedirectState {
            origin: origin.into(),
            acme: root.join("letsencrypt/.well-known/acme-challenge"),
        })
}
async fn redirect(State(state): State<RedirectState>, uri: Uri) -> Response {
    (
        StatusCode::MOVED_PERMANENTLY,
        [(
            header::LOCATION,
            format!(
                "{}{}",
                state.origin,
                uri.path_and_query().map_or("/", |p| p.as_str())
            ),
        )],
    )
        .into_response()
}
async fn challenge(State(state): State<RedirectState>, Path(token): Path<String>) -> Response {
    if token.is_empty()
        || !token
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = state.acme.join(token);
    let Ok(resolved) = tokio::fs::canonicalize(&path).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Ok(root) = tokio::fs::canonicalize(&state.acme).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !resolved.starts_with(root) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match tokio::fs::read(resolved).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, "text/plain")], bytes).into_response(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            StatusCode::NOT_FOUND.into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}
#[cfg(test)]
pub(crate) fn fixture_root(label: &str) -> Result<PathBuf> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join(format!("{label}-{:032x}", rand::random::<u128>()));
    std::fs::create_dir_all(&root)?;
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use tower::ServiceExt;

    fn canonical_router(domain: &str, port: u16) -> Router {
        canonical_host_router(
            Router::new().fallback(|| async { "unchanged" }),
            domain,
            port,
        )
    }

    #[tokio::test]
    async fn alias_navigation_redirects_before_login_over_http1_and_http2() -> Result<()> {
        for host in [
            "hanabi.live",
            "www.hanab.live",
            "www.hanabi.live",
            "HANABI.LIVE",
        ] {
            for http2 in [false, true] {
                let path = "/lobby/table/12?name=a%2Fb&return=%2F12";
                let request = if http2 {
                    Request::builder()
                        .version(axum::http::Version::HTTP_2)
                        .uri(format!("https://{host}{path}"))
                } else {
                    Request::builder().uri(path).header(header::HOST, host)
                };
                let response = canonical_router("hanab.live", 443)
                    .oneshot(request.body(Body::empty())?)
                    .await?;
                assert_eq!(response.status(), StatusCode::PERMANENT_REDIRECT);
                assert_eq!(
                    response.headers()[header::LOCATION],
                    format!("https://hanab.live{path}")
                );
                assert!(!response.headers().contains_key(header::SET_COOKIE));
            }
        }
        let response = canonical_router("hanab.live", 8443)
            .oneshot(
                Request::builder()
                    .method(Method::HEAD)
                    .uri("/game/12")
                    .header(header::HOST, "hanabi.live:8443")
                    .header("sec-fetch-mode", "navigate")
                    .body(Body::empty())?,
            )
            .await?;
        assert_eq!(response.status(), StatusCode::PERMANENT_REDIRECT);
        assert_eq!(
            response.headers()[header::LOCATION],
            "https://hanab.live:8443/game/12"
        );
        Ok(())
    }

    #[tokio::test]
    async fn canonical_redirect_preserves_existing_alias_connections_and_requests() -> Result<()> {
        for request in [
            Request::builder().uri("/ws?version=42"),
            Request::builder()
                .method(Method::CONNECT)
                .uri("https://hanabi.live/ws"),
            Request::builder().uri("/test-cookie"),
            Request::builder().uri("/api/v1/identity/token"),
            Request::builder().method(Method::POST).uri("/login"),
            Request::builder()
                .uri("/public/main.js")
                .header("sec-fetch-mode", "no-cors"),
            Request::builder()
                .uri("/lobby")
                .header("sec-fetch-mode", "cors"),
            Request::builder()
                .uri("/")
                .header(header::UPGRADE, "websocket"),
        ] {
            let response = canonical_router("hanab.live", 443)
                .oneshot(
                    request
                        .header(header::HOST, "hanabi.live")
                        .body(Body::empty())?,
                )
                .await?;
            assert_eq!(response.status(), StatusCode::OK);
            assert!(!response.headers().contains_key(header::LOCATION));
        }
        Ok(())
    }

    #[tokio::test]
    async fn canonical_redirect_does_not_change_other_deployments_or_trust_arbitrary_hosts()
    -> Result<()> {
        for (domain, host) in [
            ("hanab.live", "hanab.live"),
            ("hanab.live", "hanab.live:443"),
            ("hanab.live", "evil.invalid"),
            ("hanab.live", "hanabi.live.evil.invalid"),
            ("localhost", "hanabi.live"),
            ("example.invalid", "www.hanab.live"),
        ] {
            let response = canonical_router(domain, 443)
                .oneshot(
                    Request::builder()
                        .uri("/lobby")
                        .header(header::HOST, host)
                        .body(Body::empty())?,
                )
                .await?;
            assert_eq!(response.status(), StatusCode::OK);
        }
        Ok(())
    }

    fn config(root: &std::path::Path) -> Config {
        Config::from_values(
            root,
            &[
                ("SESSION_SECRET", "x".repeat(128)),
                ("REDIS_URL", "redis://localhost".into()),
                ("TLS_CERT_FILE", "cert.pem".into()),
                ("TLS_KEY_FILE", "key.pem".into()),
            ]
            .into_iter()
            .map(|(k, v)| (k.into(), v))
            .collect(),
        )
        .unwrap()
    }
    #[tokio::test]
    async fn tls_handshake_redirect_and_private_assets() -> Result<()> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let root = fixture_root("tls")?;
        let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()])?;
        std::fs::write(root.join("cert.pem"), cert.cert.pem())?;
        std::fs::write(root.join("key.pem"), cert.signing_key.serialize_pem())?;
        let config = config(&root);
        let tls = configuration(&config).await?.context("TLS")?;
        let listener = std::net::TcpListener::bind("127.0.0.1:0")?;
        listener.set_nonblocking(true)?;
        let address = listener.local_addr()?;
        let handle = axum_server::Handle::new();
        let server = tokio::spawn(
            axum_server::from_tcp_rustls(listener, tls)?
                .handle(handle.clone())
                .serve(
                    Router::new()
                        .route("/", get(|| async { "secure" }))
                        .into_make_service(),
                ),
        );
        let mut roots = rustls::RootCertStore::empty();
        roots.add(cert.cert.der().clone())?;
        let client = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let stream = tokio::net::TcpStream::connect(address).await?;
        let mut stream = tokio_rustls::TlsConnector::from(Arc::new(client))
            .connect("localhost".try_into()?, stream)
            .await?;
        stream
            .write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await?;
        let mut body = String::new();
        stream.read_to_string(&mut body).await?;
        ensure!(
            body.contains("200 OK") && body.contains("secure"),
            "TLS request failed"
        );
        handle.graceful_shutdown(Some(std::time::Duration::from_secs(2)));
        server.await??;
        std::fs::create_dir_all(root.join("letsencrypt/.well-known/acme-challenge"))?;
        std::fs::write(
            root.join("letsencrypt/.well-known/acme-challenge/test_token"),
            "proof",
        )?;
        let router = redirect_router(&root, "localhost", address.port());
        let response = router
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/game/1?turn=4")
                    .header("Host", "evil.invalid")
                    .body(Body::empty())?,
            )
            .await?;
        ensure!(
            response.headers()["location"]
                == format!("https://localhost:{}/game/1?turn=4", address.port()),
            "Untrusted Host affected redirect"
        );
        let response = router
            .oneshot(
                Request::builder()
                    .uri("/.well-known/acme-challenge/test_token")
                    .body(Body::empty())?,
            )
            .await?;
        ensure!(
            to_bytes(response.into_body(), 1024).await? == "proof",
            "ACME token not served"
        );
        std::fs::create_dir(root.join("public"))?;
        std::fs::write(root.join("favicon.ico"), b"fixture favicon")?;
        std::os::unix::fs::symlink(root.join("favicon.ico"), root.join("public/favicon.ico"))?;
        validate_static_roots(&config)?;
        std::os::unix::fs::symlink(root.join("key.pem"), root.join("public/key"))?;
        ensure!(
            validate_static_roots(&config).is_err(),
            "Public symlink exposed private key"
        );
        std::fs::remove_dir_all(root)?;
        Ok(())
    }
}
