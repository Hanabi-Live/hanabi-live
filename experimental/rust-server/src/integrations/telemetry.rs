use anyhow::{Result, ensure};
use chrono::Utc;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

pub struct Telemetry {
    queue: Option<mpsc::Sender<()>>,
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

fn event(release: &str) -> Value {
    json!({
        "event_id":format!("{:032x}",rand::random::<u128>()),
        "timestamp":Utc::now().timestamp(),
        "platform":"native","level":"error","release":release,
        "exception":{"values":[{"type":"Error","value":"Server error; inspect local logs."}]}
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
        let (queue, mut events) = mpsc::channel::<()>(30);
        tracker.spawn(async move {
            let sending=async {
              while let Some(())=events.recv().await {
                // Deliberately never accept exception strings, URLs, request data,
                // SQL, credentials, usernames, cards or chat as telemetry input.
                let _ = client
                    .post(endpoint.clone())
                    .header(
                        "X-Sentry-Auth",
                        format!(
                            "Sentry sentry_version=7,sentry_key={key},sentry_client=hanabi-rust/1"
                        ),
                    )
                    .json(&event(&release))
                    .send()
                    .await;
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

    pub fn report(&self) {
        if let Some(queue) = &self.queue {
            let _ = queue.try_send(());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn telemetry_has_no_sensitive_input_surface() {
        let data = event("test-version");
        assert_eq!(data.as_object().unwrap().len(), 6);
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
