//! Errors that the website did not catch. The server logs them and opens a GitHub issue for them.

use super::App;
use crate::{accounts::truncate_to_max_chars, transport::Session};
use hanabi_protocol::{
    ClientErrorRequest, MAX_CLIENT_ERROR_MESSAGE_LENGTH, MAX_CLIENT_ERROR_STACK_LENGTH,
    SCRIPTS_PATH,
};
use serde_json::json;
use std::{
    sync::{Mutex, PoisonError},
    time::{Duration, Instant},
};

/// The most client errors that one user can report per `REPORT_WINDOW`. The server drops the rest.
pub(super) const REPORT_LIMIT: usize = 10;
const REPORT_WINDOW: Duration = Duration::from_hours(1);

/// Counts each user's client error reports.
pub(super) struct ClientErrorLimit(pub(super) Mutex<crate::accounts::Counter<i32>>);

impl Default for ClientErrorLimit {
    fn default() -> Self {
        Self(Mutex::new(crate::accounts::Counter::new(
            REPORT_LIMIT,
            REPORT_WINDOW,
        )))
    }
}

/// Logs a client error and alerts about it. It drops a report over the user's limit, and one that
/// does not come from the client that this server serves, such as an error in a browser extension
/// or a position that the user made up. The player sees nothing either way.
pub(super) fn record(app: &App, session: &Session, request: &ClientErrorRequest) {
    if app
        .client_error_limit
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .charge(session.user.get(), Instant::now())
        .is_err()
    {
        return;
    }
    let message = truncate_to_max_chars(&request.message, MAX_CLIENT_ERROR_MESSAGE_LENGTH);
    let stack = truncate_to_max_chars(&request.stack, MAX_CLIENT_ERROR_STACK_LENGTH);
    let positions = script_positions(stack, &client_script());
    let Some(location) = positions.first().cloned() else {
        return;
    };
    let diagnostic_id = crate::errors::diagnostic_id();
    tracing::error!(
        "Client failure: {}",
        json!({
            "timestamp": crate::clock::rfc3339(time::OffsetDateTime::now_utc()),
            "revision": crate::restart::version(),
            "userId": session.user,
            "location": location,
            "message": message,
            "stack": stack,
            "translated": request.translated,
            "diagnosticId": diagnostic_id
        })
    );
    if let Some(integrations) = app.integrations.get() {
        integrations.client_error(crate::integrations::github::ClientError {
            user: session.user,
            positions,
            translated: request.translated,
            diagnostic_id,
        });
    }
}

/// The file name of the client that this server serves (see "server/templates/main.html").
fn client_script() -> String {
    format!("main.{}.min.js", crate::restart::version())
}

/// The positions in a stack trace that are in `script`, one of the website's scripts, such as
/// "main.abc.min.js:880:251", from the innermost frame.
fn script_positions(stack: &str, script: &str) -> Vec<String> {
    let pattern = regex!(&format!(
        r"{}([A-Za-z0-9._-]+\.js):(\d+):(\d+)",
        regex::escape(SCRIPTS_PATH)
    ));
    pattern
        .captures_iter(stack)
        .filter(|captures| &captures[1] == script)
        .take(crate::integrations::github::MAX_STACK_POSITIONS)
        .map(|captures| format!("{}:{}:{}", &captures[1], &captures[2], &captures[3]))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_positions_come_only_from_the_website_scripts() {
        let stack = "TypeError: x is undefined\n    \
            at chrome-extension://abc/inject.js:1:2\n    \
            at M9 (https://hanab.live/public/js/bundles/main.abc.min.js:880:251)\n    \
            at https://hanab.live/public/js/bundles/main.abc.min.js:1:2\n    \
            at https://hanab.live/public/js/bundles/main.old.min.js:3:4";
        // A position in another script, such as an older client, is left out.
        assert_eq!(
            script_positions(stack, "main.abc.min.js"),
            ["main.abc.min.js:880:251", "main.abc.min.js:1:2"]
        );
        assert_eq!(
            script_positions(
                "Error\n    at https://example.com/inject.js:1:2",
                "inject.js"
            ),
            Vec::<String>::new()
        );
        // Only safe characters reach the issue.
        assert_eq!(
            script_positions("at /public/js/bundles/`@everyone`.js:1:2", "`@everyone`.js"),
            Vec::<String>::new()
        );
    }
}
