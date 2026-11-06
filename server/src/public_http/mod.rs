//! Native, read-only public HTTP surface. The engine is injected so historical exports use
//! the same rules as live games rather than a second implementation.
mod catalog;
mod data;
mod pages;
mod replay;
#[cfg(test)]
mod tests;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, RawQuery, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{collections::HashMap, net::SocketAddr, path::PathBuf, sync::Arc};

pub type DeckFactory = fn(i32, &str) -> anyhow::Result<Value>;
pub type DeckSize = fn(i32) -> anyhow::Result<usize>;

#[derive(Clone)]
pub struct PublicConfig {
    pub root: PathBuf,
    pub session_secret: Arc<str>,
    pub domain: Arc<str>,
    pub use_tls: bool,
    pub client_version: Arc<str>,
    pub is_dev: bool,
    pub seeded_deck: DeckFactory,
    pub deck_size: DeckSize,
}

#[derive(Clone)]
struct PublicState {
    pool: PgPool,
    config: PublicConfig,
    templates: Arc<minijinja::Environment<'static>>,
}

#[derive(Debug)]
struct Error(StatusCode, String, Option<Box<crate::errors::Report>>);
impl Error {
    fn not_found(message: impl Into<String>) -> Self {
        Self(StatusCode::NOT_FOUND, message.into(), None)
    }
    fn bad(message: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, message.into(), None)
    }
}
impl<E: Into<anyhow::Error>> From<E> for Error {
    fn from(error: E) -> Self {
        let report = crate::errors::Report::from_error(
            crate::errors::http_operation("Loading public data"),
            &error.into(),
            Some(30),
        );
        Self(report.status, report.text(), Some(Box::new(report)))
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        match self.2 {
            Some(report) => report.response(false),
            None => (self.0, self.1).into_response(),
        }
    }
}
type Result<T> = std::result::Result<T, Error>;
type Params = HashMap<String, String>;
type Query = Vec<(String, String)>;

fn query(raw: Option<String>) -> Query {
    url::form_urlencoded::parse(raw.as_deref().unwrap_or("").as_bytes())
        .into_owned()
        .collect()
}
fn first<'a>(q: &'a Query, name: &str) -> Option<&'a str> {
    q.iter()
        .find(|(key, _)| key == name)
        .map(|(_, v)| v.as_str())
}
fn integer(s: &str) -> Option<i64> {
    let digits = s.strip_prefix(['+', '-']).unwrap_or(s);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    s.parse().ok()
}
fn encoded(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC).to_string()
}

async fn new_lobby(State(state): State<PublicState>) -> Result<Response> {
    let html = tokio::fs::read_to_string(state.config.root.join("public/client-new/index.html"))
        .await
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                Error::not_found("The new lobby has not been built.")
            } else {
                Error::from(error)
            }
        })?;
    let mut response = axum::response::Html(html).into_response();
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-cache"),
    );
    Ok(response)
}

pub fn router(pool: PgPool, config: PublicConfig) -> Router {
    let state = PublicState {
        pool,
        config: config.clone(),
        templates: Arc::new(pages::templates()),
    };
    let mut router = Router::new();
    router = router
        .route("/new", get(new_lobby))
        .route("/new/", get(new_lobby))
        .route("/new/{*path}", get(new_lobby));
    for path in [
        "/",
        "/lobby",
        "/pre-game",
        "/pre-game/{tableID}",
        "/game",
        "/game/{tableID}",
        "/game/{tableID}/shadow/{seat}",
        "/replay",
        "/replay/{databaseID}",
        "/replay/{databaseID}/{turnID}",
        "/shared-replay",
        "/shared-replay/{databaseID}",
        "/shared-replay/{databaseID}/{turnID}",
        "/replay-json/{string}",
        "/shared-replay-json/{string}",
        "/create-table",
    ] {
        router = router.route(path, get(pages::main_page));
    }
    for root in ["scores", "profile", "tags", "missing-scores"] {
        router = router
            .route(&format!("/{root}"), get(pages::page))
            .route(&format!("/{root}/{{player1}}"), get(pages::page));
    }
    router = router.route("/missing-scores/{player1}/{numPlayers}", get(pages::page));
    for (root, param) in [
        ("variant", "id"),
        ("seed", "seed"),
        ("tag", "tag"),
        ("export", "databaseID"),
    ] {
        router = router
            .route(&format!("/{root}"), get(pages::page))
            .route(&format!("/{root}/{{{param}}}"), get(pages::page));
    }
    for root in ["/history", "/shared-missing-scores/{numPlayers}"] {
        let mut path = root.to_owned();
        router = router.route(&path, get(pages::page));
        for i in 1..=6 {
            path.push_str(&format!("/{{player{i}}}"));
            router = router.route(&path, get(pages::page));
        }
    }
    router = router
        .route("/stats", get(pages::page))
        .route("/videos", get(pages::page))
        .route(
            "/password-reset",
            get(pages::page).post(pages::password_hash),
        );
    let mut api = Router::new();
    for root in ["history", "history-full", "full-history"] {
        let mut path = format!("/api/v1/{root}");
        api = api.route(&path, get(api_handler));
        for i in 1..=6 {
            path.push_str(&format!("/{{player{i}}}"));
            api = api.route(&path, get(api_handler));
        }
    }
    for (root, param) in [
        ("seed", "seed"),
        ("seed-full", "seed"),
        ("full-seed", "seed"),
        ("tags", "player1"),
        ("tag", "tag"),
    ] {
        api = api
            .route(&format!("/api/v1/{root}"), get(api_handler))
            .route(&format!("/api/v1/{root}/{{{param}}}"), get(api_handler));
    }
    api = api
        .route("/api/v1/variants", get(api_handler))
        .route("/api/v1/variants-full", get(api_handler))
        .route("/api/v1/variants/{id}", get(api_handler))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            ban_check,
        ));
    router
        .merge(api)
        .nest_service(
            "/public",
            tower_http::services::ServeDir::new(config.root.join("public")),
        )
        .route_service(
            "/favicon.ico",
            tower_http::services::ServeFile::new(config.root.join("public/img/favicon.ico")),
        )
        .with_state(state)
        .layer(axum::middleware::from_fn(crate::errors::http_context))
}

