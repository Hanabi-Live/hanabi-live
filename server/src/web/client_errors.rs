//! Errors that the website did not catch. The server logs them and alerts its developers.

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
/// does not come from the website's scripts, such as an error in a browser extension. The player
/// sees nothing either way.
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
    let Some(location) = script_location(stack) else {
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
            "diagnosticId": diagnostic_id
        })
    );
    if let Some(integrations) = app.integrations.get() {
        integrations.client_error(&location, message, &diagnostic_id);
    }
}

/// The first position in a stack trace that is in one of the website's scripts, such as
/// "main.abc.min.js:880:251".
fn script_location(stack: &str) -> Option<String> {
    let pattern = regex!(&format!(
        r"{}([A-Za-z0-9._-]+\.js):(\d+):(\d+)",
        regex::escape(SCRIPTS_PATH)
    ));
    let captures = pattern.captures(stack)?;
    Some(format!(
        "{}:{}:{}",
        &captures[1], &captures[2], &captures[3]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_locations_come_only_from_the_website_scripts() {
        let stack = "TypeError: x is undefined\n    \
            at chrome-extension://abc/inject.js:1:2\n    \
            at M9 (https://hanab.live/public/js/bundles/main.abc.min.js:880:251)\n    \
            at https://hanab.live/public/js/bundles/main.abc.min.js:1:2";
        assert_eq!(
            script_location(stack).as_deref(),
            Some("main.abc.min.js:880:251")
        );
        assert_eq!(
            script_location("Error\n    at https://example.com/inject.js:1:2"),
            None
        );
        // Only safe characters reach the alert.
        assert_eq!(
            script_location("at /public/js/bundles/`@everyone`.js:1:2"),
            None
        );
    }
}
