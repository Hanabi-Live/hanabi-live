use serde_json::Value;

#[derive(Clone, Debug)]
pub enum Operation {
    Broadcast {
        message: String,
    },
    Kick {
        user_id: i32,
    },
    Ban {
        user_id: i32,
    },
    Unban {
        user_id: i32,
    },
    Mute {
        user_id: i32,
    },
    Unmute {
        user_id: i32,
    },
    Warning {
        user_id: Option<i32>,
        message: String,
        error: bool,
    },
    Maintenance {
        enabled: bool,
    },
    Shutdown {
        scheduled: bool,
        started_at: Option<String>,
        imminent: bool,
    },
    Inspect,
    Drained {
        restart: bool,
    },
    LongTables,
    ClearEmptyTables,
    ClearPregames,
    TerminateGames,
    Terminate {
        identifier: String,
    },
}

pub type OperationReply = tokio::sync::oneshot::Sender<anyhow::Result<Value>>;

use crate::{
    lifecycle::{Control, duration},
    metrics,
};
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
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, atomic::Ordering},
};

pub fn router(control: Arc<Control>) -> Router {
    let mut router = Router::new();
    for path in [
        "/ban",
        "/mute",
        "/sendError",
        "/sendWarning",
        "/sendWarningAll",
    ] {
        router = router.route(path, post(handle));
    }
    for path in [
        "/cancel",
        "/clearEmptyTables",
        "/debugFunction",
        "/getLongTables",
        "/gracefulRestart",
        "/maintenance",
        "/memory",
        "/metrics",
        "/print",
        "/saveTables",
        "/shutdown",
        "/timeLeft",
        "/uptime",
        "/version",
        "/unmaintenance",
    ] {
        router = router.route(path, get(handle));
    }
    router
        .route("/terminate", get(handle).post(handle))
        .layer(middleware::from_fn_with_state(control.clone(), guard))
        .with_state(control)
}

