use anyhow::{Result, ensure};
use chrono::Utc;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub struct Telemetry {
    queue: Option<mpsc::Sender<Diagnostic>>,
}

struct Diagnostic {
    operation: String,
    code: &'static str,
    id: String,
}

fn endpoint(dsn: &str) -> Result<(url::Url, String)> {
    let mut url = url::Url::parse(dsn).map_err(|_| anyhow::anyhow!("Invalid SENTRY_DSN."))?;
    let key = url.username().to_owned();
    ensure!(
        matches!(url.scheme(), "http" | "https")
            && !key.is_empty()
            && key.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_')
            && url
                .password()
                .is_none_or(|p| p.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'_'))
            && url.query().is_none()
            && url.fragment().is_none(),
        "Invalid SENTRY_DSN."
    );
    let path = url.path().to_owned();
    let (prefix, project) = path
        .rsplit_once('/')
        .ok_or_else(|| anyhow::anyhow!("Invalid SENTRY_DSN."))?;
    ensure!(
        !project.is_empty() && project.bytes().all(|b| b.is_ascii_digit()),
        "Invalid SENTRY_DSN."
    );
    url.set_path(&format!("{prefix}/api/{project}/store/"));
    url.set_username("")
        .map_err(|_| anyhow::anyhow!("Invalid SENTRY_DSN."))?;
    url.set_password(None)
        .map_err(|_| anyhow::anyhow!("Invalid SENTRY_DSN."))?;
    Ok((url, key))
}

fn event(release: &str, diagnostic: &Diagnostic) -> Value {
    json!({
        "event_id":format!("{:032x}",rand::random::<u128>()),
        "timestamp":Utc::now().timestamp(),
        "platform":"native","level":"error","release":release,
        "exception":{"values":[{"type":"Error","value":diagnostic.code}]},
        "tags":{"operation":diagnostic.operation,"error_code":diagnostic.code,"diagnostic_id":diagnostic.id}
    })
}

impl Telemetry {
    pub fn start(
        dsn: &str,
        development: bool,
        release: String,
        tracker: &TaskTracker,
        shutdown: CancellationToken,
    ) -> Result<Arc<Self>> {
        if development || dsn.is_empty() {
            return Ok(Arc::new(Self { queue: None }));
        }
        let (endpoint, key) = endpoint(dsn)?;
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(2))
            .build()?;
        let (queue, mut events) = mpsc::channel::<Diagnostic>(30);
        tracker.spawn(async move {
            let sending=async {
              while let Some(diagnostic)=events.recv().await {
                // Only server-defined operation/category and a random correlation ID leave the process.
                let result = client
                    .post(endpoint.clone())
                    .header(
                        "X-Sentry-Auth",
                        format!(
                            "Sentry sentry_version=7,sentry_key={key},sentry_client=hanabi-live/1"
                        ),
                    )
                    .json(&event(&release, &diagnostic))
                    .send()
                    .await;
                match result {
                    Ok(response) if response.status().is_success() => {}
                    Ok(response) => eprintln!("Telemetry delivery failed: HTTP {}.", response.status().as_u16()),
                    Err(error) => crate::errors::Report::from_error("Telemetry delivery", &error.into(), None).log(),
                }
              }
            };
            tokio::pin!(sending);
            tokio::select! {
                _=&mut sending=>{},
                _=shutdown.cancelled()=>{let _=tokio::time::timeout(Duration::from_secs(2),&mut sending).await;},
            }
        });
        Ok(Arc::new(Self { queue: Some(queue) }))
    }

    pub fn report(&self, report: &crate::errors::Report) {
        if let Some(queue) = &self.queue
            && queue
                .try_send(Diagnostic {
                    operation: report.operation.clone(),
                    code: report.code,
                    id: report.diagnostic_id.clone(),
                })
                .is_err()
        {
            eprintln!(
                "Telemetry queue unavailable; diagnostic {} remains in local logs.",
                report.diagnostic_id
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn telemetry_has_no_sensitive_input_surface() {
        let report = crate::errors::Report::from_error(
            "Loading game history",
            &anyhow::anyhow!("password-token-SQL-private-chat"),
            None,
        );
        let data = event(
            "test-version",
            &Diagnostic {
                operation: report.operation.clone(),
                code: report.code,
                id: report.diagnostic_id.clone(),
            },
        );
        assert_eq!(data.as_object().unwrap().len(), 7);
        assert_eq!(data["tags"]["operation"], "Loading game history");
        assert_eq!(data["tags"]["diagnostic_id"], report.diagnostic_id);
        assert!(!data.to_string().contains("password-token-SQL-private-chat"));
        assert!(data.get("request").is_none());
        assert!(data.get("user").is_none());
        assert!(data.get("breadcrumbs").is_none());
        assert!(data.get("server_name").is_none());
        let (url, key) = endpoint("https://synthetic@sentry.invalid/1").unwrap();
        assert_eq!(url.as_str(), "https://sentry.invalid/api/1/store/");
        assert_eq!(key, "synthetic");
        for invalid in [
            "file:///1",
            "https://secret@sentry.invalid/project",
            "https://x@sentry.invalid/1?credential=secret",
        ] {
            assert!(endpoint(invalid).is_err());
        }
    }
}
