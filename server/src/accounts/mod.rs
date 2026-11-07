//! PostgreSQL-backed login and identity routes.
mod crypto;
mod normalization;
mod rate_limit;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod upgrade_tests;

pub use crypto::{
    HashFailure, HashOverload, IdentityToken, hash_password, regenerate_token, token_lookup_hash,
    verify_password,
};
pub use normalization::{
    escape_html, has_username_emoji, max_consecutive_marks, normalize_chat, normalize_string,
    normalize_username, truncate_to_max_bytes, validate_username,
};

use crate::cookie;
use anyhow::Result;
use axum::{
    Form, Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::PgPool;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};

#[derive(Clone)]
pub struct AccountConfig {
    pub secret: String,
    pub domain: String,
    pub use_tls: bool,
    pub version: String,
    pub is_dev: bool,
}

struct Accounts {
    pool: PgPool,
    config: AccountConfig,
    limits: rate_limit::LoginLimits,
}

pub fn router(pool: PgPool, config: AccountConfig) -> Router {
    Router::new()
        .route("/login", post(login))
        .route("/logout", get(logout))
        .route("/test-cookie", get(test_cookie))
        .route(
            "/api/v1/identity/token",
            get(identity_token).post(identity_token),
        )
        .route("/api/v1/identity", post(identity))
        .layer(DefaultBodyLimit::max(8192))
        .with_state(Arc::new(Accounts {
            pool,
            config,
            limits: rate_limit::LoginLimits::default(),
        }))
}

pub fn session_id(headers: &HeaderMap, secret: &str) -> Option<i32> {
    headers.get_all(header::COOKIE).iter().find_map(|value| {
        value.to_str().ok()?.split(';').find_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            (name == cookie::NAME)
                .then(|| cookie::decode(value, secret, Utc::now().timestamp()).ok())
                .flatten()
        })
    })
}

pub async fn is_banned(pool: &PgPool, ip: &str) -> Result<bool> {
    Ok(sqlx::query_scalar!(
        "SELECT EXISTS (SELECT 1 FROM banned_ips WHERE ip=$1) AS \"value!\"",
        ip
    )
    .fetch_one(pool)
    .await?)
}

pub async fn is_muted(pool: &PgPool, ip: &str) -> Result<bool> {
    Ok(sqlx::query_scalar!(
        "SELECT EXISTS (SELECT 1 FROM muted_ips WHERE ip=$1) AS \"value!\"",
        ip
    )
    .fetch_one(pool)
    .await?)
}

