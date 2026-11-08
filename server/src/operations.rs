use serde_json::Value;

#[derive(Clone, Debug)]
pub enum Operation {
    Ban {
        user_id: i32,
        ip: String,
    },
    Mute {
        user_id: i32,
    },
    Inspect,
    Drained {
        reconnect: bool,
        message: Option<String>,
    },
}

pub type OperationReply = tokio::sync::oneshot::Sender<anyhow::Result<Value>>;

use crate::{lifecycle::Control, metrics, query::Query};
use anyhow::Context;
use axum::{
    Json, Router,
    body::to_bytes,
    extract::{ConnectInfo, Request, State},
    http::{StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde_json::json;
use std::{
    net::SocketAddr,
    sync::{Arc, atomic::Ordering},
};

pub fn router(control: Arc<Control>) -> Router {
    let mut router = Router::new();
    for path in ["/ban", "/mute"] {
        router = router.route(path, post(handle));
    }
    for path in ["/gracefulRestart", "/gracefulStop", "/metrics", "/version"] {
        router = router.route(path, get(handle));
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

fn mutating(path: &str) -> bool {
    matches!(path, "/ban" | "/mute" | "/gracefulStop")
}
async fn guard(State(control): State<Arc<Control>>, request: Request, next: Next) -> Response {
    let peer = request.extensions().get::<ConnectInfo<SocketAddr>>();
    let browser = request.headers().contains_key(header::ORIGIN)
        || request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|s| s.as_bytes().eq_ignore_ascii_case(b"cross-site"));
    let response = if browser || !peer.is_some_and(|p| p.0.ip().is_loopback()) {
        (StatusCode::FORBIDDEN,"Browser or non-loopback requests are not allowed on the localhost operations interface.\n").into_response()
    } else {
        let admission = if mutating(request.uri().path()) {
            Some(control.admission.clone().read_owned().await)
        } else {
            None
        };
        if admission.is_some() && !control.storage_healthy() {
            crate::errors::Report::known(
                crate::errors::http_operation("Localhost operation"),
                "live_state_unavailable",
                "Live-state recovery is unhealthy or ownership was lost. No new operation was admitted; inspect recovery before retrying.",
                StatusCode::SERVICE_UNAVAILABLE,
            ).response(true)
        } else if admission.is_some()
            && (!control.accepting.load(Ordering::Acquire)
                || control.draining.load(Ordering::Acquire))
        {
            crate::errors::Report::known(
                crate::errors::http_operation("Localhost operation"),
                "server_draining",
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
struct Error(StatusCode, String);
impl From<anyhow::Error> for Error {
    fn from(error: anyhow::Error) -> Self {
        let report = crate::errors::Report::from_error(
            crate::errors::http_operation("Localhost operation"),
            &error,
            Some(30),
        );
        report.log();
        Self(report.status, report.text())
    }
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, self.1).into_response()
    }
}
type Result<T> = std::result::Result<T, Error>;
fn bad(message: &str) -> Error {
    Error(StatusCode::BAD_REQUEST, format!("{message}\n"))
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
    let path = request.uri().path().to_owned();
    // Each command takes exactly these query parameters, and a form body only if it lists fields.
    let (accepted_query, accepted_body): (&[&str], Option<&[&str]>) = match path.as_str() {
        "/ban" | "/mute" => (&[], Some(&["username"])),
        "/gracefulRestart" | "/gracefulStop" => (&["message"], None),
        "/metrics" | "/version" => (&[], None),
        _ => return Err(Error(StatusCode::NOT_FOUND, "Not found.\n".into())),
    };
    let query =
        Query::parse(request.uri().query(), accepted_query).map_err(|message| bad(&message))?;
    let body = to_bytes(request.into_body(), 8192).await.map_err(|_| {
        Error(
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
    match path.as_str() {
        "/ban" | "/mute" => return user_action(&control, &path, &body).await,
        "/gracefulRestart" => {
            if !control.accepting.load(Ordering::Acquire) {
                return Err(Error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "The server is not ready for lifecycle operations.\n".into(),
                ));
            }
            if control.draining.load(Ordering::Acquire) {
                return Err(bad("The server is already draining."));
            }
            control
                .request_stop(crate::lifecycle::StopReason::Restart(downtime_message(
                    &query,
                )?))
                .await?;
        }
        "/gracefulStop" => control.graceful_stop(downtime_message(&query)?).await?,
        "/metrics" => return metrics_report(&control).await,
        "/version" => return Ok(format!("{}\n", control.version).into_response()),
        _ => unreachable!("Every command is listed above"),
    }
    Ok("success\n".into_response())
}
async fn user_action(control: &Control, path: &str, body: &Query) -> Result<Response> {
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
    let result = if path == "/ban" {
        sqlx::query!(
            "INSERT INTO banned_ips(ip,user_id) VALUES($1,$2) ON CONFLICT(ip) DO NOTHING",
            &ip,
            id
        )
        .execute(&control.pool)
        .await
    } else {
        sqlx::query!(
            "INSERT INTO muted_ips(ip,user_id) VALUES($1,$2) ON CONFLICT(ip) DO NOTHING",
            &ip,
            id
        )
        .execute(&control.pool)
        .await
    };
    let inserted = result.map_err(anyhow::Error::from)?.rows_affected() > 0;
    if !inserted {
        return Ok(format!(
            "User \"{username}\" has an IP of \"{ip}\", but it is already {}.\n",
            if path == "/ban" { "banned" } else { "muted" }
        )
        .into_response());
    }
    control
        .operation(if path == "/ban" {
            Operation::Ban {
                user_id: id,
                ip: ip.clone(),
            }
        } else {
            Operation::Mute { user_id: id }
        })
        .await?;
    Ok("success\n".into_response())
}
async fn metrics_report(control: &Control) -> Result<Response> {
    let inspect = control.operation(Operation::Inspect).await?;
    let mut recovery = metrics::recovery();
    recovery["storageInitialized"] = json!(true);
    recovery["authority"] = json!("Redis AOF/WAITAOF");
    recovery["stateHealthy"] = json!(control.storage_healthy());
    recovery["frozenTables"] = json!(
        inspect["tables"]
            .as_array()
            .context("Missing inspected tables")?
            .iter()
            .filter(|v| v["frozen"] == true)
            .count()
    );
    let mut report = json!({"uptimeSeconds":control.monotonic_started.elapsed().as_secs_f64(),
        "draining":control.draining.load(Ordering::Acquire),
        "discord":control.integration_status()["discord"],
        "runtime":metrics::memory().await?,"commands":metrics::COMMAND_METRICS.snapshot(),"recovery":recovery});
    let database: std::result::Result<Value, anyhow::Error> = if let Some(store) = control.store() {
        store.database_reports().await
    } else {
        match sqlx::query_scalar!("SELECT 1 AS \"value!\"")
            .fetch_one(&control.pool)
            .await
        {
            Ok(_) => Ok(json!({"primary":{
                "maxConnections":control.pool.options().get_max_connections(),
                "totalConnections":control.pool.size(),
                "idleConnections":control.pool.num_idle()
            },"recovery":null})),
            Err(error) => Err(error.into()),
        }
    };
    match database {
        Ok(database) => {
            report["database"] = database["primary"].clone();
            report["recovery"]["database"] = database["recovery"].clone();
            Ok((
                if control.storage_healthy() {
                    StatusCode::OK
                } else {
                    StatusCode::SERVICE_UNAVAILABLE
                },
                Json(report),
            )
                .into_response())
        }
        Err(error) => {
            eprintln!("Database metrics unavailable: {error}");
            report["database"] = json!({"error":"Database pool activity is unavailable."});
            Ok((StatusCode::SERVICE_UNAVAILABLE, Json(report)).into_response())
        }
    }
}