fn mutating(path: &str) -> bool {
    matches!(
        path,
        "/ban"
            | "/mute"
            | "/sendError"
            | "/sendWarning"
            | "/sendWarningAll"
            | "/cancel"
            | "/clearEmptyTables"
            | "/debugFunction"
            | "/maintenance"
            | "/unmaintenance"
            | "/shutdown"
            | "/terminate"
    )
}
async fn guard(State(control): State<Arc<Control>>, request: Request, next: Next) -> Response {
    let peer = request.extensions().get::<ConnectInfo<SocketAddr>>();
    let browser = request.headers().contains_key(header::ORIGIN)
        || request
            .headers()
            .get("sec-fetch-site")
            .is_some_and(|s| s.as_bytes().eq_ignore_ascii_case(b"cross-site"));
    let response = if browser || !peer.is_some_and(|p| p.0.ip().is_loopback()) {
        (StatusCode::FORBIDDEN,Json(json!({"error":"Browser or non-loopback requests are not allowed on the localhost operations interface."}))).into_response()
    } else {
        let admission = if mutating(request.uri().path()) {
            Some(control.admission.clone().read_owned().await)
        } else {
            None
        };
        if admission.is_some()
            && (!control.accepting.load(Ordering::Acquire)
                || control.draining.load(Ordering::Acquire)
                || !control.storage_healthy())
        {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error":"The server is draining for maintenance."})),
            )
                .into_response()
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
        eprintln!("Localhost operation failed: {error:#}");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Internal server error.\n".into(),
        )
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
fn parameters(raw: &[u8]) -> HashMap<String, String> {
    let mut result = HashMap::new();
    for (key, value) in url::form_urlencoded::parse(raw) {
        result
            .entry(key.into_owned())
            .or_insert_with(|| value.into_owned());
    }
    result
}
async fn handle(State(control): State<Arc<Control>>, request: Request) -> Result<Response> {
    let path = request.uri().path().to_owned();
    let query = parameters(request.uri().query().unwrap_or("").as_bytes());
    let body = to_bytes(request.into_body(), 8192).await.map_err(|_| {
        Error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Request body too large.\n".into(),
        )
    })?;
    let body = parameters(&body);
    match path.as_str() {
        "/ban"|"/mute"|"/sendError"|"/sendWarning"=>return user_action(&control,&path,&body).await,
        "/sendWarningAll"=>{
            let message=body.get("msg").filter(|v|!v.is_empty()).ok_or_else(||bad("You must send a \"msg\" POST parameter."))?;
            let result=control.operation(Operation::Warning{user_id:None,message:message.clone(),error:false}).await?;
            let total=result["total"].as_u64().context("Hub did not report connected users")?;
            let sent=result["sent"].as_u64().context("Hub did not report warning deliveries")?;
            return Ok(if total==0{"No users found online\n".into()}else{format!("Message sent to {sent} out of {total} found online.")}.into_response());
        }
        "/terminate"=>{
            let id=body.get("tableID").filter(|v|!v.is_empty()).or_else(||query.get("tableID").filter(|v|!v.is_empty()))
                .ok_or_else(||bad("Error: You must specify a table name or a table ID."))?;
            let result=control.operation(Operation::Terminate{identifier:id.clone()}).await?;
            if result["found"]==false{return Ok(format!("Table \"{id}\" does not exist.\n").into_response())}
            if result["terminated"]!=true{return Err(bad("That table is not an ongoing game."))}
        }
        "/clearEmptyTables"=>{control.operation(Operation::ClearEmptyTables).await?;}
        "/debugFunction"=>eprintln!("Debug functions complete; no manual repair is enabled."),
        "/getLongTables"=>{
            let value=control.operation(Operation::LongTables).await?;
            let tables=value["tables"].as_array().context("Hub table inspection is unavailable")?;
            let mut lines=vec!["Long tables:".to_owned()];
            for table in tables {
                let created=table["created"].as_str().context("Table creation date is missing")?;
                let date=chrono::DateTime::parse_from_rfc3339(created).map_err(anyhow::Error::from)?;
                if chrono::Utc::now().signed_duration_since(date).num_minutes()>=150 {
                    lines.push(format!("{}) Table ID: {}, Name: {}",lines.len(),table["id"],table["name"].as_str().context("Table name is missing")?));
                }
            }
            return Ok(format!("{}\n",lines.join("\n")).into_response())
        }
        "/gracefulRestart"=>{
            if !control.accepting.load(Ordering::Acquire){return Err(Error(StatusCode::SERVICE_UNAVAILABLE,"The server is not ready for lifecycle operations.\n".into()))}
            if control.draining.load(Ordering::Acquire){return Err(bad("The server is already draining."))}
            control.request_stop(true).await?;
        }
        "/maintenance"|"/unmaintenance"=>{
            let enabled=path=="/maintenance";
            if !control.set_maintenance(enabled).await? {
                return Err(bad(if enabled{"The server is already in maintenance mode."}else{"The server is not in maintenance mode, so you cannot unmaintenance it."}));
            }
        }
        "/memory"=>{
            let memory=metrics::memory().await?;
            return Ok(format!("\nMemory Report:\n  RSS = {} MiB\n  Virtual = {} MiB\n",
                memory["residentBytes"].as_u64().context("Missing RSS")?/1024/1024,
                memory["virtualBytes"].as_u64().context("Missing process size")?/1024/1024).into_response())
        }
        "/metrics"=>return metrics_report(&control).await,
        "/print"=>{eprintln!("Current application state: {}",control.operation(Operation::Inspect).await?);}
        "/saveTables"=>return Ok((StatusCode::GONE,"Emergency table saves are retired; no save was performed. Accepted progress uses continuous Redis recovery. Use /gracefulRestart for planned maintenance or recovery of frozen tables.\n").into_response()),
        "/shutdown"=>{
            if control.metadata()["shuttingDown"]==true{return Err(bad("The server is already shutting down."))}
            control.schedule().await?;
        }
        "/cancel"=>{
            if control.metadata()["shuttingDown"]!=true{return Err(bad("The server is not awaiting shutdown, so you cannot cancel it."))}
            control.cancel_schedule().await?;
        }
        "/timeLeft"=>return Ok(format!("{}\n",control.time_left()).into_response()),
        "/uptime"=>return Ok(format!("The server came online at: {}\nUptime: {}\n",control.started.format("%a %b %d %H:%M:%S UTC %Y"),duration(control.monotonic_started.elapsed().as_secs())).into_response()),
        "/version"=>return Ok(format!("{}\n",control.version).into_response()),
        _=>return Err(Error(StatusCode::NOT_FOUND,"404 not found\n".into()))
    }
    Ok("success\n".into_response())
}
async fn user_action(
    control: &Control,
    path: &str,
    body: &HashMap<String, String>,
) -> Result<Response> {
    let name = body
        .get("username")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| bad("Error: You must specify a username."))?;
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
    if matches!(path, "/ban" | "/mute") {
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
                Operation::Ban { user_id: id }
            } else {
                Operation::Mute { user_id: id }
            })
            .await?;
    } else {
        let message = body
            .get("msg")
            .filter(|v| !v.is_empty())
            .ok_or_else(|| bad("You must send a \"msg\" POST parameter."))?;
        let result = control
            .operation(Operation::Warning {
                user_id: Some(id),
                message: message.clone(),
                error: path == "/sendError",
            })
            .await?;
        if result["missing"] == true {
            return Err(Error(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get the session for the user ID of \"{id}\"."),
            ));
        }
    }
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
        "draining":control.draining.load(Ordering::Acquire),"maintenanceMode":control.maintenance.load(Ordering::Acquire),
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
