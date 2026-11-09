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
    HashFailure, HashOverload, hash_password, regenerate_token, token_lookup_hash, verify_password,
};
#[cfg(test)]
pub use normalization::normalize_username;
pub use normalization::{
    MAX_CONSECUTIVE_MARKS, MAX_USERNAME_LENGTH, USERNAME_SPECIAL_CHARACTERS, escape_html,
    max_consecutive_marks, normalize_chat, normalize_string, remove_disallowed_characters,
    truncate_to_max_bytes, validate_username,
};
pub(crate) use rate_limit::Counter;
pub use rate_limit::TooMuchPasswordWork;

use crate::{cookie, public_http::API_PREFIX, query::Query};
use anyhow::Result;
use axum::{
    Form, Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, State},
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
use std::{net::SocketAddr, sync::Arc};

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
        .route(&format!("/{TEST_ACCOUNT}"), get(test_login))
        .route("/logout", get(logout))
        .route("/test-cookie", get(test_cookie))
        .route(
            &format!("{API_PREFIX}/identity/token"),
            get(identity_token).post(identity_token),
        )
        .route(&format!("{API_PREFIX}/identity"), post(identity))
        .route("/password-reset", post(password_hash))
        .layer(DefaultBodyLimit::max(crate::query::MAX_FORM_BODY_BYTES))
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

/// Parses the query string of a route that may name an account with `?account=`. It rejects any
/// parameter that the route does not take, and an account that is not a user ID.
pub(crate) fn account_query(raw: Option<&str>, accepted: &[&str]) -> Result<Query, String> {
    let query = Query::parse(raw, accepted)?;
    if query
        .get("account")
        .is_some_and(|value| parse_account(value).is_none())
    {
        return Err("The account must be a positive user ID.".into());
    }
    Ok(query)
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
        if clear { 0 } else { cookie::MAX_AGE }
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
    let mut response = api_error(
        StatusCode::TOO_MANY_REQUESTS,
        format!(
            "Too many login attempts. Please try again in {}.",
            rate_limit::minutes_to_wait(wait)
        ),
    );
    response.headers_mut().insert(
        header::RETRY_AFTER,
        axum::http::HeaderValue::from(wait.as_secs().max(1)),
    );
    response
}

fn unauthorized(message: impl Into<String>) -> Response {
    api_error(StatusCode::UNAUTHORIZED, message)
}

/// Rejects a client from a different release. Current clients reload the page instead of showing
/// this explanation, so players only see it when the reload served the same client again, such as
/// from a stale cache; hence the hard-refresh advice.
/// The client version that bots send instead of the current client version.
pub const BOT_VERSION: &str = "bot";

/// Flags an account that authenticated as a bot, so bot privileges can later depend on the flag.
pub async fn mark_bot(pool: &PgPool, id: i32) -> Result<()> {
    sqlx::query!(
        "UPDATE users SET is_bot=TRUE WHERE id=$1 AND NOT is_bot",
        id
    )
    .execute(pool)
    .await?;
    Ok(())
}

