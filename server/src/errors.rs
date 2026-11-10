use axum::{
    Json,
    extract::{MatchedPath, Request},
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{fmt, io};

/// The PostgreSQL SQLSTATE codes that public errors distinguish.
mod sqlstate {
    /// The length of every SQLSTATE code.
    pub const LENGTH: usize = 5;
    pub const UNIQUE_VIOLATION: &str = "23505";
    pub const FOREIGN_KEY_VIOLATION: &str = "23503";
    pub const CHECK_VIOLATION: &str = "23514";
    pub const SERIALIZATION_FAILURE: &str = "40001";
    pub const DEADLOCK_DETECTED: &str = "40P01";
    pub const TOO_MANY_CONNECTIONS: &str = "53300";
    pub const LOCK_NOT_AVAILABLE: &str = "55P03";
    pub const QUERY_CANCELED: &str = "57014";
    pub const ADMIN_SHUTDOWN: &str = "57P01";
    pub const CRASH_SHUTDOWN: &str = "57P02";
    pub const CANNOT_CONNECT_NOW: &str = "57P03";
}

tokio::task_local! {
    static HTTP_OPERATION: String;
    /// Set while a request reads only from the lobby read pool.
    static LOBBY_READS: ();
}

/// The code of a password check that waits for earlier ones from the same address.
pub const PASSWORD_RATE_LIMITED: &str = "password_rate_limited";
/// The code of a command or request that arrives while the server starts or drains.
pub const SERVER_DRAINING: &str = "server_draining";
/// The code that tells a connection that the same account connected somewhere else.
pub const SESSION_REPLACED: &str = "session_replaced";
/// Codes that report the server working as intended, such as refusing work during a restart, so
/// they are neither logged as failures nor posted as alerts.
const REFUSALS: [&str; 3] = [PASSWORD_RATE_LIMITED, SERVER_DRAINING, SESSION_REPLACED];

pub async fn http_context(request: Request, next: Next) -> Response {
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("HTTP request", MatchedPath::as_str);
    let operation = format!("{} {path}", request.method());
    HTTP_OPERATION.scope(operation, next.run(request)).await
}

/// Marks the requests of a router that reads only from the lobby read pool, so their database
/// errors state that pool's timeout.
pub async fn lobby_reads(request: Request, next: Next) -> Response {
    LOBBY_READS.scope((), next.run(request)).await
}

pub fn http_operation(fallback: &str) -> String {
    HTTP_OPERATION
        .try_with(Clone::clone)
        .unwrap_or_else(|_| fallback.to_owned())
}

/// The error of an HTTP request: a refusal of a request that the server does not serve, or a
/// failure, which is reported.
#[derive(Debug)]
pub enum HttpError {
    /// The response's status and the message for the client.
    Refused(StatusCode, String),
    Failed(Box<Report>),
}

impl HttpError {
    pub fn refused(status: StatusCode, message: impl Into<String>) -> Self {
        Self::Refused(status, message.into())
    }
    pub fn bad(message: impl Into<String>) -> Self {
        Self::Refused(StatusCode::BAD_REQUEST, message.into())
    }
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::Refused(StatusCode::NOT_FOUND, message.into())
    }
    /// The response for a client that reads JSON: every route other than an HTML page or the
    /// operations endpoint.
    pub fn json(self) -> Response {
        match self {
            Self::Refused(status, message) => {
                (status, Json(hanabi_protocol::ApiError::new(message))).into_response()
            }
            Self::Failed(report) => report.response(true),
        }
    }
}

/// A failure of a request, reported as the request's operation.
impl<E: Into<anyhow::Error>> From<E> for HttpError {
    fn from(error: E) -> Self {
        Self::Failed(Box::new(Report::from_error(
            http_operation("HTTP request"),
            &error.into(),
        )))
    }
}

/// The response as plain text.
impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        match self {
            Self::Refused(status, message) => (status, message).into_response(),
            Self::Failed(report) => report.response(false),
        }
    }
}

/// Marks an error from the lobby read pool, whose waits and statements time out sooner than the
/// other pools'. Attach it with `context` where a lobby read fails.
#[derive(Debug)]
pub struct LobbyRead;

impl fmt::Display for LobbyRead {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Reading lobby data")
    }
}

