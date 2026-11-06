//! PostgreSQL-backed Go-compatible login and identity routes.
mod crypto;
mod normalization;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod upgrade_tests;

pub use crypto::{
    HashOverload, IdentityToken, hash_password, regenerate_token, token_lookup_hash, verify_legacy,
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
        .with_state(Arc::new(Accounts { pool, config }))
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

fn unauthorized(message: impl Into<String>) -> Response {
    (StatusCode::UNAUTHORIZED, format!("{}\n", message.into())).into_response()
}

fn internal_error() -> Response {
    (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error\n").into_response()
}

fn failure_diagnostic(error: &anyhow::Error) -> String {
    if let Some(overload) = error.downcast_ref::<HashOverload>() {
        return overload.diagnostic().into();
    }
    if let Some(failure) = error.downcast_ref::<crypto::HashFailure>() {
        return failure.diagnostic().into();
    }
    if error.downcast_ref::<tokio::task::JoinError>().is_some() {
        return "password worker stopped unexpectedly".into();
    }
    if let Some(database) = error.downcast_ref::<sqlx::Error>() {
        return match database {
            sqlx::Error::PoolTimedOut => "database pool admission timed out".into(),
            sqlx::Error::PoolClosed => "database pool is closed".into(),
            sqlx::Error::Database(database) => {
                let code = database.code().filter(|code| {
                    code.len() == 5 && code.bytes().all(|c| c.is_ascii_alphanumeric())
                });
                format!(
                    "database operation failed (SQLSTATE {})",
                    code.as_deref().unwrap_or("unknown")
                )
            }
            _ => "database transport or decoding failed".into(),
        };
    }
    "internal account operation failed".into()
}

fn account_failure(operation: &'static str, error: anyhow::Error, json_response: bool) -> Response {
    // Error messages can contain SQL values, hashes, tokens or passwords.
    // Log a typed category/SQLSTATE instead of formatting the original error.
    eprintln!(
        "Account {operation} failed: {}.",
        failure_diagnostic(&error)
    );
    if error.downcast_ref::<HashOverload>().is_some() {
        let mut response = if json_response {
            api_error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Password processing is temporarily busy. Please try again.",
            )
        } else {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Password processing is temporarily busy. Please try again.\n",
            )
                .into_response()
        };
        response.headers_mut().insert(
            header::RETRY_AFTER,
            axum::http::HeaderValue::from_static("1"),
        );
        return response;
    }
    if json_response {
        api_error(StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error")
    } else {
        internal_error()
    }
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
    if input.version != "bot" {
        let Ok(version) = input.version.parse::<i64>() else {
            return Ok(unauthorized("The submitted version must be an integer."));
        };
        if Some(version) != state.config.version.parse::<i64>().ok() {
            return Ok(unauthorized(format!(
                "You are running an outdated version of the client code.<br />(You are on <strong>v{}</strong> and the latest is <strong>v{}</strong>.)<br />Please perform a <a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">hard-refresh</a> to get the latest version.<br />(Note that a hard-refresh is different from a normal refresh.)<br />On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code><br />On MacOS, the hotkey for this is: <code>Command + Shift + R</code>",
                escape_html(&input.version),
                escape_html(&state.config.version)
            )));
        }
    }
    let existing =
        sqlx::query!("SELECT id, password_hash AS \"password_hash?\", old_password_hash FROM users WHERE username=$1", username)
            .fetch_optional(&state.pool)
            .await?;
    let id: i32;
    if let Some(user) = existing {
        id = user.id;
        let legacy: Option<String> = user.old_password_hash.clone();
        let original: Option<String> = user.password_hash.clone();
        let correct = if let Some(ref legacy) = legacy {
            verify_legacy(&input.password, legacy)
        } else if let Some(ref original) = original {
            verify_password(input.password.clone(), original.clone()).await?
        } else {
            eprintln!("Account login failed: stored password hash is missing.");
            return Ok(internal_error());
        };
        if !correct {
            return Ok(unauthorized("That is not the correct password."));
        }
        let automatic_upgrade = legacy.is_none()
            && input.new_password.is_empty()
            && original
                .as_deref()
                .map(crypto::password_needs_upgrade)
                .transpose()?
                .unwrap_or(false);
        if legacy.is_some() || !input.new_password.is_empty() || automatic_upgrade {
            let password = if input.new_password.is_empty() {
                input.password
            } else {
                input.new_password
            };
            let hash = hash_password(password).await?;
            // Do not let a concurrent login overwrite a newer password change.
            let changed = update_password_if_unchanged(
                &state.pool,
                id,
                &hash,
                original.as_deref(),
                legacy.as_deref(),
            )
            .await?;
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
    original: Option<&str>,
    legacy: Option<&str>,
) -> Result<bool> {
    Ok(sqlx::query!(
        "UPDATE users SET password_hash=$2, old_password_hash=NULL WHERE id=$1
         AND password_hash IS NOT DISTINCT FROM $3
         AND old_password_hash IS NOT DISTINCT FROM $4",
        id,
        hash,
        original,
        legacy
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
