//! Limits password guessing before any expensive password hashing happens.
//!
//! The server terminates its own connections, so the peer address is trustworthy and forwarding
//! headers (which clients can forge) must not be used. Counts live in memory: there is one server
//! and a restart only forgives recent failures.

use std::{
    collections::{HashMap, VecDeque},
    fmt,
    hash::Hash,
    net::{IpAddr, Ipv6Addr},
    sync::{LazyLock, Mutex, PoisonError},
    time::{Duration, Instant},
};

const IP_LIMIT: usize = 20;
const IP_WINDOW: Duration = Duration::from_mins(15);
/// The most that NIST SP 800-63B allows. A low limit would make it easy to lock someone out.
const ACCOUNT_LIMIT: usize = 100;
const ACCOUNT_WINDOW: Duration = Duration::from_hours(1);
const MAX_TRACKED_KEYS: usize = 10_000;
/// Every password check or hash costs the same, whether or not it succeeds, so all of them share
/// one budget per address. A visit needs one or two.
const WORK_LIMIT: usize = 30;
const WORK_WINDOW: Duration = Duration::from_mins(5);
static WORK: LazyLock<Mutex<Counter<IpAddr>>> =
    LazyLock::new(|| Mutex::new(Counter::new(WORK_LIMIT, WORK_WINDOW)));

#[derive(Debug)]
pub struct TooMuchPasswordWork(pub Duration);

impl fmt::Display for TooMuchPasswordWork {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let minutes = self.0.as_secs().div_ceil(60).max(1);
        write!(
            formatter,
            "Too many password checks came from your network. Please try again in {minutes} minute{}.",
            if minutes == 1 { "" } else { "s" }
        )
    }
}
impl std::error::Error for TooMuchPasswordWork {}

/// Charges one password check or hash to the client's address before any of the work happens.
pub(super) fn charge_password_work(ip: &str) -> Result<(), TooMuchPasswordWork> {
    let Some(ip) = ip_key(ip) else {
        return Ok(());
    };
    WORK.lock()
        .unwrap_or_else(PoisonError::into_inner)
        .charge(ip, Instant::now())
        .map_err(|wait| {
            eprintln!(
                "Refused a password check from {ip} for {} more seconds.",
                wait.as_secs()
            );
            TooMuchPasswordWork(wait)
        })
}

struct Counter<K> {
    limit: usize,
    window: Duration,
    attempts: HashMap<K, VecDeque<Instant>>,
    last_sweep: Option<Instant>,
}

impl<K: Copy + Eq + Hash> Counter<K> {
    fn new(limit: usize, window: Duration) -> Self {
        Self {
            limit,
            window,
            attempts: HashMap::new(),
            last_sweep: None,
        }
    }

    /// Records an attempt, or returns how long to wait if the limit has been reached.
    fn charge(&mut self, key: K, now: Instant) -> Result<(), Duration> {
        self.make_room(now);
        let window = self.window;
        let attempts = self.attempts.entry(key).or_default();
        while attempts
            .front()
            .is_some_and(|attempt| now.duration_since(*attempt) >= window)
        {
            attempts.pop_front();
        }
        if attempts.len() >= self.limit {
            let oldest = attempts.front().copied().unwrap_or(now);
            return Err(window.saturating_sub(now.duration_since(oldest)));
        }
        attempts.push_back(now);
        Ok(())
    }

    fn refund(&mut self, key: K) {
        if let Some(attempts) = self.attempts.get_mut(&key) {
            attempts.pop_back();
            if attempts.is_empty() {
                self.attempts.remove(&key);
            }
        }
    }

    /// Keeps memory bounded when many addresses are involved.
    fn make_room(&mut self, now: Instant) {
        let swept_recently = self
            .last_sweep
            .is_some_and(|sweep| now.duration_since(sweep) < self.window);
        if swept_recently && self.attempts.len() < MAX_TRACKED_KEYS {
            return;
        }
        self.last_sweep = Some(now);
        let window = self.window;
        self.attempts.retain(|_, attempts| {
            attempts
                .back()
                .is_some_and(|attempt| now.duration_since(*attempt) < window)
        });
        if self.attempts.len() >= MAX_TRACKED_KEYS {
            let stalest = self
                .attempts
                .iter()
                .min_by_key(|(_, attempts)| attempts.back().copied())
                .map(|(key, _)| *key);
            if let Some(key) = stalest {
                self.attempts.remove(&key);
            }
        }
    }
}

/// One customer can control an entire IPv6 /64, so individual addresses are not a useful limit.
fn ip_key(ip: &str) -> Option<IpAddr> {
    let ip = ip.parse::<IpAddr>().ok()?.to_canonical();
    // Nothing remote can arrive from loopback, which local tools and tests use.
    if ip.is_loopback() {
        return None;
    }
    Some(match ip {
        IpAddr::V4(_) => ip,
        IpAddr::V6(address) => IpAddr::V6(Ipv6Addr::from(u128::from(address) & (u128::MAX << 64))),
    })
}

pub(super) struct LoginLimits {
    ips: Mutex<Counter<IpAddr>>,
    accounts: Mutex<Counter<i32>>,
}

impl Default for LoginLimits {
    fn default() -> Self {
        Self {
            ips: Mutex::new(Counter::new(IP_LIMIT, IP_WINDOW)),
            accounts: Mutex::new(Counter::new(ACCOUNT_LIMIT, ACCOUNT_WINDOW)),
        }
    }
}