/// Why a player's command did not complete. Handlers decide which kind of failure they report, so
/// the connection knows what to tell the player without inspecting the error.
#[derive(Debug)]
pub enum CommandError {
    /// The server refused the request as intended, such as a move that the rules do not allow.
    /// The player sees the message as it is, unless it is silent. It is not logged.
    Rejected { message: String, silent: bool },
    /// The server cannot serve the command now, such as while it drains or after it lost
    /// ownership of the live tables. The player sees the fault's description.
    Unavailable(Fault),
    /// Anything else: a failure of storage or another service, or a bug. It is logged, and the
    /// player sees a diagnostic reference.
    Internal(anyhow::Error),
}

pub type CommandResult<T = ()> = Result<T, CommandError>;

impl CommandError {
    pub fn rejected(message: impl Into<String>) -> Self {
        Self::Rejected {
            message: message.into(),
            silent: false,
        }
    }
}

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rejected { message, .. } => f.write_str(message),
            Self::Unavailable(fault) => fault.fmt(f),
            Self::Internal(error) => write!(f, "{error:#}"),
        }
    }
}

impl std::error::Error for CommandError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Rejected { .. } => None,
            Self::Unavailable(fault) => Some(fault),
            Self::Internal(error) => Some(error.as_ref()),
        }
    }
}

/// Converts the errors of code outside the command handlers, such as the store and the engine.
/// Those report a refusal or a fault as the error itself, so only the outermost error is checked.
impl From<anyhow::Error> for CommandError {
    fn from(error: anyhow::Error) -> Self {
        let error = match error.downcast::<Self>() {
            Ok(error) => return error,
            Err(error) => error,
        };
        let error = match error.downcast::<hanabi_engine::ActionRejected>() {
            Ok(rejected) => {
                return Self::Rejected {
                    message: rejected.message,
                    silent: rejected.silent,
                };
            }
            Err(error) => error,
        };
        match error.downcast::<Fault>() {
            Ok(fault) => Self::Unavailable(fault),
            Err(error) => Self::Internal(error),
        }
    }
}

impl From<Fault> for CommandError {
    fn from(fault: Fault) -> Self {
        Self::Unavailable(fault)
    }
}

/// Errors that command handlers pass on with `?`, which are always unexpected.
macro_rules! internal_errors {
    ($($error:ty),+ $(,)?) => {
        $(impl From<$error> for CommandError {
            fn from(error: $error) -> Self {
                Self::Internal(error.into())
            }
        })+
    };
}
internal_errors!(
    sqlx::Error,
    serde_json::Error,
    std::num::TryFromIntError,
    std::num::ParseIntError,
    tokio::sync::oneshot::error::RecvError,
    tokio::sync::TryAcquireError,
);
impl<T: Send + Sync + 'static> From<tokio::sync::mpsc::error::SendError<T>> for CommandError {
    fn from(error: tokio::sync::mpsc::error::SendError<T>) -> Self {
        Self::Internal(anyhow::anyhow!("{error}"))
    }
}

/// Turns a missing value or a failed parse of a player's input into a rejection.
pub trait OrReject<T> {
    fn or_reject(self, message: impl Into<String>) -> CommandResult<T>;
}
impl<T> OrReject<T> for Option<T> {
    fn or_reject(self, message: impl Into<String>) -> CommandResult<T> {
        self.ok_or_else(|| CommandError::rejected(message))
    }
}
impl<T, E> OrReject<T> for Result<T, E> {
    fn or_reject(self, message: impl Into<String>) -> CommandResult<T> {
        self.map_err(|_| CommandError::rejected(message))
    }
}

/// The description of an unexpected failure, which the server wrote for the player to see, such as
/// one from `internal!`. A failure that the report does not recognize shows its whole error chain to
/// the player only when the chain starts from one of these.
#[derive(Debug)]
pub struct Described(pub String);

impl fmt::Display for Described {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}
impl std::error::Error for Described {}

/// The code of a failure that the report does not recognize.
pub const INTERNAL_OPERATION_FAILED: &str = "internal_operation_failed";

/// The code of a command that failed for a reason the server did not anticipate. Its report keeps
/// the server's own description, so the player can pass it on with the reference.
pub const COMMAND_FAILED: &str = "command_failed";

/// Only construct this with server-defined descriptions, never request values or raw errors.
#[derive(Debug)]
pub struct Fault {
    pub code: &'static str,
    pub description: String,
    pub status: StatusCode,
}

