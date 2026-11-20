//! Opens a GitHub issue for each new client error, which starts Claude Code on it (see
//! ".github/workflows/claude.yml"). The repository is public, so an issue holds only the release,
//! the diagnostic ID, and the positions in the website's scripts. The error's message stays in the
//! local logs, since the client wrote it.
use crate::errors::Report;
use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::{HashMap, VecDeque},
    fmt::Write,
    time::{Duration, Instant},
};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// The configuration value that holds a GitHub token that can write issues.
const TOKEN: &str = "GITHUB_ISSUES_TOKEN";

const REPOSITORY: &str = "Hanabi-Live/hanabi-live";

/// The label of the issues for client errors. The workflow starts only for issues with it, which
/// only people with write access can add.
const LABEL: &str = "client-error";

/// The most issues that the server opens in `ISSUE_WINDOW`, so that a burst of errors does not
/// start many runs of Claude Code.
const MAX_ISSUES: usize = 3;
const ISSUE_WINDOW: Duration = Duration::from_hours(1);

/// How long the server does not open another issue for an error at the same position.
const REPEAT_INTERVAL: Duration = Duration::from_hours(24);

/// The most stack positions in an issue.
pub const MAX_STACK_POSITIONS: usize = 30;

/// The client errors queued before new ones are dropped.
const QUEUE: usize = 30;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// An error that a client did not catch.
pub struct ClientError {
    /// The positions in the website's scripts in the stack, from the innermost frame.
    pub positions: Vec<String>,
    pub translated: bool,
    pub diagnostic_id: String,
}

pub struct Issues {
    queue: Option<mpsc::Sender<ClientError>>,
}

impl Issues {
    /// Starts sending issues, unless the token is not configured or this is a development server.
    pub fn start(
        values: &HashMap<String, String>,
        development: bool,
        release: String,
        tracker: &TaskTracker,
        shutdown: CancellationToken,
    ) -> Self {
        let Some(token) = values
            .get(TOKEN)
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty() && !development)
        else {
            return Self { queue: None };
        };
        let (queue, mut errors) = mpsc::channel::<ClientError>(QUEUE);
        tracker.spawn(async move {
            let client = match reqwest::Client::builder()
                .timeout(REQUEST_TIMEOUT)
                .user_agent("hanabi-live")
                .build()
            {
                Ok(client) => client,
                Err(error) => {
                    Report::from_error("Starting the GitHub client", &error.into()).log();
                    return;
                }
            };
            let mut throttle = Throttle::default();
            loop {
                let error = tokio::select! {
                    error = errors.recv() => error,
                    () = shutdown.cancelled() => None,
                };
                let Some(error) = error else {
                    break;
                };
                let Some(title) = throttle.title(&error, Instant::now()) else {
                    continue;
                };
                if let Err(failure) =
                    open_issue(&client, &token, &title, &issue_body(&error, &release)).await
                {
                    Report::from_error("Opening a GitHub issue for a client error", &failure).log();
                }
            }
        });
        Self { queue: Some(queue) }
    }

    pub fn client_error(&self, error: ClientError) {
        if let Some(queue) = &self.queue
            && let Err(failure) = queue.try_send(error)
        {
            let error = match failure {
                mpsc::error::TrySendError::Full(error)
                | mpsc::error::TrySendError::Closed(error) => error,
            };
            tracing::warn!(
                "Client error queue unavailable; diagnostic {} remains in local logs.",
                error.diagnostic_id
            );
        }
    }
}

/// Decides which client errors get an issue.
#[derive(Default)]
struct Throttle {
    /// When the server last opened an issue for each title.
    recent: HashMap<String, Instant>,
    /// When the server opened its issues in the last `ISSUE_WINDOW`.
    opened: VecDeque<Instant>,
}