impl LoginLimits {
    /// Charging up front stops parallel requests from slipping past the limit. The charge is
    /// refunded when the attempt is dropped, unless it is kept.
    pub(super) fn begin(&self, ip: &str) -> Result<LoginAttempt<'_>, Duration> {
        let ip = ip_key(ip);
        if let Some(ip) = ip {
            self.ips
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .charge(ip, Instant::now())?;
        }
        Ok(LoginAttempt {
            limits: self,
            ip,
            account: None,
            kept: false,
        })
    }
}

pub(super) struct LoginAttempt<'a> {
    limits: &'a LoginLimits,
    ip: Option<IpAddr>,
    account: Option<i32>,
    kept: bool,
}

impl LoginAttempt<'_> {
    pub(super) fn charge_account(&mut self, id: i32) -> Result<(), Duration> {
        self.limits
            .accounts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .charge(id, Instant::now())?;
        self.account = Some(id);
        Ok(())
    }

    /// Counts this attempt against the limits. Successful logins are not kept, and they do not
    /// clear earlier failures, because attackers could otherwise reset the count with an account
    /// of their own.
    pub(super) fn keep(mut self) {
        self.kept = true;
    }
}

impl Drop for LoginAttempt<'_> {
    fn drop(&mut self) {
        if self.kept {
            return;
        }
        if let Some(ip) = self.ip {
            self.limits
                .ips
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .refund(ip);
        }
        if let Some(account) = self.account {
            self.limits
                .accounts
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .refund(account);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WINDOW: Duration = Duration::from_secs(60);

    #[test]
    fn blocks_at_the_limit_until_the_oldest_attempt_expires() {
        let start = Instant::now();
        let mut counter = Counter::new(2, WINDOW);
        assert_eq!(counter.charge(1, start), Ok(()));
        let later = start + Duration::from_secs(10);
        assert_eq!(counter.charge(1, later), Ok(()));
        assert_eq!(counter.charge(1, later), Err(Duration::from_secs(50)));
        assert_eq!(counter.charge(2, later), Ok(()), "keys are independent");
        assert_eq!(counter.charge(1, start + WINDOW), Ok(()));
    }

    #[test]
    fn refunded_attempts_do_not_count() {
        let now = Instant::now();
        let mut counter = Counter::new(1, WINDOW);
        assert_eq!(counter.charge(1, now), Ok(()));
        counter.refund(1);
        assert!(counter.attempts.is_empty());
        assert_eq!(counter.charge(1, now), Ok(()));
    }

    #[test]
    fn memory_stays_bounded_with_many_addresses() {
        let now = Instant::now();
        let mut counter = Counter::new(1, WINDOW);
        for key in 0..MAX_TRACKED_KEYS * 2 {
            counter.charge(key, now).unwrap();
        }
        assert!(counter.attempts.len() <= MAX_TRACKED_KEYS);
        counter.charge(0, now + WINDOW).unwrap();
        assert_eq!(counter.attempts.len(), 1, "expired entries are swept");
    }

    #[test]
    fn addresses_are_grouped_like_their_owners() {
        assert_eq!(
            ip_key("2001:db8:1:2:aaaa::1"),
            ip_key("2001:db8:1:2:bbbb::2")
        );
        assert_ne!(ip_key("2001:db8:1:2::1"), ip_key("2001:db8:1:3::1"));
        assert_eq!(ip_key("203.0.113.9"), ip_key("::ffff:203.0.113.9"));
        assert_ne!(ip_key("203.0.113.9"), ip_key("203.0.113.10"));
        assert_eq!(ip_key("127.0.0.1"), None);
        assert_eq!(ip_key("::1"), None);
    }

    #[test]
    fn dropped_attempts_are_refunded_and_kept_attempts_count() {
        let limits = LoginLimits::default();
        for _ in 0..IP_LIMIT * 2 {
            let mut attempt = limits.begin("203.0.113.9").unwrap();
            attempt.charge_account(1).unwrap();
        }
        for _ in 0..IP_LIMIT {
            limits.begin("203.0.113.9").unwrap().keep();
        }
        let blocked = limits.begin("203.0.113.9").err().unwrap();
        assert!(blocked > Duration::ZERO && blocked <= IP_WINDOW);
        assert!(limits.begin("203.0.113.10").is_ok());
        assert!(limits.begin("127.0.0.1").is_ok());
    }

    #[test]
    fn password_work_is_limited_per_address() {
        for _ in 0..WORK_LIMIT {
            charge_password_work("198.51.100.7").unwrap();
        }
        let TooMuchPasswordWork(wait) = charge_password_work("198.51.100.7").unwrap_err();
        assert!(wait > Duration::ZERO && wait <= WORK_WINDOW);
        assert!(charge_password_work("198.51.100.8").is_ok());
        assert!(charge_password_work("127.0.0.1").is_ok());
    }

    #[test]
    fn accounts_are_limited_across_addresses() {
        let limits = LoginLimits::default();
        for index in 0..ACCOUNT_LIMIT {
            let mut attempt = limits.begin(&format!("10.0.{}.1", index % 200)).unwrap();
            attempt.charge_account(7).unwrap();
            attempt.keep();
        }
        let mut attempt = limits.begin("203.0.113.9").unwrap();
        assert!(attempt.charge_account(7).is_err());
        assert!(attempt.charge_account(8).is_ok());
    }
}
