//! PostgreSQL-backed login and identity routes.
mod crypto;
mod lockout;
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
    MAX_CONSECUTIVE_MARKS, MAX_USERNAME_LENGTH, USERNAME_SPECIAL_CHARACTERS, clean_text,
    max_consecutive_marks, normalize_chat, normalize_discord_chat, normalize_string,
    truncate_to_max_chars, validate_username,
};
pub use rate_limit::TooMuchPasswordWork;
pub(crate) use rate_limit::{Counter, network_key};

use crate::errors::HttpError;
use crate::{
    actors::HubCommand, cookie, operations::Operation, public_http::API_PREFIX, query::Query,
};
use anyhow::Result;
use axum::{
    Form, Json, Router,
    extract::{ConnectInfo, DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, Uri, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use hanabi_protocol::{
    ClientKind, IdentityRequest, IdentityTokenResponse, LoginRequest, Notice, PasswordHashRequest,
    PasswordHashResponse,
};
use sqlx::PgPool;
use std::{net::SocketAddr, sync::Arc};
use time::OffsetDateTime;
use tokio::sync::mpsc;

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
    hub: mpsc::Sender<HubCommand>,
}

pub fn router(pool: PgPool, config: AccountConfig, hub: mpsc::Sender<HubCommand>) -> Router {
    TEST_ACCOUNTS
        .iter()
        .fold(Router::new(), |router, &account| {
            router.route(
                &format!("/{account}"),
                get(move |state, address, headers| test_login(state, address, headers, account)),
            )
        })
        .route("/login", post(login))
        .route("/logout", post(logout))
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
            hub,
        }))
}

/// Reads the signed-in account. A tab may choose any account this browser is signed in to with
/// `?account=<user ID>`; otherwise the most recent sign-in is used.
///
/// The session may have ended since it was signed. Callers must compare its version with the
/// account's, such as with `session_username`.
pub fn session(
    headers: &HeaderMap,
    secret: &str,
    requested: Option<i32>,
) -> Option<cookie::Session> {
    let account_name = requested.map(cookie::account_name);
    let now = OffsetDateTime::now_utc().unix_timestamp();
    let mut sessions = headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| {
            let (name, value) = pair.trim().split_once('=')?;
            if name != cookie::NAME && Some(name) != account_name.as_deref() {
                return None;
            }
            let session = cookie::decode(value, secret, now).ok()?;
            requested
                .is_none_or(|requested| requested == session.id)
                .then_some(session)
        });
    if requested.is_some() {
        // Both cookies can name the requested account, and only the newer sign-in may be current.
        sessions.max_by_key(|session| session.version)
    } else {
        sessions.next()
    }
}

/// The username of the session's account, if the account exists and the session has not ended.
pub async fn session_username(pool: &PgPool, session: cookie::Session) -> Result<Option<String>> {
    Ok(sqlx::query_scalar!(
        "SELECT username FROM users WHERE id=$1 AND session_version=$2",
        session.id,
        session.version
    )
    .fetch_optional(pool)
    .await?)
}

fn parse_account(value: &str) -> Option<i32> {
    value.parse().ok().filter(|id| *id > 0)
}

/// The account that a query from `account_query` names, if any.
pub(crate) fn requested_account(query: &Query) -> Option<i32> {
    query.get("account").and_then(parse_account)
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
    let mut response = HttpError::refused(
        StatusCode::TOO_MANY_REQUESTS,
        format!(
            "Too many login attempts. Please try again in {}.",
            rate_limit::minutes_to_wait(wait)
        ),
    )
    .json();
    response.headers_mut().insert(
        header::RETRY_AFTER,
        axum::http::HeaderValue::from(wait.as_secs().max(1)),
    );
    response
}

