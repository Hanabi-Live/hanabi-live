use hanabi_protocol::UserId;

/// An operation that the hub carries out for an administrator, or for an account that signs out.
#[derive(Clone, Debug)]
pub enum Operation {
    Ban {
        user_id: UserId,
        ip: String,
    },
    Mute {
        user_id: UserId,
    },
    /// Closes the account's connections after its sessions end.
    SignOut {
        user_id: UserId,
    },
}

use crate::store::PoolReport;
use crate::{
    errors::HttpError,
    lifecycle::{Control, Phase, Refusal},
    metrics,
    query::Query,
};
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{ConnectInfo, Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use std::{collections::BTreeMap, net::SocketAddr, sync::Arc};

/// A restriction that an administrator puts on an account's IP address.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Restriction {
    Ban,
    Mute,
}

/// A command of the localhost operations interface.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Command {
    Restrict(Restriction),
    GracefulRestart,
    GracefulStop,
    Metrics,
    Version,
}

impl Command {
    const ALL: [Self; 6] = [
        Self::Restrict(Restriction::Ban),
        Self::Restrict(Restriction::Mute),
        Self::GracefulRestart,
        Self::GracefulStop,
        Self::Metrics,
        Self::Version,
    ];

    const fn path(self) -> &'static str {
        match self {
            Self::Restrict(Restriction::Ban) => "/ban",
            Self::Restrict(Restriction::Mute) => "/mute",
            Self::GracefulRestart => "/gracefulRestart",
            Self::GracefulStop => "/gracefulStop",
            Self::Metrics => "/metrics",
            Self::Version => "/version",
        }
    }

    fn from_path(path: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|command| command.path() == path)
    }

    /// Whether the command changes state.
    const fn changes_state(self) -> bool {
        !matches!(self, Self::Metrics | Self::Version)
    }

    /// Whether the command waits for the lifecycle to admit it. A graceful restart checks the
    /// lifecycle itself.
    const fn admitted(self) -> bool {
        matches!(self, Self::Restrict(_) | Self::GracefulStop)
    }

    /// The query parameters that the command takes, and the fields of its form body, if it takes
    /// one.
    const fn accepted(self) -> (&'static [&'static str], Option<&'static [&'static str]>) {
        match self {
            Self::Restrict(_) => (&[], Some(&["username"])),
            Self::GracefulRestart | Self::GracefulStop => (&["message"], None),
            Self::Metrics | Self::Version => (&[], None),
        }
    }
}

pub fn router(control: Arc<Control>) -> Router {
    let mut router = Router::new();
    for command in Command::ALL {
        // Commands that change state take only POST, so that a page cannot send them with a link
        // or an image.
        let method = if command.changes_state() {
            post(handle)
        } else {
            get(handle)
        };
        router = router.route(command.path(), method);
    }
    router
        .fallback(|| async { (StatusCode::NOT_FOUND, "Not found.\n") })
        .method_not_allowed_fallback(|| async {
            (
                StatusCode::METHOD_NOT_ALLOWED,
                "This URL does not accept that method.\n",
            )
        })
        .layer(middleware::from_fn_with_state(control.clone(), guard))
        .layer(middleware::from_fn(crate::errors::http_context))
        .with_state(control)
}

/// Whether a `Host` header names this machine, with or without a port.
fn loopback_host(host: &[u8]) -> bool {
    let Ok(authority) = axum::http::uri::Authority::try_from(host) else {
        return false;
    };
    matches!(authority.host(), "localhost" | "127.0.0.1" | "[::1]")
}

