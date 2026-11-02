use crate::config::Config;
use anyhow::{Context, Result, ensure};
use axum::{
    Router,
    extract::{Path, State},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
};
use std::{collections::HashSet, path::PathBuf, sync::Arc};

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
pub fn redirect_router(root: PathBuf, domain: &str, https_port: u16) -> Router {
    let host = if domain.contains(':') {
        format!("[{domain}]")
    } else {
        domain.into()
    };
    let origin = if https_port == 443 {
        format!("https://{host}")
    } else {
        format!("https://{host}:{https_port}")
    };
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
            axum::http::header::LOCATION,
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
    let resolved = match tokio::fs::canonicalize(&path).await {
        Ok(p) => p,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let root = match tokio::fs::canonicalize(&state.acme).await {
        Ok(p) => p,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    if !resolved.starts_with(root) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match tokio::fs::read(resolved).await {
        Ok(bytes) => ([(axum::http::header::CONTENT_TYPE, "text/plain")], bytes).into_response(),
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
    fn config(root: PathBuf) -> Config {
        Config::from_values(
            root,
            [
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
        let config = config(root.clone());
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
        let router = redirect_router(root.clone(), "localhost", address.port());
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