fn too_many_token_checks(wait: std::time::Duration) -> Response {
    let mut response = HttpError::refused(
        StatusCode::TOO_MANY_REQUESTS,
        format!(
            "Too many checks of this identity token. Please try again in {}.",
            rate_limit::minutes_to_wait(wait)
        ),
    )
    .json();
    response.headers_mut().insert(
        header::RETRY_AFTER,
        axum::http::HeaderValue::from(wait.as_secs().max(1)),
    );
    response
}

fn unauthorized(message: impl Into<String>) -> Response {
    HttpError::refused(StatusCode::UNAUTHORIZED, message).json()
}

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

/// A person who logs in to a bot's account makes it a normal account again. The bot marks it again
/// when it logs in.
pub async fn clear_bot(pool: &PgPool, id: i32) -> Result<()> {
    sqlx::query!("UPDATE users SET is_bot=FALSE WHERE id=$1 AND is_bot", id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Rejects a client from a different release. Current clients reload the page instead of showing
/// this explanation, so players only see it when the reload served the same client again, such as
/// from a stale cache.
pub fn validate_client_version(version: &str, current: &str) -> Result<(), String> {
    if !version.is_empty() && version == current {
        return Ok(());
    }
    Err(format!(
        concat!(
            "You are running an outdated version of the client code.\n",
            "You are on: {}\n",
            "The latest: {}\n",
            "Please perform a refresh to get the latest version.",
        ),
        if version.is_empty() {
            "unknown"
        } else {
            version
        },
        current
    ))
}

#[cfg(test)]
fn failure_diagnostic(error: &anyhow::Error) -> String {
    crate::errors::Report::from_error("Account operation", error).description
}

fn account_failure(operation: &'static str, error: &anyhow::Error) -> Response {
    let report = crate::errors::Report::from_error(format!("Account {operation}"), error);
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
    headers: HeaderMap,
    input: Result<Form<LoginRequest>, axum::extract::rejection::FormRejection>,
) -> Response {
    let input = match input {
        Ok(Form(input)) => input,
        Err(rejection) => {
            return unreadable_body(
                rejection.status(),
                "The login form must contain only a username, password, newPassword, version, createAccount, and client.",
            );
        }
    };
    match login_inner(&state, &address.ip().to_string(), &headers, input).await {
        Ok(response) => response,
        Err(error) => account_failure("login", &error),
    }
}

/// Reads the cookie that says that this browser signed in to the account before.
fn known_device(headers: &HeaderMap, secret: &str, id: i32) -> Option<cookie::Device> {
    let name = cookie::device_name(id);
    let now = OffsetDateTime::now_utc().unix_timestamp();
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .filter(|(cookie_name, _)| *cookie_name == name)
        .filter_map(|(_, value)| cookie::decode_device(value, secret, now).ok())
        .find(|device| device.id == id)
}

async fn login_inner(
    state: &Accounts,
    ip: &str,
    headers: &HeaderMap,
    input: LoginRequest,
) -> Result<Response> {
    if is_banned(&state.pool, ip).await? {
        return Ok(banned());
    }
    for (name, missing) in [
        ("username", input.username.is_empty()),
        ("password", input.password.is_empty()),
        // Only the website sends a version.
        (
            "version",
            input.client == ClientKind::Web && input.version.is_none(),
        ),
    ] {
        if missing {
            return Ok(unauthorized(format!(
                "You must provide the \"{name}\" parameter to log in."
            )));
        }
    }
    let username = match validate_username(&input.username) {
        Ok(username) => username,
        Err(message) => return Ok(unauthorized(message)),
    };
    if let Err(message) = validate_client_version(
        input.version.as_deref().unwrap_or_default(),
        &state.config.version,
    ) && input.client == ClientKind::Web
    {
        let error = Notice::outdated_client(message, &state.config.version);
        return Ok((StatusCode::UNAUTHORIZED, Json(error)).into_response());
    }
    let attempt = match state.limits.begin(ip) {
        Ok(attempt) => attempt,
        Err(wait) => return Ok(too_many_attempts(wait)),
    };
    let existing = sqlx::query!(
        "SELECT id, password_hash AS \"password_hash?\", session_version FROM users
         WHERE username=$1",
        username
    )
    .fetch_optional(&state.pool)
    .await?;
    let id: i32;
    // New accounts start at the column's default.
    let mut version = 0;
    let mut device = None;
    if let Some(user) = existing {
        id = user.id;
        version = user.session_version;
        let Some(original) = user.password_hash else {
            let error = Notice {
                code: Some(hanabi_protocol::NoticeCode::PasswordResetRequired),
                ..Notice::new("This account requires a password reset.")
            };
            return Ok((StatusCode::UNAUTHORIZED, Json(error)).into_response());
        };
        // An account with too many failed logins checks no more passwords for a while, not even
        // the correct one. A browser that signed in to the account before has its own limit, so
        // that the guesses of others cannot lock the owner out (see `lockout`).
        device = known_device(headers, &state.config.secret, id);
        let wait = match device {
            Some(device) => state.limits.device_wait(device),
            None => lockout::count_attempt(&state.pool, id).await?,
        };
        if let Some(wait) = wait {
            tracing::warn!("Refused a login for account {id} from IP: {ip}");
            return Ok(too_many_attempts(wait));
        }
        if !verify_password(ip, input.password.clone(), original.clone()).await? {
            attempt.keep();
            if let Some(device) = device {
                state.limits.fail_device(device);
            }
            tracing::warn!("Failed login for account {id} from IP: {ip}");
            return Ok(unauthorized("That is not the correct password."));
        }
        lockout::clear(&state.pool, id).await?;
        let automatic_upgrade =
            input.new_password.is_none() && crypto::password_needs_upgrade(&original)?;
        if input.new_password.is_some() || automatic_upgrade {
            let password = input.new_password.unwrap_or(input.password);
            let hash = hash_password(ip, password).await?;
            // Do not let a concurrent login overwrite a newer password change. A password change
            // ends the account's other sessions, and this one gets a cookie with the new version.
            let changed =
                update_password_if_unchanged(&state.pool, id, &hash, &original, !automatic_upgrade)
                    .await?;
            match changed {
                Some(changed) => {
                    version = changed;
                    if !automatic_upgrade {
                        close_sessions(state, id).await?;
                    }
                }
                None if !automatic_upgrade => {
                    return Ok(unauthorized("That is not the correct password."));
                }
                None => tracing::info!(
                    "Skipped password hash upgrade after a concurrent credential change."
                ),
            }
        }
        if input.client == ClientKind::Bot {
            mark_bot(&state.pool, id).await?;
        } else {
            clear_bot(&state.pool, id).await?;
        }
    } else {
        let normalized = normalize_string(username);
        if normalized.is_empty() {
            return Ok(unauthorized(
                "That username cannot be transliterated to ASCII. Please try using a simpler username or try using less special characters.",
            ));
        }
        // A new name must also not look like an existing one, such as "AIice" (with a capital i)
        // next to "Alice", or "Modern" next to "Modem". An account that has no key yet (see
        // `backfill_lookalike_keys`) is still found by its normalized name, as before the keys.
        let key = normalization::lookalike_key(username);
        let keys = [normalized.clone(), key.clone()];
        let similar: Option<String> = sqlx::query_scalar!(
            "SELECT username FROM users
             WHERE normalized_username=ANY($1) OR lookalike_key=$2 LIMIT 1",
            &keys,
            // Names that have no key do not look alike.
            (!key.is_empty()).then_some(&key)
        )
        .fetch_optional(&state.pool)
        .await?;
        if let Some(similar) = similar {
            return Ok(unauthorized(format!(
                "That username is too similar to the existing user of \"{similar}\". If you are sure that this is your username, then please check to make sure that you are capitalized your username correctly. If you are logging on for the first time, then please choose a different username.",
            )));
        }
        if let Err(message) = normalization::validate_new_username(username) {
            return Ok(unauthorized(message));
        }
        if !input.create_account {
            let error = Notice {
                code: Some(hanabi_protocol::NoticeCode::NoAccount),
                ..Notice::new(format!("There is no account named \"{username}\"."))
            };
            return Ok((StatusCode::UNAUTHORIZED, Json(error)).into_response());
        }
        if input.new_password.is_some() {
            return Ok(unauthorized(
                "You requested an account creation. You cannot ask for a password change at the same time.",
            ));
        }
        let hash = hash_password(ip, input.password).await?;
        // Creating an account costs as much as a guess, so it counts against the address.
        attempt.keep();
        id = sqlx::query_scalar!(
            "INSERT INTO users
             (username, normalized_username, lookalike_key, password_hash, last_ip, is_bot)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
            username,
            normalized,
            key,
            hash,
            ip,
            input.client == ClientKind::Bot
        )
        .fetch_one(&state.pool)
        .await?;
    }
    let client = match input.client {
        ClientKind::Web => "",
        ClientKind::Bot => " as a bot",
        ClientKind::App => " from an app",
    };
    tracing::info!("Successful login for account {id}{client} from IP: {ip}");
    let now = OffsetDateTime::now_utc().unix_timestamp();
    let signed = cookie::encode(cookie::Session { id, version }, &state.config.secret, now)?;
    // From now on, this browser is one that signed in to the account before.
    let device = cookie::encode_device(
        device.unwrap_or_else(|| cookie::Device {
            id,
            nonce: rand::random(),
        }),
        &state.config.secret,
        now,
    )?;
    Ok(with_cookies(
        Json(hanabi_protocol::UserRef {
            user_id: hanabi_protocol::UserId::try_from(id)?,
            username: username.into(),
        })
        .into_response(),
        [
            cookie_header(&state.config, cookie::NAME, &signed, false),
            cookie_header(&state.config, &cookie::account_name(id), &signed, false),
            cookie_header(&state.config, &cookie::device_name(id), &device, false),
        ],
    ))
}

/// The accounts whose lookalike key one transaction of `backfill_lookalike_keys` fills in.
const LOOKALIKE_BATCH_SIZE: i64 = 500;

/// Fills in the lookalike key of each account that has none: an account from before the keys, or
/// one that an administrator renamed. SQL cannot compute the key, so the server does. Each batch
/// commits by itself, so the work can stop at any time, and the next start continues it.
pub(crate) async fn backfill_lookalike_keys(pool: &PgPool) -> Result<()> {
    let mut last_id = 0;
    let mut filled = 0;
    loop {
        let mut transaction = pool.begin().await?;
        // Other transactions lock several accounts in the order of their IDs, such as the one that
        // saves a game. Locking in the same order here cannot deadlock with them.
        let accounts = sqlx::query!(
            "SELECT id, username FROM users WHERE lookalike_key IS NULL AND id>$1
             ORDER BY id LIMIT $2 FOR NO KEY UPDATE",
            last_id,
            LOOKALIKE_BATCH_SIZE
        )
        .fetch_all(&mut *transaction)
        .await?;
        let Some(last) = accounts.last() else {
            break;
        };
        last_id = last.id;
        let (ids, keys): (Vec<i32>, Vec<String>) = accounts
            .iter()
            .map(|account| (account.id, normalization::lookalike_key(&account.username)))
            .unzip();
        filled += sqlx::query!(
            "UPDATE users SET lookalike_key=k.key
             FROM UNNEST($1::integer[],$2::text[]) AS k(id,key) WHERE users.id=k.id",
            &ids,
            &keys
        )
        .execute(&mut *transaction)
        .await?
        .rows_affected();
        transaction.commit().await?;
    }
    if filled > 0 {
        tracing::info!("Filled in the lookalike keys of {filled} accounts.");
    }
    Ok(())
}

/// Returns the account's session version after the change, or `None` if the password changed
/// concurrently. Ending the sessions increases the version, which signs out every other session.
async fn update_password_if_unchanged(
    pool: &PgPool,
    id: i32,
    hash: &str,
    original: &str,
    end_sessions: bool,
) -> Result<Option<i32>> {
    Ok(sqlx::query_scalar!(
        "UPDATE users
         SET password_hash=$2, session_version=session_version + CASE WHEN $4 THEN 1 ELSE 0 END
         WHERE id=$1 AND password_hash=$3
         RETURNING session_version",
        id,
        hash,
        original,
        end_sessions
    )
    .fetch_optional(pool)
    .await?)
}

/// The shared test accounts, whose passwords are their usernames. Visiting `/<name>` (such as
/// `/test2`) signs in to one.
pub const TEST_ACCOUNTS: [&str; 9] = [
    "test", "test2", "test3", "test4", "test5", "test6", "test7", "test8", "test9",
];

/// Signs in to a test account (creating it if needed), then goes to the lobby.
async fn test_login(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    account: &'static str,
) -> Response {
    let input = LoginRequest {
        username: account.into(),
        password: account.into(),
        version: Some(state.config.version.clone()),
        create_account: true,
        ..LoginRequest::default()
    };
    let response = match login_inner(&state, &address.ip().to_string(), &headers, input).await {
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
/// It ends every session of that account, so that a copy of the cookie stops working too. It takes
/// only POST, so that the origin check stops other sites from signing a player out.
async fn logout(State(state): State<Arc<Accounts>>, uri: Uri, headers: HeaderMap) -> Response {
    let query = match account_query(uri.query(), &["account", "dev"]) {
        Ok(query) => query,
        Err(message) => {
            return HttpError::refused(StatusCode::BAD_REQUEST, message).json();
        }
    };
    let dev = match query.flag("dev") {
        Ok(dev) => dev,
        Err(message) => {
            return HttpError::refused(StatusCode::BAD_REQUEST, message).json();
        }
    };
    let latest = session(&headers, &state.config.secret, None).map(|session| session.id);
    let requested = requested_account(&query);
    if let Some(signed_in) = requested
        .or(latest)
        .and_then(|id| session(&headers, &state.config.secret, Some(id)))
        && let Err(error) = end_sessions(&state, signed_in).await
    {
        return account_failure("logout", &error);
    }
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
            StatusCode::SEE_OTHER,
            [
                (header::CACHE_CONTROL, "no-store"),
                (header::LOCATION, if dev { "/?dev" } else { "/" }),
            ],
        )
            .into_response(),
        cookies,
    )
}

/// Ends every session of the cookie's account, unless they have already ended, and closes the
/// account's connections.
async fn end_sessions(state: &Accounts, session: cookie::Session) -> Result<()> {
    let ended = sqlx::query!(
        "UPDATE users SET session_version=session_version + 1 WHERE id=$1 AND session_version=$2",
        session.id,
        session.version
    )
    .execute(&state.pool)
    .await?
    .rows_affected()
        > 0;
    if ended {
        close_sessions(state, session.id).await?;
    }
    Ok(())
}

/// Closes the connections of an account whose sessions have ended, and deletes its identity token.
async fn close_sessions(state: &Accounts, id: i32) -> Result<()> {
    sqlx::query!("DELETE FROM user_identity_tokens WHERE user_id=$1", id)
        .execute(&state.pool)
        .await?;
    let user_id = hanabi_protocol::UserId::try_from(id)?;
    crate::actors::request(&state.hub, |reply| HubCommand::Operations {
        command: Operation::SignOut { user_id },
        reply,
    })
    .await??;
    Ok(())
}

pub(crate) const BANNED: &str = "Your IP address has been banned. Please contact an administrator if you think this is a mistake.";

/// The error for a request body that could not be read: too large, or not in the expected form.
fn unreadable_body(status: StatusCode, malformed: &str) -> Response {
    if status == StatusCode::PAYLOAD_TOO_LARGE {
        HttpError::refused(status, "The request body is too large.").json()
    } else {
        HttpError::refused(StatusCode::BAD_REQUEST, malformed).json()
    }
}

pub(crate) fn banned() -> Response {
    HttpError::refused(StatusCode::FORBIDDEN, BANNED).json()
}

async fn identity_token(
    State(state): State<Arc<Accounts>>,
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    uri: Uri,
    headers: HeaderMap,
    body: Result<axum::body::Bytes, axum::extract::rejection::BytesRejection>,
) -> Response {
    let query = match account_query(uri.query(), &["account"]) {
        Ok(query) => query,
        Err(message) => return HttpError::refused(StatusCode::BAD_REQUEST, message).json(),
    };
    match body {
        Ok(body) if body.is_empty() => {}
        Ok(_) => {
            return HttpError::refused(StatusCode::BAD_REQUEST, "This request takes no body.")
                .json();
        }
        Err(rejection) => {
            return unreadable_body(rejection.status(), "This request takes no body.");
        }
    }
    let result: Result<Response> = async {
        if is_banned(&state.pool, &address.ip().to_string()).await? {
            return Ok(banned());
        }
        let Some(session) = session(&headers, &state.config.secret, requested_account(&query))
        else {
            return Ok(
                HttpError::refused(StatusCode::UNAUTHORIZED, "You must be logged in.").json(),
            );
        };
        let id = session.id;
        let Some(username) = session_username(&state.pool, session).await? else {
            return Ok(
                HttpError::refused(StatusCode::UNAUTHORIZED, "You must be logged in.").json(),
            );
        };
        let ip = address.ip().to_string();
        let secret = &state.config.secret;
        let Some(result) =
            crypto::regenerate_session_token(&state.pool, secret, id, session.version, &ip).await?
        else {
            // The session ended while the token was hashed.
            return Ok(
                HttpError::refused(StatusCode::UNAUTHORIZED, "You must be logged in.").json(),
            );
        };
        tracing::info!("Issued identity token for account {id} from IP: {ip}");
        Ok(Json(IdentityTokenResponse {
            user: hanabi_protocol::UserRef {
                user_id: hanabi_protocol::UserId::try_from(id)?,
                username: username.into(),
            },
            token: result.token,
            expires_at: hanabi_protocol::Timestamp::from(result.expires_at),
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
            return Ok(HttpError::refused(
                StatusCode::BAD_REQUEST,
                "The request must be a JSON object with only a non-empty token.",
            )
            .json());
        };
        let lookup = token_lookup_hash(&state.config.secret, &token)?;
        let row = sqlx::query!(
            "SELECT u.id, u.username, t.token_hash, t.expires_at FROM user_identity_tokens t
             JOIN users u ON u.id=t.user_id WHERE t.token_lookup_hash=$1",
            lookup
        )
        .fetch_optional(&state.pool)
        .await?;
        if let Some(row) = row
            && row.expires_at > OffsetDateTime::now_utc()
        {
            if let Err(wait) = rate_limit::charge_token_work(row.id) {
                return Ok(too_many_token_checks(wait));
            }
            if crypto::verify_hash(token, row.token_hash.clone()).await? {
                let ip = address.ip();
                tracing::info!("Verified identity token from IP: {ip}");
                return Ok(Json(hanabi_protocol::UserRef {
                    user_id: hanabi_protocol::UserId::try_from(row.id)?,
                    username: row.username.clone().into(),
                })
                .into_response());
            }
        }
        Ok(HttpError::refused(StatusCode::NOT_FOUND, "Identity token not found.").json())
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
        return HttpError::refused(StatusCode::BAD_REQUEST, "You must specify a password.").json();
    };
    match hash_password(&address.ip().to_string(), request.password).await {
        Ok(hash) => Json(PasswordHashResponse { hash }).into_response(),
        Err(error) => account_failure("password-hash", &error),
    }
}