fn cookie_header(config: &AccountConfig, value: &str, clear: bool) -> String {
    let mut result = format!(
        "{}={value}; Path=/; Max-Age={}",
        cookie::NAME,
        if clear { 0 } else { 31536000 }
    );
    if !config.is_dev {
        if !config.domain.is_empty() {
            result.push_str("; Domain=");
            result.push_str(&config.domain);
        }
        result.push_str("; HttpOnly; SameSite=Strict");
        if config.use_tls {
            result.push_str("; Secure");
        }
    }
    result
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Login {
    username: String,
    password: String,
    new_password: String,
    version: String,
}

fn too_many_attempts(wait: std::time::Duration) -> Response {
    let minutes = wait.as_secs().div_ceil(60).max(1);
    (
        StatusCode::TOO_MANY_REQUESTS,
        [(header::RETRY_AFTER, wait.as_secs().max(1).to_string())],
        format!(
            "Too many login attempts. Please try again in {minutes} minute{}.\n",
            if minutes == 1 { "" } else { "s" }
        ),
    )
        .into_response()
}

fn unauthorized(message: impl Into<String>) -> Response {
    (StatusCode::UNAUTHORIZED, format!("{}\n", message.into())).into_response()
}

pub fn validate_client_version(version: &str, current: &str) -> Result<(), String> {
    if !version.is_empty() && (version == "bot" || version == current) {
        return Ok(());
    }
    Err(format!(
        "You are running an outdated version of the client code.<br />(You are on <strong>v{}</strong> and the latest is <strong>v{}</strong>.)<br />Please perform a <a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">hard-refresh</a> to get the latest version.<br />(Note that a hard-refresh is different from a normal refresh.)<br />On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
        escape_html(if version.is_empty() {
            "unknown"
        } else {
            version
        }),
        escape_html(current)
    ))
}

#[cfg(test)]
fn failure_diagnostic(error: &anyhow::Error) -> String {
    crate::errors::Report::from_error("Account operation", error, Some(30)).description
}

fn account_failure(operation: &'static str, error: anyhow::Error, json_response: bool) -> Response {
    let report =
        crate::errors::Report::from_error(format!("Account {operation}"), &error, Some(30));
    let mut response = report.response(json_response);
    if error.downcast_ref::<HashOverload>().is_some() {
        response.headers_mut().insert(
            header::RETRY_AFTER,
            axum::http::HeaderValue::from_static("1"),
        );
    }
    response
}

async fn login(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Form(input): Form<Login>,
) -> Response {
    match login_inner(&state, &address.ip().to_string(), input).await {
        Ok(response) => response,
        Err(error) => account_failure("login", error, false),
    }
}

async fn login_inner(state: &Accounts, ip: &str, input: Login) -> Result<Response> {
    if is_banned(&state.pool, ip).await? {
        return Ok(unauthorized(
            "Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
        ));
    }
    for (name, value) in [
        ("username", &input.username),
        ("password", &input.password),
        ("version", &input.version),
    ] {
        if value.is_empty() {
            return Ok(unauthorized(format!(
                "You must provide the \"{name}\" parameter to log in."
            )));
        }
    }
    let username = match validate_username(&input.username) {
        Ok(username) => username,
        Err(message) => return Ok(unauthorized(message)),
    };
    if let Err(message) = validate_client_version(&input.version, &state.config.version) {
        return Ok(unauthorized(message));
    }
    let mut attempt = match state.limits.begin(ip) {
        Ok(attempt) => attempt,
        Err(wait) => return Ok(too_many_attempts(wait)),
    };
    let existing = sqlx::query!(
        "SELECT id, password_hash AS \"password_hash?\" FROM users WHERE username=$1",
        username
    )
    .fetch_optional(&state.pool)
    .await?;
    let id: i32;
    if let Some(user) = existing {
        id = user.id;
        if let Err(wait) = attempt.charge_account(id) {
            return Ok(too_many_attempts(wait));
        }
        let Some(original) = user.password_hash else {
            return Ok(unauthorized(
                "This account requires a password reset. Please follow the <a href=\"/password-reset\">password reset instructions</a>.",
            ));
        };
        if !verify_password(input.password.clone(), original.clone()).await? {
            attempt.keep();
            eprintln!("Failed login for account {id} from {ip}.");
            return Ok(unauthorized("That is not the correct password."));
        }
        let automatic_upgrade =
            input.new_password.is_empty() && crypto::password_needs_upgrade(&original)?;
        if !input.new_password.is_empty() || automatic_upgrade {
            let password = if input.new_password.is_empty() {
                input.password
            } else {
                input.new_password
            };
            let hash = hash_password(password).await?;
            // Do not let a concurrent login overwrite a newer password change.
            let changed = update_password_if_unchanged(&state.pool, id, &hash, &original).await?;
            if !changed && !automatic_upgrade {
                return Ok(unauthorized("That is not the correct password."));
            }
            if !changed {
                eprintln!("Skipped password hash upgrade after a concurrent credential change.");
            }
        }
    } else {
        if !input.new_password.is_empty() {
            return Ok(unauthorized(
                "You requested an account creation. You cannot ask for a password change at the same time.",
            ));
        }
        let normalized = normalize_string(username);
        if normalized.is_empty() {
            return Ok(unauthorized(
                "That username cannot be transliterated to ASCII. Please try using a simpler username or try using less special characters.",
            ));
        }
        let similar: Option<String> = sqlx::query_scalar!(
            "SELECT username FROM users WHERE normalized_username=$1",
            &normalized
        )
        .fetch_optional(&state.pool)
        .await?;
        if let Some(similar) = similar {
            return Ok(unauthorized(format!(
                "That username is too similar to the existing user of \"{}\". If you are sure that this is your username, then please check to make sure that you are capitalized your username correctly. If you are logging on for the first time, then please choose a different username.",
                escape_html(&similar)
            )));
        }
        let hash = hash_password(input.password).await?;
        // Creating an account costs as much as a guess, so it counts against the address.
        attempt.keep();
        id = sqlx::query_scalar!(
            "INSERT INTO users (username, normalized_username, password_hash, last_ip)
             VALUES ($1,$2,$3,$4) RETURNING id",
            username,
            normalized,
            hash,
            ip
        )
        .fetch_one(&state.pool)
        .await?;
    }
    let signed = cookie::encode(id, &state.config.secret, Utc::now().timestamp())?;
    Ok((
        [(
            header::SET_COOKIE,
            cookie_header(&state.config, &signed, false),
        )],
        "OK\n",
    )
        .into_response())
}

async fn update_password_if_unchanged(
    pool: &PgPool,
    id: i32,
    hash: &str,
    original: &str,
) -> Result<bool> {
    Ok(sqlx::query!(
        "UPDATE users SET password_hash=$2 WHERE id=$1 AND password_hash=$3",
        id,
        hash,
        original
    )
    .execute(pool)
    .await?
    .rows_affected()
        == 1)
}

async fn logout(
    State(state): State<Arc<Accounts>>,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    (
        StatusCode::MOVED_PERMANENTLY,
        [
            (header::SET_COOKIE, cookie_header(&state.config, "", true)),
            (header::CACHE_CONTROL, "no-store".to_owned()),
            (
                header::LOCATION,
                if query.contains_key("dev") {
                    "/?dev"
                } else {
                    "/"
                }
                .to_owned(),
            ),
        ],
    )
        .into_response()
}

async fn test_cookie(State(state): State<Arc<Accounts>>, headers: HeaderMap) -> Response {
    if session_id(&headers, &state.config.secret).is_some() {
        "OK\n".into_response()
    } else {
        StatusCode::NO_CONTENT.into_response()
    }
}

fn api_error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

fn api_banned() -> Response {
    (StatusCode::BAD_REQUEST, Json(
        "Your IP address has been banned. Please contact an administrator if you think this is a mistake."
    )).into_response()
}

async fn identity_token(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(api_banned());
        }
        let Some(id) = session_id(&headers, &state.config.secret) else {
            return Ok(api_error(
                StatusCode::UNAUTHORIZED,
                "You must be logged in.",
            ));
        };
        let username: Option<String> =
            sqlx::query_scalar!("SELECT username FROM users WHERE id=$1", id)
                .fetch_optional(&state.pool)
                .await?;
        let Some(username) = username else {
            return Ok(api_error(
                StatusCode::UNAUTHORIZED,
                "You must be logged in.",
            ));
        };
        let result = regenerate_token(&state.pool, &state.config.secret, id).await?;
        Ok(Json(json!({
            "username":username, "token":result.token,
            "expires_at":result.expires_at.format("%a, %d %b %Y %H:%M:%S GMT").to_string()
        }))
        .into_response())
    }
    .await;
    result.unwrap_or_else(|error| account_failure("identity-token", error, true))
}

async fn identity(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    body: Result<Json<serde_json::Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(api_banned());
        }
        let token = body
            .ok()
            .and_then(|Json(value)| value["token"].as_str().map(str::to_owned));
        let Some(token) = token.filter(|token| !token.is_empty()) else {
            return Ok(api_error(
                StatusCode::BAD_REQUEST,
                "Missing identity token.",
            ));
        };
        let lookup = token_lookup_hash(&state.config.secret, &token)?;
        let row = sqlx::query!(
            "SELECT u.username, t.token_hash, t.expires_at FROM user_identity_tokens t
             JOIN users u ON u.id=t.user_id WHERE t.token_lookup_hash=$1",
            lookup
        )
        .fetch_optional(&state.pool)
        .await?;
        if let Some(row) = row {
            let expiry: DateTime<Utc> = row.expires_at;
            if expiry > Utc::now() && verify_password(token, row.token_hash.clone()).await? {
                return Ok(Json(json!({"username":row.username.clone()})).into_response());
            }
        }
        Ok(api_error(
            StatusCode::NOT_FOUND,
            "Identity token not found.",
        ))
    }
    .await;
    result.unwrap_or_else(|error| account_failure("identity-lookup", error, true))
}