impl Fault {
    pub fn new(code: &'static str, description: impl Into<String>, status: StatusCode) -> Self {
        Self {
            code,
            description: description.into(),
            status,
        }
    }
}

impl fmt::Display for Fault {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.description)
    }
}
impl std::error::Error for Fault {}

#[derive(Clone, Debug)]
pub struct Report {
    pub operation: String,
    pub code: &'static str,
    pub description: String,
    pub diagnostic_id: String,
    pub status: StatusCode,
}

impl Report {
    pub fn known(
        operation: impl Into<String>,
        code: &'static str,
        description: impl Into<String>,
        status: StatusCode,
    ) -> Self {
        Self {
            operation: operation.into(),
            code,
            description: description.into(),
            diagnostic_id: format!("{:016x}", rand::random::<u64>()),
            status,
        }
    }

    pub fn from_error(operation: impl Into<String>, error: &anyhow::Error) -> Self {
        let timeout = if error.downcast_ref::<LobbyRead>().is_some()
            || LOBBY_READS.try_with(|()| ()).is_ok()
        {
            crate::store::LOBBY_READ_TIMEOUT
        } else {
            crate::store::DATABASE_TIMEOUT
        };
        let limit = format!(" after {} seconds", timeout.as_secs());
        let (code, description, status) = if let Some(fault) = error.downcast_ref::<Fault>() {
            (fault.code, fault.description.clone(), fault.status)
        } else if let Some(database) = error.downcast_ref::<sqlx::Error>() {
            match database {
                sqlx::Error::PoolTimedOut => ("database_pool_timeout", format!("Waiting for an available database connection timed out{limit}. Please try again."), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::PoolClosed => ("database_unavailable", "The database connection pool is closed. Please try again after the server recovers.".into(), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::Database(database) => {
                    match database.code().as_deref() {
                        Some(sqlstate::QUERY_CANCELED) if database.message().contains("statement timeout") =>
                            ("database_query_timeout", format!("The database query timed out{limit}. Please try again."), StatusCode::GATEWAY_TIMEOUT),
                        Some(sqlstate::QUERY_CANCELED) => ("database_query_cancelled", "The database query was cancelled before it finished.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        Some(sqlstate::LOCK_NOT_AVAILABLE) => ("database_lock_timeout", "The database could not acquire the required lock in time.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        Some(sqlstate::UNIQUE_VIOLATION) => ("database_duplicate", "An existing record already uses a value that must be unique.".into(), StatusCode::CONFLICT),
                        Some(sqlstate::FOREIGN_KEY_VIOLATION) => ("database_reference_conflict", "A related database record is missing or is still in use.".into(), StatusCode::CONFLICT),
                        Some(sqlstate::CHECK_VIOLATION) => ("database_constraint_failed", "The requested change violates a database validation rule.".into(), StatusCode::CONFLICT),
                        Some(sqlstate::SERIALIZATION_FAILURE | sqlstate::DEADLOCK_DETECTED) => ("database_transaction_conflict", "The database transaction was rolled back because another operation conflicted with it. Please try again.".into(), StatusCode::CONFLICT),
                        Some(sqlstate::TOO_MANY_CONNECTIONS | sqlstate::ADMIN_SHUTDOWN | sqlstate::CRASH_SHUTDOWN | sqlstate::CANNOT_CONNECT_NOW) => ("database_unavailable", "The database is restarting or cannot accept connections.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        _ => {
                            let state = database.code().filter(|code| code.len() == sqlstate::LENGTH && code.bytes().all(|c| c.is_ascii_alphanumeric()));
                            ("database_error", format!("The database rejected the operation (SQLSTATE {}).", state.as_deref().unwrap_or("unavailable")), StatusCode::INTERNAL_SERVER_ERROR)
                        }
                    }
                }
                sqlx::Error::Io(_) | sqlx::Error::Tls(_) => ("database_connection_failed", "The server could not communicate with the database. The result of a write may be unconfirmed; do not repeat game actions.".into(), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::RowNotFound => ("record_not_found", "The requested database record no longer exists.".into(), StatusCode::NOT_FOUND),
                _ => ("database_result_invalid", "The database response could not be decoded or did not match the expected schema.".into(), StatusCode::INTERNAL_SERVER_ERROR),
            }
        } else if let Some(http) = error.downcast_ref::<reqwest::Error>() {
            if http.is_timeout() {
                (
                    "upstream_timeout",
                    "The external service did not respond before the request deadline.".into(),
                    StatusCode::GATEWAY_TIMEOUT,
                )
            } else if http.is_connect() {
                (
                    "upstream_connection_failed",
                    "The server could not connect to the external service.".into(),
                    StatusCode::BAD_GATEWAY,
                )
            } else if let Some(status) = http.status() {
                (
                    "upstream_http_error",
                    format!(
                        "The external service returned HTTP status: {}",
                        status.as_u16()
                    ),
                    StatusCode::BAD_GATEWAY,
                )
            } else {
                (
                    "upstream_response_invalid",
                    "The external service response could not be read or decoded.".into(),
                    StatusCode::BAD_GATEWAY,
                )
            }
        } else if let Some(socket) = error.downcast_ref::<tokio_tungstenite::tungstenite::Error>() {
            use tokio_tungstenite::tungstenite::Error as SocketError;
            let description = match socket {
                SocketError::Http(response) => format!(
                    "The WebSocket handshake was rejected with HTTP {}.",
                    response.status().as_u16()
                ),
                SocketError::Io(error) => {
                    format!("The WebSocket transport failed ({:?}).", error.kind())
                }
                SocketError::Tls(_) => "The WebSocket TLS handshake failed.".into(),
                SocketError::ConnectionClosed | SocketError::AlreadyClosed => {
                    "The remote WebSocket connection closed.".into()
                }
                _ => {
                    "The remote WebSocket sent an invalid or unsupported protocol response.".into()
                }
            };
            (
                "websocket_transport_failed",
                description,
                StatusCode::BAD_GATEWAY,
            )
        } else if let Some(limited) = error.downcast_ref::<crate::accounts::TooMuchPasswordWork>() {
            (
                PASSWORD_RATE_LIMITED,
                limited.to_string(),
                StatusCode::TOO_MANY_REQUESTS,
            )
        } else if let Some(overload) = error.downcast_ref::<crate::accounts::HashOverload>() {
            (
                "password_processing_busy",
                format!(
                    "Password processing is temporarily busy: {}. Please try again.",
                    overload.diagnostic()
                ),
                StatusCode::SERVICE_UNAVAILABLE,
            )
        } else if let Some(failure) = error.downcast_ref::<crate::accounts::HashFailure>() {
            (
                "password_processing_failed",
                format!(
                    "Password verification or storage failed: {}",
                    failure.diagnostic()
                ),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        } else if error
            .downcast_ref::<tokio::time::error::Elapsed>()
            .is_some()
        {
            (
                "operation_timeout",
                "The operation exceeded its processing deadline.".into(),
                StatusCode::GATEWAY_TIMEOUT,
            )
        } else if let Some(error) = error.downcast_ref::<io::Error>() {
            let description = match error.kind() {
                io::ErrorKind::NotFound => "A required server file or resource is missing.",
                io::ErrorKind::PermissionDenied => {
                    "The server does not have permission to access a required resource."
                }
                io::ErrorKind::TimedOut => "A server input/output operation timed out.",
                io::ErrorKind::ConnectionRefused => {
                    "A required service refused the server's connection."
                }
                io::ErrorKind::ConnectionReset
                | io::ErrorKind::BrokenPipe
                | io::ErrorKind::UnexpectedEof => {
                    "A required service closed the connection before the operation finished."
                }
                _ => "A server input/output operation failed.",
            };
            (
                "server_io_error",
                description.into(),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        } else if error.downcast_ref::<serde_json::Error>().is_some() {
            (
                "server_data_invalid",
                "Stored data or a service response contains invalid JSON.".into(),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        } else if error.downcast_ref::<tokio::task::JoinError>().is_some() {
            (
                "worker_failed",
                "A server worker stopped before completing the operation.".into(),
                StatusCode::INTERNAL_SERVER_ERROR,
            )
        } else {
            (INTERNAL_OPERATION_FAILED, "An unexpected server failure prevented completion. Report the diagnostic ID to an administrator.".into(), StatusCode::INTERNAL_SERVER_ERROR)
        };
        Self::known(operation, code, description, status)
    }

    pub fn text(&self) -> String {
        format!(
            "{} failed: {} [Reference: {}]",
            self.operation, self.description, self.diagnostic_id
        )
    }

    /// Whether this reports a failure, rather than a refusal of the server working as intended.
    pub fn is_failure(&self) -> bool {
        !REFUSALS.contains(&self.code)
    }

    pub fn log(&self) {
        if !self.is_failure() {
            return;
        }
        tracing::error!(
            "Server failure: {}",
            json!({
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "revision": crate::restart::version(),
                "operation": self.operation,
                "code": self.code,
                "description": self.description,
                "diagnosticID": self.diagnostic_id
            })
        );
    }

    pub fn response(&self, json_response: bool) -> Response {
        self.log();
        let mut response = if json_response {
            (
                self.status,
                Json(hanabi_protocol::ApiError {
                    error: self.text(),
                    code: Some(self.code.into()),
                    diagnostic_id: Some(self.diagnostic_id.clone()),
                }),
            )
                .into_response()
        } else {
            (self.status, self.text()).into_response()
        };
        response.headers_mut().insert(
            "x-error-id",
            HeaderValue::from_str(&self.diagnostic_id).expect("Hexadecimal diagnostic ID"),
        );
        // The web router posts server errors to the error alerts from here.
        response.extensions_mut().insert(self.clone());
        response
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_pool_and_unknown_errors_are_specific_and_redacted() {
        let report = Report::from_error(
            "Loading game history",
            &anyhow::Error::from(sqlx::Error::PoolTimedOut).context(LobbyRead),
        );
        assert_eq!(report.code, "database_pool_timeout");
        assert!(
            report
                .text()
                .contains("database connection timed out after 2 seconds")
        );
        let report = Report::from_error(
            "Saving settings",
            &anyhow::anyhow!("password=synthetic-secret SELECT private-data"),
        );
        assert!(!report.text().contains("synthetic-secret"));
        assert!(!report.text().contains("SELECT"));
        assert!(report.text().contains(&report.diagnostic_id));
    }

    #[test]
    fn error_responses_carry_their_report_for_alerts() {
        let report = Report::from_error(
            "GET /api/v1/variants/{id}",
            &sqlx::Error::PoolTimedOut.into(),
        );
        let response = report.response(true);
        assert!(response.status().is_server_error());
        let attached = response
            .extensions()
            .get::<Report>()
            .expect("attached report");
        assert_eq!(attached.code, "database_pool_timeout");
        assert_eq!(attached.operation, "GET /api/v1/variants/{id}");
        assert_eq!(attached.diagnostic_id, report.diagnostic_id);
    }

    #[test]
    fn persistence_uncertainty_is_not_reported_as_safe_to_repeat() {
        let fault = Fault::new(
            "persistence_uncertain",
            "The write may have been saved; do not repeat game actions.",
            StatusCode::SERVICE_UNAVAILABLE,
        );
        let error = anyhow::anyhow!("private checkpoint payload").context(fault);
        let report = Report::from_error("Playing a card", &error);
        assert_eq!(report.code, "persistence_uncertain");
        assert!(report.text().contains("may have been saved"));
        assert!(!report.text().contains("private checkpoint"));
    }

    #[tokio::test]
    async fn postgres_timeouts_and_rejected_values_remain_specific_without_secrets() {
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return;
        };
        let mut connection = db.pool.acquire().await.unwrap();
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state or failures directly"
        )]
        sqlx::query("SET statement_timeout = 2000")
            .execute(&mut *connection)
            .await
            .unwrap();
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state or failures directly"
        )]
        let error = sqlx::query("SELECT pg_sleep(3)")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error(
            "Loading game history",
            &anyhow::Error::from(error).context(LobbyRead),
        );
        assert_eq!(report.code, "database_query_timeout");
        assert_eq!(report.status, StatusCode::GATEWAY_TIMEOUT);
        assert!(report.text().contains("timed out after 2 seconds"));
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state or failures directly"
        )]
        let error = sqlx::query("SELECT 'synthetic-password-token'::integer")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error("Loading data", &error.into());
        assert!(report.text().contains("SQLSTATE 22P02"));
        assert!(!report.text().contains("synthetic-password-token"));
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that sets up database state or failures directly"
        )]
        let error = sqlx::query("SELECT pg_cancel_backend(pg_backend_pid())")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error("Loading data", &error.into());
        assert_eq!(report.code, "database_query_cancelled");
        assert!(!report.text().contains("timed out"));
        drop(connection);
        db.close().await;
    }
}
