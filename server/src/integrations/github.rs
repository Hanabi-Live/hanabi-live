//! Opens a GitHub issue for each new client error, which starts Claude Code on it (see
//! ".github/workflows/claude.yml"). The repository is public, so an issue holds only the release,
//! the diagnostic ID, and the positions in the website's scripts. The error's message stays in the
//! local logs, since the client wrote it.
//!
//! The server opens the issues as the "Hanabi Live Issues Bot" GitHub App, which needs the
//! permission to write issues and an installation on the repository.
use crate::errors::Report;
use anyhow::{Context, Result, bail};
use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
};
use hanabi_protocol::UserId;
use ring::{
    rand::SystemRandom,
    signature::{RSA_PKCS1_SHA256, RsaKeyPair},
};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::{HashMap, VecDeque},
    fmt::Write,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tokio::sync::mpsc;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// The configuration value that holds the ID of the GitHub App.
pub const APP_ID: &str = "GITHUB_APP_ID";
/// The configuration value that holds the path of the GitHub App's private key.
pub const PRIVATE_KEY_FILE: &str = "GITHUB_APP_PRIVATE_KEY_FILE";

/// How long a token that proves that the server is the app lasts. GitHub accepts at most 10
/// minutes.
const APP_TOKEN_LIFETIME: Duration = Duration::from_mins(9);
/// How long before now an app token says that it was made, in case the server's clock is ahead of
/// GitHub's.
const CLOCK_DRIFT: Duration = Duration::from_mins(1);

const API: &str = "https://api.github.com";

const REPOSITORY: &str = "Hanabi-Live/hanabi-live";

/// The label of the issues for client errors. The workflow starts only for issues with it, which
/// only people with write access can add.
const LABEL: &str = "client-error";

/// The most issues that the server opens in `ISSUE_WINDOW`, so that a burst of errors does not
/// start many runs of Claude Code. One user's reports open at most one of them, so that one account
/// cannot use them all up with errors that it made up.
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
    /// The user whose client reported the error.
    pub user: UserId,
    /// The positions in the website's scripts in the stack, from the innermost frame.
    pub positions: Vec<String>,
    pub translated: bool,
    pub diagnostic_id: String,
}

pub struct Issues {
    queue: Option<mpsc::Sender<ClientError>>,
}