async fn ban_check(
    State(state): State<PublicState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Result<Response> {
    // Forwarded headers are deliberately not trusted. The listener supplies the peer address.
    if let Some(peer) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        let banned: bool = sqlx::query_scalar!(
            "SELECT EXISTS(SELECT 1 FROM banned_ips WHERE ip = $1) AS \"value!\"",
            peer.0.ip().to_string()
        )
        .fetch_one(&state.pool)
        .await?;
        if banned {
            return Ok((StatusCode::BAD_REQUEST, Json("Your IP address has been banned. Please contact an administrator if you think this is a mistake.")).into_response());
        }
    }
    Ok(next.run(request).await)
}

async fn api_handler(
    State(state): State<PublicState>,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    Path(params): Path<Params>,
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let q = query(raw);
    let mode = uri.path().split('/').nth(3).unwrap_or("");
    let value =
        match mode {
            "variants" if !params.contains_key("id") => catalog::metadata(false),
            "variants-full" => catalog::metadata(true),
            "history" | "seed" | "variants" => {
                let selection = match data::selection(&state, &params, mode).await {
                    Ok(s) => s,
                    Err(e) if e.0 == StatusCode::BAD_REQUEST => {
                        return Ok((e.0, Json(json!({"total_rows":0,"info":e.1,"rows":null})))
                            .into_response());
                    }
                    Err(e) => return Err(e),
                };
                match data::list(&state, selection, &q, mode).await {
                    Ok(v) => v,
                    Err(e) if e.0 == StatusCode::BAD_REQUEST => {
                        return Ok((e.0, Json(json!({"total_rows":0,"info":e.1,"rows":null})))
                            .into_response());
                    }
                    Err(e) => return Err(e),
                }
            }
            "history-full" | "full-history" | "seed-full" | "full-seed" => {
                let seed = mode.contains("seed");
                let mut s =
                    data::selection(&state, &params, if seed { "seed" } else { "history" }).await?;
                if !seed {
                    s.start = first(&q, "start").and_then(integer);
                    s.end = first(&q, "end").and_then(integer);
                } else if first(&q, "size").is_some() || first(&q, "page").is_some() {
                    let size = first(&q, "size").unwrap_or("10");
                    let size = integer(size)
                        .filter(|n| (1..=100).contains(n))
                        .ok_or_else(|| Error::bad("Page size must be between 1 and 100."))?;
                    let page = integer(first(&q, "page").unwrap_or("0"))
                        .filter(|n| *n >= 0)
                        .ok_or_else(|| Error::bad("Page must be a nonnegative integer."))?;
                    let offset = page
                        .checked_mul(size)
                        .filter(|n| *n <= 9_007_199_254_740_991)
                        .ok_or_else(|| Error::bad("Pagination offset is too large."))?;
                    s.page = Some((size, offset));
                }
                data::history(&state, s, seed).await?
            }
            "tags" => data::tagged(&state, &params, false).await?,
            "tag" => data::tagged(&state, &params, true).await?,
            _ => return Err(Error::not_found("404 not found")),
        };
    Ok(Json(value).into_response())
}
