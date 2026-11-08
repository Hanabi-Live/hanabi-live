//! Posts server failures to the Discord development channel. Only the operation, error code,
//! diagnostic ID and release leave the process; the details stay in the local logs.
use super::discord::Bridge;
use crate::errors::Report;
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// Routine failures that need no alert. Commands fail with this code while the server restarts.
const IGNORED_CODES: [&str; 1] = ["server_draining"];

/// Repeats of the same failure are counted instead of posted until this much time has passed.
const REPEAT_INTERVAL: Duration = Duration::from_mins(10);

pub struct Alerts {
    queue: Option<mpsc::Sender<Report>>,
}

/// Holds one entry per operation and error code, both of which are server-defined.
#[derive(Default)]
struct Throttle {
    recent: HashMap<(String, &'static str), (Instant, u32)>,
}

impl Throttle {
    /// Returns the message to post, or `None` for a routine failure or a recent repeat.
    fn message(&mut self, report: &Report, release: &str, now: Instant) -> Option<String> {
        if IGNORED_CODES.contains(&report.code) {
            return None;
        }
        let key = (report.operation.clone(), report.code);
        if let Some((sent, repeats)) = self.recent.get_mut(&key)
            && now.duration_since(*sent) < REPEAT_INTERVAL
        {
            *repeats += 1;
            return None;
        }
        let repeats = self
            .recent
            .insert(key, (now, 0))
            .map_or(0, |(_, repeats)| repeats);
        let repeats = match repeats {
            0 => String::new(),
            1 => " It also happened 1 more time since the last alert.".to_owned(),
            n => format!(" It also happened {n} more times since the last alert."),
        };
        Some(format!(
            "Server error `{}` in `{}` (release `{release}`, diagnostic ID `{}`).{repeats} \
             Details: `journalctl --unit=hanabi-live --grep={}`",
            report.code, report.operation, report.diagnostic_id, report.diagnostic_id
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
            return Arc::new(Self { queue: None });
        };
        let (queue, mut reports) = mpsc::channel::<Report>(30);
        tracker.spawn(async move {
            let sending = async {
                let mut throttle = Throttle::default();
                while let Some(report) = reports.recv().await {
                    let Some(message) = throttle.message(&report, &release, Instant::now()) else {
                        continue;
                    };
                    if let Err(error) = bridge.alert(&message).await {
                        Report::from_error("Posting an error alert to Discord", &error, None).log();
                    }
                }
            };
            tokio::pin!(sending);
            tokio::select! {
                () = &mut sending => {},
                () = shutdown.cancelled() => {
                    let _ = tokio::time::timeout(Duration::from_secs(2), &mut sending).await;
                },
            }
        });
        Arc::new(Self { queue: Some(queue) })
    }

    pub fn report(&self, report: &Report) {
        if let Some(queue) = &self.queue
            && queue.try_send(report.clone()).is_err()
        {
            eprintln!(
                "Error alert queue unavailable; diagnostic {} remains in local logs.",
                report.diagnostic_id
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(operation: &str, error: &str) -> Report {
        Report::from_error(operation, &anyhow::anyhow!(error.to_owned()), None)
    }

    #[test]
    fn alerts_omit_error_details_and_count_repeats() {
        let mut throttle = Throttle::default();
        let start = Instant::now();
        let first = report("Loading game history", "password-token-SQL-private-chat");
        let message = throttle.message(&first, "v1", start).unwrap();
        assert!(message.contains("`internal_operation_failed` in `Loading game history`"));
        assert!(message.contains(&first.diagnostic_id));
        assert!(!message.contains("password-token-SQL-private-chat"));
        assert!(!message.contains(&first.description));

        // Repeats are counted until the interval passes; other operations are independent.
        for seconds in [1, 2] {
            let repeat = report("Loading game history", "again");
            let now = start + Duration::from_secs(seconds);
            assert!(throttle.message(&repeat, "v1", now).is_none());
        }
        let other = report("Saving preferences", "other");
        assert!(
            throttle
                .message(&other, "v1", start + Duration::from_secs(3))
                .is_some()
        );
        let later = report("Loading game history", "later");
        let message = throttle
            .message(&later, "v1", start + REPEAT_INTERVAL)
            .unwrap();
        assert!(message.contains("2 more times since the last alert"));
        assert!(message.contains(&later.diagnostic_id));
    }

    #[test]
    fn routine_failures_are_not_posted() {
        let draining = Report::known(
            "Command note",
            "server_draining",
            "The server is not accepting new commands during startup or maintenance.",
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
        );
        assert!(
            Throttle::default()
                .message(&draining, "v1", Instant::now())
                .is_none()
        );
    }
}