impl Issues {
    /// Starts sending issues, unless the app is not configured or this is a development server.
    pub fn start(
        values: &HashMap<String, String>,
        development: bool,
        release: String,
        tracker: &TaskTracker,
        shutdown: CancellationToken,
    ) -> Self {
        if development {
            return Self { queue: None };
        }
        let app = match App::read(values) {
            Ok(Some(app)) => app,
            Ok(None) => return Self { queue: None },
            Err(error) => {
                Report::from_error("Configuring the GitHub App", &error).log();
                return Self { queue: None };
            }
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
                match open_issue(&client, &app, &title, &issue_body(&error, &release)).await {
                    Ok(true) => throttle.opened(error.user, Instant::now()),
                    Ok(false) => {}
                    Err(failure) => {
                        Report::from_error("Opening a GitHub issue for a client error", &failure)
                            .log();
                    }
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
    /// When the server last tried to open an issue for each title.
    recent: HashMap<String, Instant>,
    /// The issues that the server opened in the last `ISSUE_WINDOW`: when, and for whose report.
    opened: VecDeque<(Instant, UserId)>,
}

impl Throttle {
    /// Returns the title of the issue to open, or `None` for a recent repeat, or when the server
    /// or the error's user opened too many issues recently. The caller reports an issue that it
    /// opens with `opened`.
    fn title(&mut self, error: &ClientError, now: Instant) -> Option<String> {
        let location = error.positions.first()?;
        let title = format!("Client error at {location}");
        self.recent
            .retain(|_, sent| now.duration_since(*sent) < REPEAT_INTERVAL);
        while self
            .opened
            .front()
            .is_some_and(|(sent, _)| now.duration_since(*sent) >= ISSUE_WINDOW)
        {
            self.opened.pop_front();
        }
        if self.recent.contains_key(&title)
            || self.opened.len() >= MAX_ISSUES
            || self.opened.iter().any(|(_, user)| *user == error.user)
        {
            return None;
        }
        self.recent.insert(title.clone(), now);
        Some(title)
    }

    /// Counts an issue that the server opened for a user's report. A request that failed, or that
    /// found the issue already open, does not count.
    fn opened(&mut self, user: UserId, now: Instant) {
        self.opened.push_back((now, user));
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

/// The GitHub App that opens the issues.
struct App {
    id: String,
    key: RsaKeyPair,
}

impl App {
    /// Reads the app's ID and private key, or returns `None` when neither is configured.
    fn read(values: &HashMap<String, String>) -> Result<Option<Self>> {
        let value = |key: &str| values.get(key).map(|v| v.trim()).filter(|v| !v.is_empty());
        let (id, path) = match (value(APP_ID), value(PRIVATE_KEY_FILE)) {
            (None, None) => return Ok(None),
            (Some(id), Some(path)) => (id, path),
            _ => bail!("{APP_ID} and {PRIVATE_KEY_FILE} must both be provided"),
        };
        let pem =
            std::fs::read_to_string(path).with_context(|| format!("Reading {PRIVATE_KEY_FILE}"))?;
        Ok(Some(Self {
            id: id.to_owned(),
            key: private_key(&pem)?,
        }))
    }

    /// A token that proves that the server is the app (a JSON Web Token signed with its key).
    fn app_token(&self) -> Result<String> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH)?;
        let header = URL_SAFE_NO_PAD.encode(json!({ "alg": "RS256", "typ": "JWT" }).to_string());
        let claims = URL_SAFE_NO_PAD.encode(
            json!({
                "iat": now.saturating_sub(CLOCK_DRIFT).as_secs(),
                "exp": (now + APP_TOKEN_LIFETIME).as_secs(),
                "iss": self.id,
            })
            .to_string(),
        );
        let message = format!("{header}.{claims}");
        let mut signature = vec![0; self.key.public().modulus_len()];
        self.key
            .sign(
                &RSA_PKCS1_SHA256,
                &SystemRandom::new(),
                message.as_bytes(),
                &mut signature,
            )
            .map_err(|_| anyhow::anyhow!("Signing the GitHub App token failed"))?;
        Ok(format!("{message}.{}", URL_SAFE_NO_PAD.encode(signature)))
    }

    /// A token that lets the app write the repository's issues for an hour.
    async fn installation_token(&self, client: &reqwest::Client) -> Result<String> {
        #[derive(Deserialize)]
        struct Installation {
            id: u64,
        }
        #[derive(Deserialize)]
        struct Token {
            token: String,
        }
        let app_token = self.app_token()?;
        let installation: Installation = client
            .get(format!("{API}/repos/{REPOSITORY}/installation"))
            .bearer_auth(&app_token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()
            .context("Finding the app's installation on the repository")?
            .json()
            .await?;
        let token: Token = client
            .post(format!(
                "{API}/app/installations/{}/access_tokens",
                installation.id
            ))
            .bearer_auth(&app_token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await?
            .error_for_status()
            .context("Getting a token for the app's installation")?
            .json()
            .await?;
        Ok(token.token)
    }
}

/// Reads an RSA private key in PEM, such as the one that GitHub makes for an app (PKCS #1).
fn private_key(pem: &str) -> Result<RsaKeyPair> {
    let der = STANDARD
        .decode(
            pem.lines()
                .filter(|line| !line.starts_with("-----"))
                .collect::<String>(),
        )
        .context("The GitHub App's private key is not valid PEM")?;
    let key = if pem.contains("BEGIN RSA PRIVATE KEY") {
        RsaKeyPair::from_der(&der)
    } else {
        RsaKeyPair::from_pkcs8(&der)
    };
    key.map_err(|error| anyhow::anyhow!("The GitHub App's private key is not valid: {error}"))
}

#[derive(Deserialize)]
struct Issue {
    title: String,
}

/// Opens the issue, unless an open issue already has its title, such as after a restart. Returns
/// whether it opened one.
async fn open_issue(client: &reqwest::Client, app: &App, title: &str, body: &str) -> Result<bool> {
    let token = app.installation_token(client).await?;
    let url = format!("{API}/repos/{REPOSITORY}/issues");
    let open: Vec<Issue> = client
        .get(format!("{url}?labels={LABEL}&state=open&per_page=100"))
        .bearer_auth(&token)
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
        return Ok(false);
    }
    client
        .post(&url)
        .bearer_auth(&token)
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
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(location: &str) -> ClientError {
        error_of(1, location)
    }

    fn error_of(user: i32, location: &str) -> ClientError {
        ClientError {
            user: UserId::new(user).unwrap(),
            positions: vec![location.to_owned(), "main.abc.min.js:1:2".to_owned()],
            translated: true,
            diagnostic_id: "d1".to_owned(),
        }
    }

    #[test]
    fn repeats_and_bursts_open_no_issue() {
        let mut throttle = Throttle::default();
        let start = Instant::now();
        // A request that fails, or that finds the issue already open, uses up no issue.
        assert!(
            throttle
                .title(&error("main.abc.min.js:7:7"), start)
                .is_some()
        );
        assert_eq!(
            throttle
                .title(&error("main.abc.min.js:5:6"), start)
                .as_deref(),
            Some("Client error at main.abc.min.js:5:6")
        );
        throttle.opened(error("").user, start);
        assert!(
            throttle
                .title(&error("main.abc.min.js:5:6"), start)
                .is_none()
        );
        // One user cannot open every issue of the window.
        assert!(
            throttle
                .title(&error("main.abc.min.js:8:8"), start)
                .is_none()
        );
        for (user, index) in (2..).zip(1..MAX_ISSUES) {
            let other = error_of(user, &format!("main.abc.min.js:{index}:0"));
            assert!(throttle.title(&other, start).is_some());
            throttle.opened(other.user, start);
        }
        assert!(
            throttle
                .title(&error_of(9, "main.abc.min.js:9:9"), start)
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