async fn guard(State(control): State<Arc<Control>>, request: Request, next: Next) -> Response {
    let peer = request.extensions().get::<ConnectInfo<SocketAddr>>();
    // A page on another domain can resolve that domain to this machine (DNS rebinding). Its
    // requests then name that domain as the host.
    let foreign_host = request
        .headers()
        .get(header::HOST)
        .is_some_and(|host| !loopback_host(host.as_bytes()));
    let browser = foreign_host
        || request.headers().contains_key(header::ORIGIN)
        || request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|s| s.as_bytes().eq_ignore_ascii_case(b"cross-site"));
    let response = if browser || !peer.is_some_and(|p| p.0.ip().is_loopback()) {
        (StatusCode::FORBIDDEN,"Browser or non-loopback requests are not allowed on the localhost operations interface.\n").into_response()
    } else {
        let admission = if Command::from_path(request.uri().path()).is_some_and(Command::admitted) {
            Some(control.lifecycle.admit_operation().await)
        } else {
            None
        };
        if let Some(Err(Refusal::Unavailable)) = admission {
            crate::errors::Report::known(
                crate::errors::http_operation("Localhost operation"),
                hanabi_protocol::NoticeCode::LiveStateUnavailable,
                "Live-state recovery is unhealthy or ownership was lost. No new operation was admitted; inspect recovery before retrying.",
                StatusCode::SERVICE_UNAVAILABLE,
            ).response(true)
        } else if let Some(Err(Refusal::NotAccepting)) = admission {
            crate::errors::Report::known(
                crate::errors::http_operation("Localhost operation"),
                hanabi_protocol::NoticeCode::ServerDraining,
                "The server is draining for maintenance. Wait for the restart to complete.",
                StatusCode::SERVICE_UNAVAILABLE,
            )
            .response(true)
        } else {
            let mut metric = metrics::COMMAND_METRICS.start(request.uri().path());
            let response = next.run(request).await;
            if response.status().is_success() {
                metric.success();
            }
            drop(admission);
            response
        }
    };
    let mut response = response;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response
}
type Result<T> = std::result::Result<T, HttpError>;
fn bad(message: &str) -> HttpError {
    HttpError::bad(format!("{message}\n"))
}
const MAX_DOWNTIME_MESSAGE_CHARS: usize = 500;
/// An optional reason for the downtime, shown to connected users and in Discord.
fn downtime_message(query: &Query) -> Result<Option<String>> {
    let Some(message) = query
        .get("message")
        .map(str::trim)
        .filter(|m| !m.is_empty())
    else {
        return Ok(None);
    };
    if message.chars().count() > MAX_DOWNTIME_MESSAGE_CHARS {
        return Err(bad(&format!(
            "The message cannot be longer than {MAX_DOWNTIME_MESSAGE_CHARS} characters."
        )));
    }
    if message.chars().any(char::is_control) {
        return Err(bad("The message cannot contain control characters."));
    }
    Ok(Some(message.to_owned()))
}
async fn handle(State(control): State<Arc<Control>>, request: Request) -> Result<Response> {
    let Some(command) = Command::from_path(request.uri().path()) else {
        return Err(HttpError::not_found("Not found.\n"));
    };
    // Each command takes exactly these query parameters, and a form body only if it lists fields.
    let (accepted_query, accepted_body) = command.accepted();
    let query =
        Query::parse(request.uri().query(), accepted_query).map_err(|message| bad(&message))?;
    let body = to_bytes(request.into_body(), crate::query::MAX_FORM_BODY_BYTES)
        .await
        .map_err(|_| {
            HttpError::Refused(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Request body too large.\n".into(),
            )
        })?;
    let body = match accepted_body {
        Some(accepted) => {
            let form =
                std::str::from_utf8(&body).map_err(|_| bad("The form body is not UTF-8."))?;
            Query::parse(Some(form), accepted).map_err(|message| bad(&message))?
        }
        None if body.is_empty() => Query::default(),
        None => return Err(bad("This command takes no body.")),
    };
    match command {
        Command::Restrict(restriction) => return restrict(&control, restriction, &body).await,
        Command::GracefulRestart => {
            if control.lifecycle.phase() == Phase::Starting {
                return Err(HttpError::Refused(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "The server is not ready for lifecycle operations.\n".into(),
                ));
            }
            if control.lifecycle.draining() {
                return Err(bad("The server is already draining."));
            }
            control
                .request_stop(crate::lifecycle::StopReason::Restart(downtime_message(
                    &query,
                )?))
                .await?;
        }
        Command::GracefulStop => control.graceful_stop(downtime_message(&query)?).await?,
        Command::Metrics => return metrics_report(&control).await,
        Command::Version => return Ok(format!("{}\n", control.version).into_response()),
    }
    Ok("success\n".into_response())
}
async fn restrict(control: &Control, restriction: Restriction, body: &Query) -> Result<Response> {
    let name = body
        .get("username")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| bad("You must specify a username."))?;
    let account = sqlx::query!(
        "SELECT id,username,last_ip FROM users WHERE normalized_username=$1",
        crate::accounts::normalize_string(name)
    )
    .fetch_optional(&control.pool)
    .await
    .map_err(anyhow::Error::from)?;
    let Some(account) = account else {
        return Ok(format!("User \"{name}\" does not exist in the database.\n").into_response());
    };
    let id: i32 = account.id;
    let username: String = account.username.clone();
    let ip: String = account.last_ip.clone();
    let result = match restriction {
        Restriction::Ban => {
            sqlx::query!(
                "INSERT INTO banned_ips(ip,user_id) VALUES($1,$2) ON CONFLICT(ip) DO NOTHING",
                &ip,
                id
            )
            .execute(&control.pool)
            .await
        }
        Restriction::Mute => {
            sqlx::query!(
                "INSERT INTO muted_ips(ip,user_id) VALUES($1,$2) ON CONFLICT(ip) DO NOTHING",
                &ip,
                id
            )
            .execute(&control.pool)
            .await
        }
    };
    let inserted = result.map_err(anyhow::Error::from)?.rows_affected() > 0;
    if !inserted {
        return Ok(format!(
            "User \"{username}\" has an IP of \"{ip}\", but it is already {}.\n",
            match restriction {
                Restriction::Ban => "banned",
                Restriction::Mute => "muted",
            }
        )
        .into_response());
    }
    control
        .operation(match restriction {
            Restriction::Ban => Operation::Ban {
                user_id: UserId::try_from(id)?,
                ip: ip.clone(),
            },
            Restriction::Mute => Operation::Mute {
                user_id: UserId::try_from(id)?,
            },
        })
        .await?;
    Ok("success\n".into_response())
}
/// What `/metrics` reports.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MetricsReport {
    uptime_seconds: f64,
    draining: bool,
    discord: &'static str,
    /// The server process's memory, which is `null` on a system that does not report it.
    runtime: Option<metrics::Memory>,
    commands: BTreeMap<String, metrics::Metric>,
    recovery: metrics::Recovery,
    database: DatabaseReport,
    lobby_database: Option<PoolReport>,
}
#[derive(Serialize)]
#[serde(untagged)]
enum DatabaseReport {
    Pool(PoolReport),
    Error { error: &'static str },
}
async fn metrics_report(control: &Control) -> Result<Response> {
    control.inspect().await?;
    let mut report = MetricsReport {
        uptime_seconds: control.monotonic_started.elapsed().as_secs_f64(),
        draining: control.lifecycle.draining(),
        discord: control.discord_status(),
        runtime: metrics::memory().await?,
        commands: metrics::COMMAND_METRICS.snapshot(),
        recovery: metrics::recovery(control.storage_healthy()),
        database: DatabaseReport::Error {
            error: "Database pool activity is unavailable.",
        },
        lobby_database: None,
    };
    let database = if let Some(store) = control.store() {
        store
            .database_reports()
            .await
            .map(|(primary, reads)| (primary, Some(reads)))
    } else {
        sqlx::query_scalar!("SELECT 1 AS \"value!\"")
            .fetch_one(&control.pool)
            .await
            .map(|_| {
                let primary = PoolReport {
                    max: control.pool.options().get_max_connections(),
                    total: i64::from(control.pool.size()),
                    active: None,
                    idle: i64::try_from(control.pool.num_idle()).unwrap_or(i64::MAX),
                    idle_transaction: None,
                };
                (primary, None)
            })
            .map_err(anyhow::Error::from)
    };
    let status = match database {
        Ok((primary, reads)) => {
            report.database = DatabaseReport::Pool(primary);
            report.lobby_database = reads;
            if control.storage_healthy() {
                StatusCode::OK
            } else {
                StatusCode::SERVICE_UNAVAILABLE
            }
        }
        Err(error) => {
            tracing::warn!("Database metrics unavailable: {error}");
            StatusCode::SERVICE_UNAVAILABLE
        }
    };
    Ok((status, Json(report)).into_response())
}
