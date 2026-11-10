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

/// The path that every versioned HTTP API route begins with.
pub(crate) const API_PREFIX: &str = "/api/v1";

/// How long browsers keep a release's versioned assets, which never change under the same URL.
const VERSIONED_ASSET_MAX_AGE_SECONDS: i32 = 365 * hanabi_protocol::SECONDS_PER_DAY;

#[derive(Clone)]
pub struct PublicConfig {
    pub root: PathBuf,
    pub session_secret: Arc<str>,
    pub domain: Arc<str>,
    pub use_tls: bool,
    pub client_version: Arc<str>,
    pub is_dev: bool,
}

#[derive(Clone)]
struct PublicState {
    pool: PgPool,
    config: PublicConfig,
    templates: Arc<minijinja::Environment<'static>>,
    site_totals: Arc<tokio::sync::Mutex<pages::SiteTotals>>,
}

use crate::errors::HttpError;
type Result<T> = std::result::Result<T, HttpError>;

type Params = HashMap<String, String>;
use crate::query::Query;

/// Parses a request's query string, rejecting any parameter that the URL does not take.
fn strict_query(raw: Option<&str>, accepted: &[&str]) -> Result<Query> {
    Query::parse(raw, accepted).map_err(HttpError::bad)
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
                HttpError::bad(format!("Page size must be between 1 and {MAX_PAGE_SIZE}."))
            })?,
    };
    let page = match q.get("page") {
        None => 0,
        Some(page) => integer(page)
            .filter(|n| *n >= 0)
            .ok_or_else(|| HttpError::bad("Page must be a nonnegative integer."))?,
    };
    let offset = page
        .checked_mul(size)
        .filter(|n| *n <= hanabi_protocol::MAX_SAFE_INTEGER)
        .ok_or_else(|| HttpError::bad("Pagination offset is too large."))?;
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
    router = router.route("/password-reset", get(pages::page));
    let mut api = Router::new();
    for root in ["history", "history-full"] {
        let mut path = format!("{API_PREFIX}/{root}");
        api = api.route(&path, get(api_handler));
        for i in 1..=hanabi_protocol::MAX_PLAYERS {
            path = format!("{path}/{{player{i}}}");
            api = api.route(&path, get(api_handler));
        }
    }
    for (root, param) in [
        ("seed", "seed"),
        ("seed-full", "seed"),
        ("tags", "player1"),
        ("tag", "tag"),
    ] {
        api = api
            .route(&format!("{API_PREFIX}/{root}"), get(api_handler))
            .route(
                &format!("{API_PREFIX}/{root}/{{{param}}}"),
                get(api_handler),
            );
    }
    api = api
        .route(&format!("{API_PREFIX}/variants"), get(api_handler))
        .route(&format!("{API_PREFIX}/variants-full"), get(api_handler))
        .route(&format!("{API_PREFIX}/variants/{{id}}"), get(api_handler))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            ban_check,
        ));
    router
        .merge(api)
        .nest_service(
            "/public",
            Router::new()
                .fallback_service(tower_http::services::ServeDir::new(
                    config.root.join("public"),
                ))
                .layer(axum::middleware::from_fn_with_state(
                    state.clone(),
                    cache_public_assets,
                )),
        )
        .route_service(
            "/favicon.ico",
            tower_http::services::ServeFile::new(config.root.join("public/img/favicon.ico")),
        )
        .with_state(state)
        .layer(axum::middleware::from_fn(crate::errors::lobby_reads))
        .layer(axum::middleware::from_fn(crate::errors::http_context))
}

/// Lets browsers cache the current release's assets for good. Their URLs carry the client version,
/// either in the file name or as the query string. Every other file (such as images and sounds) can
/// change under the same URL, so browsers must check that their copy is current before using it.
/// Development builds reuse the version of the checked-out commit, so their assets always revalidate.
async fn cache_public_assets(
    State(state): State<PublicState>,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    let version = &*state.config.client_version;
    let uri = request.uri();
    let versioned = !state.config.is_dev
        && (uri.path().contains(&format!(".{version}.")) || uri.query() == Some(version));
    let mut response = next.run(request).await;
    let cache_control = if versioned && response.status() == StatusCode::OK {
        axum::http::HeaderValue::from_str(&format!(
            "public, max-age={VERSIONED_ASSET_MAX_AGE_SECONDS}, immutable"
        ))
        .expect("a valid header value")
    } else {
        axum::http::HeaderValue::from_static("no-cache")
    };
    response
        .headers_mut()
        .insert(axum::http::header::CACHE_CONTROL, cache_control);
    response
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
        .unwrap_or_else(HttpError::json)
}

async fn api_response(
    state: &PublicState,
    uri: &axum::http::Uri,
    params: &Params,
    raw: Option<String>,
) -> Result<Response> {
    let mode = uri
        .path()
        .strip_prefix(API_PREFIX)
        .and_then(|rest| rest.split('/').nth(1))
        .unwrap_or("");
    let list_parameters = match mode {
        "history" | "seed" => data::list_parameters(mode),
        "variants" if params.contains_key("id") => data::list_parameters(mode),
        _ => Vec::new(),
    };
    let list_parameters: Vec<&str> = list_parameters.iter().map(String::as_str).collect();
    let accepted: &[&str] = match mode {
        "history-full" => &["start", "end"],
        "seed-full" => &["page", "size"],
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
        "history-full" | "seed-full" => {
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
                                HttpError::bad(format!("The {name} game ID must be an integer."))
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
        _ => return Err(HttpError::not_found("Not found.")),
    })
}
