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
    normalize_username, remove_disallowed_characters, truncate_to_max_bytes, validate_username,
};
pub use rate_limit::TooMuchPasswordWork;

use crate::cookie;
use anyhow::Result;
use axum::{
    Form, Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use hanabi_protocol::{
    ApiError, IdentityRequest, IdentityResponse, IdentityTokenResponse, LoginRequest,
    LoginResponse, PasswordHashRequest, PasswordHashResponse,
};
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
        .route("/password-reset", post(password_hash))
        .layer(DefaultBodyLimit::max(8192))
        .with_state(Arc::new(Accounts {
            pool,
            config,
            limits: rate_limit::LoginLimits::default(),
        }))
}

/// Reads the signed-in account. A tab may choose any account this browser is signed in to with
/// `?account=<user ID>`; otherwise the most recent sign-in is used.
pub fn session_id(headers: &HeaderMap, secret: &str, query: Option<&str>) -> Option<i32> {
    let requested = match url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .find(|(key, _)| key == "account")
    {
        Some((_, value)) => Some(parse_account(&value)?),
        None => None,
    };
    let account_name = requested.map(cookie::account_name);
    let now = Utc::now().timestamp();
    headers.get_all(header::COOKIE).iter().find_map(|value| {
        value.to_str().ok()?.split(';').find_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            if name != cookie::NAME && Some(name) != account_name.as_deref() {
                return None;
            }
            let id = cookie::decode(value, secret, now).ok()?;
            requested
                .is_none_or(|requested| requested == id)
                .then_some(id)
        })
    })
}

fn parse_account(value: &str) -> Option<i32> {
    value.parse().ok().filter(|id| *id > 0)
}

fn with_cookies(mut response: Response, cookies: impl IntoIterator<Item = String>) -> Response {
    for cookie in cookies {
        if let Ok(value) = header::HeaderValue::try_from(cookie) {
            response.headers_mut().append(header::SET_COOKIE, value);
        }
    }
    response
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

fn cookie_header(config: &AccountConfig, name: &str, value: &str, clear: bool) -> String {
    let mut result = format!(
        "{name}={value}; Path=/; Max-Age={}",
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
    if let Some(TooMuchPasswordWork(wait)) = error.downcast_ref() {
        response.headers_mut().insert(
            header::RETRY_AFTER,
            axum::http::HeaderValue::from(wait.as_secs().max(1)),
        );
    }
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
    Form(input): Form<LoginRequest>,
) -> Response {
    match login_inner(&state, &address.ip().to_string(), input).await {
        Ok(response) => response,
        Err(error) => account_failure("login", error, false),
    }
}

async fn login_inner(state: &Accounts, ip: &str, input: LoginRequest) -> Result<Response> {
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
        if !verify_password(ip, input.password.clone(), original.clone()).await? {
            attempt.keep();
            eprintln!("Failed login for account {id} from IP: {ip}");
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
            let hash = hash_password(ip, password).await?;
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
        let hash = hash_password(ip, input.password).await?;
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
    eprintln!("Successful login for account {id} from IP: {ip}");
    let signed = cookie::encode(id, &state.config.secret, Utc::now().timestamp())?;
    Ok(with_cookies(
        Json(LoginResponse {
            user_id: hanabi_protocol::UserId(id),
        })
        .into_response(),
        [
            cookie_header(&state.config, cookie::NAME, &signed, false),
            cookie_header(&state.config, &cookie::account_name(id), &signed, false),
        ],
    ))
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

/// Signs out of the requested account, or the most recent sign-in, without affecting other accounts.
async fn logout(
    State(state): State<Arc<Accounts>>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> Response {
    let latest = session_id(&headers, &state.config.secret, None);
    let requested = query.get("account").and_then(|value| parse_account(value));
    let mut cookies = Vec::new();
    if let Some(id) = requested.or(latest) {
        cookies.push(cookie_header(
            &state.config,
            &cookie::account_name(id),
            "",
            true,
        ));
    }
    if requested.is_none() || requested == latest {
        cookies.push(cookie_header(&state.config, cookie::NAME, "", true));
    }
    with_cookies(
        (
            StatusCode::MOVED_PERMANENTLY,
            [
                (header::CACHE_CONTROL, "no-store"),
                (
                    header::LOCATION,
                    if query.contains_key("dev") {
                        "/?dev"
                    } else {
                        "/"
                    },
                ),
            ],
        )
            .into_response(),
        cookies,
    )
}

async fn test_cookie(State(state): State<Arc<Accounts>>, uri: Uri, headers: HeaderMap) -> Response {
    if session_id(&headers, &state.config.secret, uri.query()).is_some() {
        "OK\n".into_response()
    } else {
        StatusCode::NO_CONTENT.into_response()
    }
}

fn api_error(status: StatusCode, message: &str) -> Response {
    (status, Json(ApiError::new(message))).into_response()
}

pub(crate) const BANNED: &str = "Your IP address has been banned. Please contact an administrator if you think this is a mistake.";

fn api_banned() -> Response {
    api_error(StatusCode::BAD_REQUEST, BANNED)
}

async fn identity_token(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: Uri,
    headers: HeaderMap,
) -> Response {
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(api_banned());
        }
        let Some(id) = session_id(&headers, &state.config.secret, uri.query()) else {
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
        let ip = address.ip().to_string();
        let result = regenerate_token(&state.pool, &state.config.secret, id, &ip).await?;
        eprintln!("Issued identity token for account {id} from IP: {ip}");
        Ok(Json(IdentityTokenResponse {
            username,
            token: result.token,
            expires_at: result
                .expires_at
                .format("%a, %d %b %Y %H:%M:%S GMT")
                .to_string(),
        })
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
            .and_then(|Json(value)| serde_json::from_value::<IdentityRequest>(value).ok())
            .map(|request| request.token);
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
            let ip = address.ip().to_string();
            if expiry > Utc::now() && verify_password(&ip, token, row.token_hash.clone()).await? {
                eprintln!("Verified identity token from IP: {ip}");
                return Ok(Json(IdentityResponse {
                    username: row.username.clone(),
                })
                .into_response());
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

/// Hashes a new password, which a user gives to an administrator to reset their account.
async fn password_hash(
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    body: Result<Json<serde_json::Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let Some(request) = body
        .ok()
        .and_then(|Json(value)| hanabi_protocol::decode::<PasswordHashRequest>(&value).ok())
    else {
        return api_error(StatusCode::BAD_REQUEST, "You must specify a password.");
    };
    match hash_password(&address.ip().to_string(), request.password).await {
        Ok(hash) => Json(PasswordHashResponse { hash }).into_response(),
        Err(error) => account_failure("password-hash", error, true),
    }
}
