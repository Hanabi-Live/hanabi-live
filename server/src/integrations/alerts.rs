//! Posts server failures to the Discord development channel. Only the server's operation and error
//! code, the diagnostic ID, and the release leave the process; the details stay in the local logs.
use super::discord::Bridge;
use crate::errors::Report;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// Repeats of the same failure are counted instead of posted until this much time has passed.
const REPEAT_INTERVAL: Duration = Duration::from_mins(10);

/// The most groups of repeats that are counted. A new group is dropped when this many were posted
/// within `REPEAT_INTERVAL`.
const MAX_GROUPS: usize = 200;

/// The alerts queued before new ones are dropped.
const QUEUE: usize = 30;

/// How long shutdown waits for the alert being sent.
const SHUTDOWN_SEND_GRACE: Duration = Duration::from_secs(2);

pub struct Alerts {
    queue: Option<mpsc::Sender<Alert>>,
    /// The client version, which alerts name as the release.
    release: String,
}

/// A failure to post.
struct Alert {
    /// The failures that count as repeats of each other share a group.
    group: String,
    /// What the alert says before the count of repeats.
    summary: String,
    diagnostic_id: String,
}

/// Holds one entry per group.
#[derive(Default)]
struct Throttle {
    recent: HashMap<String, (Instant, u32)>,
}

impl Throttle {
    /// Returns the message to post, or `None` for a recent repeat or a group over `MAX_GROUPS`.
    fn message(&mut self, alert: &Alert, now: Instant) -> Option<String> {
        if let Some((sent, repeats)) = self.recent.get_mut(&alert.group)
            && now.duration_since(*sent) < REPEAT_INTERVAL
        {
            *repeats += 1;
            return None;
        }
        if !self.recent.contains_key(&alert.group) && self.recent.len() >= MAX_GROUPS {
            // A group whose last alert is old enough is forgotten, with its count of repeats.
            self.recent
                .retain(|_, (sent, _)| now.duration_since(*sent) < REPEAT_INTERVAL);
            if self.recent.len() >= MAX_GROUPS {
                return None;
            }
        }
        let repeats = self
            .recent
            .insert(alert.group.clone(), (now, 0))
            .map_or(0, |(_, repeats)| repeats);
        let repeats = match repeats {
            0 => String::new(),
            1 => " It also happened 1 more time since the last alert.".to_owned(),
            n => format!(" It also happened {n} more times since the last alert."),
        };
        Some(format!(
            "{}{repeats} Details: `journalctl --unit=hanabi-live --grep={}`",
            alert.summary, alert.diagnostic_id
        ))
    }
}

impl Alerts {
    pub fn start(
        bridge: Option<Arc<Bridge>>,
        development: bool,
        release: String,
        tracker: &TaskTracker,
        shutdown: CancellationToken,
    ) -> Arc<Self> {
        let Some(bridge) = bridge.filter(|_| !development) else {
            return Arc::new(Self {
                queue: None,
                release,
            });
        };
        let (queue, mut alerts) = mpsc::channel::<Alert>(QUEUE);
        tracker.spawn(async move {
            let sending = async {
                let mut throttle = Throttle::default();
                while let Some(alert) = alerts.recv().await {
                    let Some(message) = throttle.message(&alert, Instant::now()) else {
                        continue;
                    };
                    if let Err(error) = bridge.alert(&message).await {
                        Report::from_error("Posting an error alert to Discord", &error).log();
                    }
                }
            };
            tokio::pin!(sending);
            tokio::select! {
                () = &mut sending => {},
                () = shutdown.cancelled() => {
                    let _ = tokio::time::timeout(SHUTDOWN_SEND_GRACE, &mut sending).await;
                },
            }
        });
        Arc::new(Self {
            queue: Some(queue),
            release,
        })
    }

    /// Posts a server failure. A refusal is the server working as intended, so it is not posted.
    pub fn report(&self, report: &Report) {
        if report.is_failure() {
            self.send(server_alert(report, &self.release));
        }
    }

    fn send(&self, alert: Alert) {
        if let Some(queue) = &self.queue
            && let Err(error) = queue.try_send(alert)
        {
            let alert = match error {
                mpsc::error::TrySendError::Full(alert)
                | mpsc::error::TrySendError::Closed(alert) => alert,
            };
            tracing::warn!(
                "Error alert queue unavailable; diagnostic {} remains in local logs.",
                alert.diagnostic_id
            );
        }
    }
}

fn server_alert(report: &Report, release: &str) -> Alert {
    Alert {
        group: format!("server {} {}", report.code, report.operation),
        summary: format!(
            "Server error `{}` in `{}` (release `{release}`, diagnostic ID `{}`).",
            report.code, report.operation, report.diagnostic_id
        ),
        diagnostic_id: report.diagnostic_id.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(operation: &str, error: &str) -> Report {
        Report::from_error(operation, &anyhow::anyhow!(error.to_owned()))
    }

    #[test]
    fn alerts_omit_error_details_and_count_repeats() {
        let mut throttle = Throttle::default();
        let start = Instant::now();
        let first = report("Loading game history", "password-token-SQL-private-chat");
        let message = throttle
            .message(&server_alert(&first, "v1"), start)
            .unwrap();
        assert!(message.contains("`internalOperationFailed` in `Loading game history`"));
        assert!(message.contains(&first.diagnostic_id));
        assert!(!message.contains("password-token-SQL-private-chat"));
        assert!(!message.contains(&first.description));

        // Repeats are counted until the interval passes; other operations are independent.
        for seconds in [1, 2] {
            let repeat = report("Loading game history", "again");
            let now = start + Duration::from_secs(seconds);
            assert!(
                throttle
                    .message(&server_alert(&repeat, "v1"), now)
                    .is_none()
            );
        }
        let other = report("Saving preferences", "other");
        assert!(
            throttle
                .message(&server_alert(&other, "v1"), start + Duration::from_secs(3))
                .is_some()
        );
        let later = report("Loading game history", "later");
        let message = throttle
            .message(&server_alert(&later, "v1"), start + REPEAT_INTERVAL)
            .unwrap();
        assert!(message.contains("2 more times since the last alert"));
        assert!(message.contains(&later.diagnostic_id));
    }

    #[test]
    fn refusals_are_not_posted() {
        let (queue, mut queued) = mpsc::channel(QUEUE);
        let alerts = Alerts {
            queue: Some(queue),
            release: "v1".into(),
        };
        for code in [
            hanabi_protocol::NoticeCode::PasswordRateLimited,
            hanabi_protocol::NoticeCode::ServerDraining,
            hanabi_protocol::NoticeCode::SessionReplaced,
        ] {
            let refusal = Report::known(
                "Command note",
                code,
                "The server refused this as intended.",
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
            );
            assert!(!refusal.is_failure(), "{code}");
            alerts.report(&refusal);
            assert!(queued.try_recv().is_err(), "{code}");
        }
    }

    #[test]
    fn new_groups_are_dropped_while_too_many_are_recent() {
        let mut throttle = Throttle::default();
        let start = Instant::now();
        let alert = |index: usize| server_alert(&report(&index.to_string(), "error"), "v1");
        for index in 0..MAX_GROUPS {
            assert!(throttle.message(&alert(index), start).is_some());
        }
        assert!(throttle.message(&alert(MAX_GROUPS), start).is_none());
        // Once the old groups are past the interval, they make room.
        assert!(
            throttle
                .message(&alert(MAX_GROUPS), start + REPEAT_INTERVAL)
                .is_some()
        );
    }
}
