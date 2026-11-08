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
    site_totals: Arc<tokio::sync::Mutex<pages::SiteTotals>>,
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
            // Public pages use the lobby read pool.
            Some(crate::store::LOBBY_READ_TIMEOUT),
        );
        Self(report.status, report.text(), Some(Box::new(report)))
    }
}
impl Error {
    /// The response for a route that returns JSON, rather than an HTML page.
    fn json(self) -> Response {
        match self.2 {
            Some(report) => report.response(true),
            None => crate::accounts::api_error(self.0, self.1),
        }
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
use crate::query::Query;

/// Parses a request's query string, rejecting any parameter that the URL does not take.
fn strict_query(raw: Option<&str>, accepted: &[&str]) -> Result<Query> {
    Query::parse(raw, accepted).map_err(Error::bad)
}

pub(super) use hanabi_protocol::DEFAULT_PAGE_SIZE;
/// The most rows that a page of a public listing can have.
pub(super) const MAX_PAGE_SIZE: i64 = 100;
/// The page sizes that a public listing's pager offers.
pub(super) const PAGER_SIZES: [i64; 4] = [DEFAULT_PAGE_SIZE, 20, 50, MAX_PAGE_SIZE];

/// The page size and offset that a request asks for, or `None` when it names neither.
fn pagination(q: &Query) -> Result<Option<(i64, i64)>> {
    if q.get("size").is_none() && q.get("page").is_none() {
        return Ok(None);
    }
    let size = match q.get("size") {
        None => DEFAULT_PAGE_SIZE,
        Some(size) => integer(size)
            .filter(|n| (1..=MAX_PAGE_SIZE).contains(n))
            .ok_or_else(|| {
                Error::bad(format!("Page size must be between 1 and {MAX_PAGE_SIZE}."))
            })?,
    };
    let page = match q.get("page") {
        None => 0,
        Some(page) => integer(page)
            .filter(|n| *n >= 0)
            .ok_or_else(|| Error::bad("Page must be a nonnegative integer."))?,
    };
    let offset = page
        .checked_mul(size)
        .filter(|n| *n <= hanabi_protocol::MAX_SAFE_INTEGER)
        .ok_or_else(|| Error::bad("Pagination offset is too large."))?;
    Ok(Some((size, offset)))
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

pub fn router(pool: PgPool, config: &PublicConfig) -> Router {
    let state = PublicState {
        pool,
        config: config.clone(),
        templates: Arc::new(pages::templates()),
        site_totals: Arc::default(),
    };
    let mut router = Router::new();
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
        for i in 1..=hanabi_protocol::MAX_PLAYERS {
            path = format!("{path}/{{player{i}}}");
            router = router.route(&path, get(pages::page));
        }
    }
    router = router
        .route("/stats", get(pages::page))
        .route("/videos", get(pages::page))
        .route("/password-reset", get(pages::page));
    let mut api = Router::new();
    for root in ["history", "history-full", "full-history"] {
        let mut path = format!("/api/v1/{root}");
        api = api.route(&path, get(api_handler));
        for i in 1..=hanabi_protocol::MAX_PLAYERS {
            path = format!("{path}/{{player{i}}}");
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
            return Ok(crate::accounts::banned());
        }
    }
    Ok(next.run(request).await)
}

async fn api_handler(
    State(state): State<PublicState>,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    Path(params): Path<Params>,
    RawQuery(raw): RawQuery,
) -> Response {
    api_response(&state, &uri, &params, raw)
        .await
        .unwrap_or_else(Error::json)
}

async fn api_response(
    state: &PublicState,
    uri: &axum::http::Uri,
    params: &Params,
    raw: Option<String>,
) -> Result<Response> {
    let mode = uri.path().split('/').nth(3).unwrap_or("");
    let list_parameters = match mode {
        "history" | "seed" => data::list_parameters(mode),
        "variants" if params.contains_key("id") => data::list_parameters(mode),
        _ => Vec::new(),
    };
    let list_parameters: Vec<&str> = list_parameters.iter().map(String::as_str).collect();
    let accepted: &[&str] = match mode {
        "history-full" | "full-history" => &["start", "end"],
        "seed-full" | "full-seed" => &["page", "size"],
        _ => &list_parameters,
    };
    let q = strict_query(raw.as_deref(), accepted)?;
    Ok(match mode {
        "variants" if !params.contains_key("id") => Json(catalog::names()).into_response(),
        "variants-full" => Json(catalog::metadata()).into_response(),
        "history" | "seed" | "variants" => {
            let selection = data::selection(state, params, mode).await?;
            Json(data::list(state, selection, &q, mode).await?).into_response()
        }
        "history-full" | "full-history" | "seed-full" | "full-seed" => {
            let seed = mode.contains("seed");
            let mut s =
                data::selection(state, params, if seed { "seed" } else { "history" }).await?;
            if seed {
                s.page = pagination(&q)?;
            } else {
                let bound = |name: &str| {
                    q.get(name)
                        .map(|value| {
                            integer(value).ok_or_else(|| {
                                Error::bad(format!("The {name} game ID must be an integer."))
                            })
                        })
                        .transpose()
                };
                s.start = bound("start")?;
                s.end = bound("end")?;
            }
            Json(data::history(state, s, seed).await?).into_response()
        }
        "tags" => Json(data::tagged(state, params, false).await?).into_response(),
        "tag" => Json(data::tagged(state, params, true).await?).into_response(),
        _ => return Err(Error::not_found("Not found.")),
    })
}
