use axum::{
    Json,
    extract::{MatchedPath, Request},
    http::{HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use serde_json::json;
use std::{fmt, io};

tokio::task_local! {
    static HTTP_OPERATION: String;
}

pub async fn http_context(request: Request, next: Next) -> Response {
    let path = request
        .extensions()
        .get::<MatchedPath>()
        .map_or("HTTP request", MatchedPath::as_str);
    let operation = format!("{} {path}", request.method());
    HTTP_OPERATION.scope(operation, next.run(request)).await
}

pub fn http_operation(fallback: &str) -> String {
    HTTP_OPERATION
        .try_with(Clone::clone)
        .unwrap_or_else(|_| fallback.to_owned())
}

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

    pub fn from_error(
        operation: impl Into<String>,
        error: &anyhow::Error,
        database_timeout: Option<std::time::Duration>,
    ) -> Self {
        let limit = database_timeout.map_or(String::new(), |timeout| {
            format!(" after {} seconds", timeout.as_secs())
        });
        let (code, description, status) = if let Some(fault) = error.downcast_ref::<Fault>() {
            (fault.code, fault.description.clone(), fault.status)
        } else if let Some(database) = error.downcast_ref::<sqlx::Error>() {
            match database {
                sqlx::Error::PoolTimedOut => ("database_pool_timeout", format!("Waiting for an available database connection timed out{limit}. Please try again."), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::PoolClosed => ("database_unavailable", "The database connection pool is closed. Please try again after the server recovers.".into(), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::Database(database) => {
                    match database.code().as_deref() {
                        Some("57014") if database.message().contains("statement timeout") =>
                            ("database_query_timeout", format!("The database query timed out{limit}. Please try again."), StatusCode::GATEWAY_TIMEOUT),
                        Some("57014") => ("database_query_cancelled", "The database query was cancelled before it finished.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        Some("55P03") => ("database_lock_timeout", "The database could not acquire the required lock in time.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        Some("23505") => ("database_duplicate", "An existing record already uses a value that must be unique.".into(), StatusCode::CONFLICT),
                        Some("23503") => ("database_reference_conflict", "A related database record is missing or is still in use.".into(), StatusCode::CONFLICT),
                        Some("23514") => ("database_constraint_failed", "The requested change violates a database validation rule.".into(), StatusCode::CONFLICT),
                        Some("40001" | "40P01") => ("database_transaction_conflict", "The database transaction was rolled back because another operation conflicted with it. Please try again.".into(), StatusCode::CONFLICT),
                        Some("53300" | "57P01" | "57P02" | "57P03") => ("database_unavailable", "The database is restarting or cannot accept connections.".into(), StatusCode::SERVICE_UNAVAILABLE),
                        _ => {
                            let state = database.code().filter(|code| code.len() == 5 && code.bytes().all(|c| c.is_ascii_alphanumeric()));
                            ("database_error", format!("The database rejected the operation (SQLSTATE {}).", state.as_deref().unwrap_or("unavailable")), StatusCode::INTERNAL_SERVER_ERROR)
                        }
                    }
                }
                sqlx::Error::Io(_) | sqlx::Error::Tls(_) => ("database_connection_failed", "The server could not communicate with the database. The result of a write may be unconfirmed; do not repeat game actions.".into(), StatusCode::SERVICE_UNAVAILABLE),
                sqlx::Error::RowNotFound => ("record_not_found", "The requested database record no longer exists.".into(), StatusCode::NOT_FOUND),
                _ => ("database_result_invalid", "The database response could not be decoded or did not match the expected schema.".into(), StatusCode::INTERNAL_SERVER_ERROR),
            }
        } else if error.downcast_ref::<redis::RedisError>().is_some() {
            ("live_state_unavailable", "The live-state store could not complete the operation. A write may have been saved without confirmation; do not repeat game actions. Reconnect after recovery.".into(), StatusCode::SERVICE_UNAVAILABLE)
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
                "password_rate_limited",
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
            ("internal_operation_failed", "An unexpected server failure prevented completion. Report the diagnostic ID to an administrator.".into(), StatusCode::INTERNAL_SERVER_ERROR)
        };
        Self::known(operation, code, description, status)
    }

    pub fn text(&self) -> String {
        format!(
            "{} failed: {} [Reference: {}]",
            self.operation, self.description, self.diagnostic_id
        )
    }

    pub fn log(&self) {
        // Refusals are logged where the limit is checked, because they are not failures.
        if self.code == "password_rate_limited" {
            return;
        }
        eprintln!(
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
            &sqlx::Error::PoolTimedOut.into(),
            Some(crate::store::LOBBY_READ_TIMEOUT),
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
            None,
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
            Some(crate::store::LOBBY_READ_TIMEOUT),
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
        let error = anyhow::anyhow!("private Redis payload").context(fault);
        let report = Report::from_error("Playing a card", &error, None);
        assert_eq!(report.code, "persistence_uncertain");
        assert!(report.text().contains("may have been saved"));
        assert!(!report.text().contains("private Redis"));
    }

    #[tokio::test]
    async fn postgres_timeouts_and_rejected_values_remain_specific_without_secrets() {
        let Some(db) = crate::accounts::test_support::TestDb::create().await else {
            return;
        };
        let mut connection = db.pool.acquire().await.unwrap();
        #[allow(clippy::disallowed_methods)]
        sqlx::query("SET statement_timeout = 2000")
            .execute(&mut *connection)
            .await
            .unwrap();
        #[allow(clippy::disallowed_methods)]
        let error = sqlx::query("SELECT pg_sleep(3)")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error(
            "Loading game history",
            &error.into(),
            Some(crate::store::LOBBY_READ_TIMEOUT),
        );
        assert_eq!(report.code, "database_query_timeout");
        assert_eq!(report.status, StatusCode::GATEWAY_TIMEOUT);
        assert!(report.text().contains("timed out after 2 seconds"));
        #[allow(clippy::disallowed_methods)]
        let error = sqlx::query("SELECT 'synthetic-password-token'::integer")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error(
            "Loading data",
            &error.into(),
            Some(crate::store::LOBBY_READ_TIMEOUT),
        );
        assert!(report.text().contains("SQLSTATE 22P02"));
        assert!(!report.text().contains("synthetic-password-token"));
        #[allow(clippy::disallowed_methods)]
        let error = sqlx::query("SELECT pg_cancel_backend(pg_backend_pid())")
            .execute(&mut *connection)
            .await
            .unwrap_err();
        let report = Report::from_error(
            "Loading data",
            &error.into(),
            Some(crate::store::LOBBY_READ_TIMEOUT),
        );
        assert_eq!(report.code, "database_query_cancelled");
        assert!(!report.text().contains("timed out"));
        drop(connection);
        db.close().await;
    }
}