pub fn validate_client_version(version: &str, current: &str) -> Result<(), String> {
    if !version.is_empty() && (version == BOT_VERSION || version == current) {
        return Ok(());
    }
    Err(format!(
        concat!(
            "You are running an outdated version of the client code.",
            "<ul>",
            "<li>You are on version: <strong>v{}</strong></li>",
            "<li>The latest version is: <strong>v{}</strong></li>",
            "</ul>",
            "Please perform a <a href=\"https://www.getfilecloud.com/blog/2015/03/tech-tip-how-to-do-hard-refresh-in-browsers/\">hard-refresh</a> to get the latest version. ",
            "(Note that a hard-refresh is different from a normal refresh.)",
            "<ul>",
            "<li>On Windows, the hotkey for this is: <code>Ctrl + Shift + R</code></li>",
            "<li>On MacOS, the hotkey for this is: <code>Command + Shift + R</code></li>",
            "</ul>",
        ),
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
    crate::errors::Report::from_error(
        "Account operation",
        error,
        Some(crate::store::DATABASE_TIMEOUT),
    )
    .description
}

fn account_failure(operation: &'static str, error: &anyhow::Error) -> Response {
    let report = crate::errors::Report::from_error(
        format!("Account {operation}"),
        error,
        Some(crate::store::DATABASE_TIMEOUT),
    );
    let mut response = report.response(true);
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
    input: Result<Form<LoginRequest>, axum::extract::rejection::FormRejection>,
) -> Response {
    let input = match input {
        Ok(Form(input)) => input,
        Err(rejection) => {
            return unreadable_body(
                rejection.status(),
                "The login form must contain only a username, password, newPassword, version, and darkMode.",
            );
        }
    };
    match login_inner(&state, &address.ip().to_string(), input).await {
        Ok(response) => response,
        Err(error) => account_failure("login", &error),
    }
}

async fn login_inner(state: &Accounts, ip: &str, input: LoginRequest) -> Result<Response> {
    if is_banned(&state.pool, ip).await? {
        return Ok(banned());
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
        let error = ApiError {
            code: Some(hanabi_protocol::OUTDATED_CLIENT_CODE.into()),
            ..ApiError::new(message)
        };
        return Ok((StatusCode::UNAUTHORIZED, Json(error)).into_response());
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
        if input.version == BOT_VERSION {
            mark_bot(&state.pool, id).await?;
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
        let settings = crate::lobby::changed_settings(&hanabi_protocol::Settings {
            dark_mode: input.dark_mode,
            ..Default::default()
        });
        id = sqlx::query_scalar!(
            "INSERT INTO users (username, normalized_username, password_hash, last_ip, is_bot, settings)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            username,
            normalized,
            hash,
            ip,
            input.version == BOT_VERSION,
            settings
        )
        .fetch_one(&state.pool)
        .await?;
    }
    let bot = if input.version == BOT_VERSION {
        " as a bot"
    } else {
        ""
    };
    eprintln!("Successful login for account {id}{bot} from IP: {ip}");
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

/// The shared test account, whose password is its username. Visiting `/test` signs in to it.
pub const TEST_ACCOUNT: &str = "test";

/// Signs in to the test account (creating it if needed), then goes to the lobby.
async fn test_login(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
) -> Response {
    let input = LoginRequest {
        username: TEST_ACCOUNT.into(),
        password: TEST_ACCOUNT.into(),
        version: state.config.version.clone(),
        ..LoginRequest::default()
    };
    let response = match login_inner(&state, &address.ip().to_string(), input).await {
        Ok(response) => response,
        Err(error) => return account_failure("login", &error),
    };
    if !response.status().is_success() {
        return response;
    }
    with_cookies(
        (
            StatusCode::SEE_OTHER,
            [(header::CACHE_CONTROL, "no-store"), (header::LOCATION, "/")],
        )
            .into_response(),
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok().map(str::to_owned)),
    )
}

/// Signs out of the requested account, or the most recent sign-in, without affecting other accounts.
async fn logout(State(state): State<Arc<Accounts>>, uri: Uri, headers: HeaderMap) -> Response {
    let query = match account_query(uri.query(), &["account", "dev"]) {
        Ok(query) => query,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let dev = match query.flag("dev") {
        Ok(dev) => dev,
        Err(message) => return api_error(StatusCode::BAD_REQUEST, message),
    };
    let latest = session_id(&headers, &state.config.secret, None);
    let requested = query.get("account").and_then(parse_account);
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
                (header::LOCATION, if dev { "/?dev" } else { "/" }),
            ],
        )
            .into_response(),
        cookies,
    )
}

async fn test_cookie(State(state): State<Arc<Accounts>>, uri: Uri, headers: HeaderMap) -> Response {
    if let Err(message) = account_query(uri.query(), &["account"]) {
        return api_error(StatusCode::BAD_REQUEST, message);
    }
    if session_id(&headers, &state.config.secret, uri.query()).is_some() {
        "OK\n".into_response()
    } else {
        StatusCode::NO_CONTENT.into_response()
    }
}

/// An error response for a client that reads JSON: every route other than an HTML page.
pub(crate) fn api_error(status: StatusCode, message: impl Into<String>) -> Response {
    (status, Json(ApiError::new(message))).into_response()
}

pub(crate) const BANNED: &str = "Your IP address has been banned. Please contact an administrator if you think this is a mistake.";

/// The error for a request body that could not be read: too large, or not in the expected form.
fn unreadable_body(status: StatusCode, malformed: &str) -> Response {
    if status == StatusCode::PAYLOAD_TOO_LARGE {
        api_error(status, "The request body is too large.")
    } else {
        api_error(StatusCode::BAD_REQUEST, malformed)
    }
}

pub(crate) fn banned() -> Response {
    api_error(StatusCode::FORBIDDEN, BANNED)
}

async fn identity_token(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: Uri,
    headers: HeaderMap,
    body: Result<axum::body::Bytes, axum::extract::rejection::BytesRejection>,
) -> Response {
    if let Err(message) = account_query(uri.query(), &["account"]) {
        return api_error(StatusCode::BAD_REQUEST, message);
    }
    match body {
        Ok(body) if body.is_empty() => {}
        Ok(_) => return api_error(StatusCode::BAD_REQUEST, "This request takes no body."),
        Err(rejection) => {
            return unreadable_body(rejection.status(), "This request takes no body.");
        }
    }
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(banned());
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
            expires_at: crate::model::timestamp(result.expires_at),
        })
        .into_response())
    }
    .await;
    result.unwrap_or_else(|error| account_failure("identity-token", &error))
}

async fn identity(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    body: Result<Json<serde_json::Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(banned());
        }
        let token = match body {
            Ok(Json(value)) => hanabi_protocol::decode::<IdentityRequest>(&value)
                .ok()
                .map(|request| request.token),
            Err(rejection) => {
                return Ok(unreadable_body(
                    rejection.status(),
                    "The request must be a JSON object with only a non-empty token.",
                ));
            }
        };
        let Some(token) = token else {
            return Ok(api_error(
                StatusCode::BAD_REQUEST,
                "The request must be a JSON object with only a non-empty token.",
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
    result.unwrap_or_else(|error| account_failure("identity-lookup", &error))
}

/// Hashes a new password, which a user gives to an administrator to reset their account.
async fn password_hash(
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    body: Result<Json<serde_json::Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let request = match body {
        Ok(Json(value)) => hanabi_protocol::decode::<PasswordHashRequest>(&value).ok(),
        Err(rejection) => {
            return unreadable_body(rejection.status(), "You must specify a password.");
        }
    };
    let Some(request) = request else {
        return api_error(StatusCode::BAD_REQUEST, "You must specify a password.");
    };
    match hash_password(&address.ip().to_string(), request.password).await {
        Ok(hash) => Json(PasswordHashResponse { hash }).into_response(),
        Err(error) => account_failure("password-hash", &error),
    }
}
