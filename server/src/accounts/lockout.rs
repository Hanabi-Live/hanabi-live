//! Slows down password guessing against one account, without letting the guesser lock the owner
//! out.
//!
//! The limits by address in `rate_limit` do not stop someone who guesses from many addresses. So
//! each account also counts its failed logins, and makes clients wait longer and longer between
//! groups of them. NIST SP 800-63B asks for such a limit. A plain limit would let anyone lock an
//! owner out, so it does not apply to a browser that signed in to the account before, which a
//! device cookie marks (see `cookie::Device`, and "device cookies" in the OWASP guide to blocking
//! brute force attacks). Such a browser has its own limit in `rate_limit`.
//!
//! The counts are in the database, so that a restart does not forgive them, and so that guessing
//! at many accounts cannot push one out of memory.

use anyhow::Result;
use sqlx::PgPool;
use std::time::Duration;

/// The failed logins after which an account makes unknown clients wait.
const FAILURES_PER_WAIT: i32 = 10;
/// The first wait. Each wait after it is twice as long as the one before.
const FIRST_WAIT: Duration = Duration::from_mins(1);
/// The longest wait. At this wait, an account lets through `FAILURES_PER_WAIT` guesses per day. An
/// account with no failed login for this long starts again at the first wait.
const LONGEST_WAIT: Duration = Duration::from_hours(24);
/// The most times that the wait doubles. More would not change the wait, which `LONGEST_WAIT`
/// limits, but the number would grow too large for the database to compute.
const MOST_DOUBLINGS: i32 = 30;

/// Counts a login to an account from a client that never signed in to it, before its password is
/// checked. Counting first stops parallel requests from slipping past the limit. Returns how long
/// to wait if the account accepts no such login now. `clear` forgives the count when the login
/// succeeds.
pub(super) async fn count_attempt(pool: &PgPool, id: i32) -> Result<Option<Duration>> {
    let counted = sqlx::query_scalar!(
        "INSERT INTO login_failures AS f (user_id, failures, blocked_until) VALUES ($1, 1, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
             failures = CASE
                 WHEN f.blocked_until < NOW() - make_interval(secs => $4::float8) THEN 1
                 ELSE f.failures + 1 END,
             blocked_until = CASE
                 WHEN f.blocked_until < NOW() - make_interval(secs => $4::float8) THEN NOW()
                 WHEN (f.failures + 1) % $2::integer = 0 THEN NOW() + make_interval(secs => LEAST(
                     $4::float8,
                     $3::float8 * power(2, LEAST((f.failures + 1) / $2::integer - 1, $5::integer))))
                 ELSE f.blocked_until END
         WHERE f.blocked_until <= NOW()
         RETURNING f.failures",
        id,
        FAILURES_PER_WAIT,
        FIRST_WAIT.as_secs_f64(),
        LONGEST_WAIT.as_secs_f64(),
        MOST_DOUBLINGS
    )
    .fetch_optional(pool)
    .await?;
    if counted.is_some() {
        return Ok(None);
    }
    let seconds = sqlx::query_scalar!(
        "SELECT EXTRACT(EPOCH FROM blocked_until - NOW())::float8 AS \"seconds!\"
         FROM login_failures WHERE user_id = $1",
        id
    )
    .fetch_optional(pool)
    .await?;
    // The wait can end between the two statements.
    Ok(seconds
        .filter(|seconds| *seconds > 0.0)
        .map(Duration::from_secs_f64))
}

/// Forgives the failed logins of an account, after a successful login.
pub(super) async fn clear(pool: &PgPool, id: i32) -> Result<()> {
    sqlx::query!("DELETE FROM login_failures WHERE user_id = $1", id)
        .execute(pool)
        .await?;
    Ok(())
}