impl Throttle {
    /// Returns the title of the issue to open, or `None` for a recent repeat or when too many
    /// issues were opened recently.
    fn title(&mut self, error: &ClientError, now: Instant) -> Option<String> {
        let location = error.positions.first()?;
        let title = format!("Client error at {location}");
        self.recent
            .retain(|_, sent| now.duration_since(*sent) < REPEAT_INTERVAL);
        while self
            .opened
            .front()
            .is_some_and(|sent| now.duration_since(*sent) >= ISSUE_WINDOW)
        {
            self.opened.pop_front();
        }
        if self.recent.contains_key(&title) || self.opened.len() >= MAX_ISSUES {
            return None;
        }
        self.recent.insert(title.clone(), now);
        self.opened.push_back(now);
        Some(title)
    }
}

fn issue_body(error: &ClientError, release: &str) -> String {
    let mut body = format!(
        "The website reported an error that it did not catch.\n\n\
         - Release: `{release}`\n\
         - Diagnostic ID: `{}`\n",
        error.diagnostic_id
    );
    if error.translated {
        body.push_str("- A translator had changed the page.\n");
    }
    body.push_str(
        "\nThe positions in the website's scripts in the stack, from the innermost frame:\n\n```\n",
    );
    for position in &error.positions {
        let _ = writeln!(body, "{position}");
    }
    body.push_str(
        "```\n\nThe error's message is not in this issue, since the player's browser wrote it. \
         It is in the server's log, under the diagnostic ID.\n",
    );
    body
}

#[derive(Deserialize)]
struct Issue {
    title: String,
}

/// Opens the issue, unless an open issue already has its title, such as after a restart.
async fn open_issue(client: &reqwest::Client, token: &str, title: &str, body: &str) -> Result<()> {
    let url = format!("https://api.github.com/repos/{REPOSITORY}/issues");
    let open: Vec<Issue> = client
        .get(format!("{url}?labels={LABEL}&state=open&per_page=100"))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .context("Listing the open client error issues")?
        .error_for_status()
        .context("Listing the open client error issues")?
        .json()
        .await
        .context("Reading the open client error issues")?;
    if open.iter().any(|issue| issue.title == title) {
        return Ok(());
    }
    client
        .post(&url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .json(&json!({
            "title": title,
            "body": body,
            "labels": [LABEL],
        }))
        .send()
        .await
        .context("Creating the issue")?
        .error_for_status()
        .context("Creating the issue")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(location: &str) -> ClientError {
        ClientError {
            positions: vec![location.to_owned(), "main.abc.min.js:1:2".to_owned()],
            translated: true,
            diagnostic_id: "d1".to_owned(),
        }
    }

    #[test]
    fn repeats_and_bursts_open_no_issue() {
        let mut throttle = Throttle::default();
        let start = Instant::now();
        assert_eq!(
            throttle
                .title(&error("main.abc.min.js:5:6"), start)
                .as_deref(),
            Some("Client error at main.abc.min.js:5:6")
        );
        assert!(
            throttle
                .title(&error("main.abc.min.js:5:6"), start)
                .is_none()
        );
        for index in 1..MAX_ISSUES {
            assert!(
                throttle
                    .title(&error(&format!("main.abc.min.js:{index}:0")), start)
                    .is_some()
            );
        }
        assert!(
            throttle
                .title(&error("main.abc.min.js:9:9"), start)
                .is_none()
        );
        // Once the window passes, a new error gets an issue, but a repeat still waits.
        let later = start + ISSUE_WINDOW;
        assert!(
            throttle
                .title(&error("main.abc.min.js:9:9"), later)
                .is_some()
        );
        assert!(
            throttle
                .title(&error("main.abc.min.js:5:6"), later)
                .is_none()
        );
        let next_day = start + REPEAT_INTERVAL;
        assert!(
            throttle
                .title(&error("main.abc.min.js:5:6"), next_day)
                .is_some()
        );
    }

    #[test]
    fn the_body_lists_the_positions() {
        let body = issue_body(&error("main.abc.min.js:5:6"), "abc");
        assert!(body.contains("Release: `abc`"));
        assert!(body.contains("Diagnostic ID: `d1`"));
        assert!(body.contains("A translator had changed the page."));
        assert!(body.contains("main.abc.min.js:5:6\nmain.abc.min.js:1:2\n"));
    }
}
