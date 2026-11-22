//! Native, read-only public HTTP surface. The engine is injected so historical exports use
//! the same rules as live games rather than a second implementation.
mod achievements;
mod catalog;
mod data;
mod pages;
mod replay;
pub(crate) mod security;
#[cfg(test)]
mod tests;

use axum::{
    Json, Router,
    extract::{ConnectInfo, Path, RawQuery, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::{collections::HashMap, net::SocketAddr, path::PathBuf, sync::Arc};

pub(crate) use hanabi_protocol::API_PREFIX;

/// How long browsers keep a release's versioned assets, which never change under the same URL.
const VERSIONED_ASSET_MAX_AGE_SECONDS: i64 = 365 * hanabi_protocol::SECONDS_PER_DAY;

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
    seed_averages: Arc<std::sync::Mutex<pages::SeedAverages>>,
}

use crate::errors::HttpError;
type Result<T> = std::result::Result<T, HttpError>;

type Params = HashMap<String, String>;
use crate::query::Query;

/// Parses a request's query string, rejecting any parameter that the URL does not take.
fn strict_query(raw: Option<&str>, accepted: &[&str]) -> Result<Query> {
    Query::parse(raw, accepted).map_err(HttpError::bad)
}

pub(super) use hanabi_protocol::DEFAULT_PAGE_LIMIT;

/// The most games that a page of the HTTP API can have. It is larger than `MAX_PAGE_LIMIT`, which
/// limits the pages that people read, so that a script can fetch a long history in a few requests.
const MAX_API_PAGE_LIMIT: i64 = 10_000;

/// How long a statistics scan or a page of more than `MAX_PAGE_LIMIT` games may run, longer than
/// the lobby pool's usual limit.
const AGGREGATE_STATEMENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// A transaction whose statements may run for up to `AGGREGATE_STATEMENT_TIMEOUT`.
async fn scan(state: &PublicState) -> Result<sqlx::Transaction<'static, sqlx::Postgres>> {
    let mut transaction = state.pool.begin().await?;
    sqlx::query_scalar!(
        "SELECT set_config('statement_timeout',$1,true)",
        AGGREGATE_STATEMENT_TIMEOUT.as_millis().to_string()
    )
    .fetch_one(&mut *transaction)
    .await?;
    Ok(transaction)
}

/// The query parameters that page a list.
const PAGE_PARAMETERS: [&str; 2] = ["offset", "limit"];

/// A page of a list: at most `limit` rows, after the first `offset`.
#[derive(Clone, Copy)]
struct Page {
    limit: i64,
    offset: i64,
}

/// The page that a request asks for. Without `limit`, a page has `DEFAULT_PAGE_LIMIT` rows, and
/// without `offset`, it is the first page.
fn pagination(q: &Query) -> Result<Page> {
    let limit = match q.get("limit") {
        None => DEFAULT_PAGE_LIMIT,
        Some(limit) => integer(limit)
            .filter(|n| (1..=MAX_API_PAGE_LIMIT).contains(n))
            .ok_or_else(|| {
                HttpError::bad(format!(
                    "The limit must be between 1 and {MAX_API_PAGE_LIMIT}."
                ))
            })?,
    };
    let offset = match q.get("offset") {
        None => 0,
        Some(offset) => integer(offset)
            .filter(|n| (0..=hanabi_protocol::MAX_SAFE_INTEGER).contains(n))
            .ok_or_else(|| {
                HttpError::bad(format!(
                    "The offset must be an integer from 0 to {}.",
                    hanabi_protocol::MAX_SAFE_INTEGER
                ))
            })?,
    };
    Ok(Page { limit, offset })
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
        seed_averages: Arc::default(),
    };
    let mut router = Router::new();
    for path in [
        "/",
        "/lobby",
        "/pre-game",
        "/pre-game/{tableId}",
        "/game",
        "/game/{tableId}",
        "/game/{tableId}/shadow/{seat}",
        "/replay",
        "/replay/{databaseId}",
        "/replay/{databaseId}/{turnId}",
        "/shared-replay",
        "/shared-replay/{databaseId}",
        "/shared-replay/{databaseId}/{turnId}",
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
    for (root, param) in [("seed", "seed"), ("tag", "tag"), ("export", "databaseId")] {
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
    let mut path = format!("{API_PREFIX}/history");
    api = api.route(&path, get(api_handler));
    for i in 1..=hanabi_protocol::MAX_PLAYERS {
        path = format!("{path}/{{player{i}}}");
        api = api.route(&path, get(api_handler));
    }
    for (root, param) in [("seed", "seed"), ("tags", "player1"), ("tag", "tag")] {
        api = api
            .route(&format!("{API_PREFIX}/{root}"), get(api_handler))
            .route(
                &format!("{API_PREFIX}/{root}/{{{param}}}"),
                get(api_handler),
            );
    }
    api = api
        .route(
            &format!("{API_PREFIX}/seed/{{seed}}/stats"),
            get(api_handler),
        )
        .route(
            &format!("{API_PREFIX}/scores/{{player1}}"),
            get(api_handler),
        );
    api = api
        .route(&format!("{API_PREFIX}/variants"), get(api_handler))
        .route(&format!("{API_PREFIX}/variants-full"), get(api_handler))
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
    let mut segments = uri
        .path()
        .strip_prefix(API_PREFIX)
        .unwrap_or("")
        .trim_start_matches('/')
        .split('/');
    let mode = segments.next().unwrap_or("");
    // The only route under a seed's path is its statistics: "/seed/{seed}/stats".
    let seed_statistics =
        mode == "seed" && segments.next().is_some() && segments.next() == Some("stats");
    let list_parameters: Vec<String> = match mode {
        "history" | "seed" | "tags" | "tag" if !seed_statistics => data::list_parameters(mode),
        _ => Vec::new(),
    };
    let list_parameters: Vec<&str> = list_parameters.iter().map(String::as_str).collect();
    let q = strict_query(raw.as_deref(), &list_parameters)?;
    if seed_statistics {
        let seed = params
            .get("seed")
            .filter(|s| !s.is_empty())
            .ok_or_else(|| HttpError::not_found("You must specify a seed."))?;
        let statistics = pages::seed_statistics(state, seed)
            .await?
            .ok_or_else(|| HttpError::not_found("That seed has no games."))?;
        return Ok(Json(statistics).into_response());
    }
    Ok(match mode {
        "variants" => Json(catalog::names()).into_response(),
        "variants-full" => Json(catalog::metadata()).into_response(),
        "history" | "seed" | "tags" | "tag" => {
            let selection = data::selection(state, params, mode).await?;
            Json(data::list(state, selection, &q, mode).await?).into_response()
        }
        "scores" => {
            let users = data::players(state, params, false).await?;
            Json(pages::player_scores(state, users[0].0, &users[0].1).await?).into_response()
        }
        _ => return Err(HttpError::not_found("Not found.")),
    })
}
