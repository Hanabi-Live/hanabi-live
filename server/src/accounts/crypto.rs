use anyhow::{Result, anyhow, ensure};
use argon2::{Algorithm, Argon2, Params, PasswordHash, PasswordHasher, PasswordVerifier, Version};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, KeyInit, Mac};
use rand::TryRng;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::{
    fmt,
    sync::{Arc, LazyLock},
    time::Duration as WaitDuration,
};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};

const HASH_WAIT: WaitDuration = WaitDuration::from_secs(10);
/// The memory that each password hash uses, in the KiB that Argon2 counts.
#[expect(clippy::cast_possible_truncation, reason = "64 MiB in KiB fits in u32")]
const PASSWORD_MEMORY: u32 = (64 * crate::MIB / crate::KIB) as u32;
const PASSWORD_PASSES: u32 = 3;
const PASSWORD_LANES: u32 = 4;
const PASSWORD_KEY_BYTES: usize = 32;
const PASSWORD_SALT_BYTES: usize = 16;
/// The random bytes in an identity token.
const IDENTITY_TOKEN_BYTES: usize = 96;
/// How long an identity token stays valid.
const IDENTITY_TOKEN_LIFETIME: Duration = Duration::days(1);
/// The password hashes that run at once.
const HASH_WORKERS: usize = 4;
/// The password hashes that can wait for a worker before new requests are refused.
const HASH_QUEUE: usize = 32;
static HASH_ADMISSION: LazyLock<HashAdmission> =
    LazyLock::new(|| HashAdmission::new(HASH_WORKERS, HASH_QUEUE));

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HashOverload {
    QueueFull,
    WaitExpired,
    Unavailable,
}

impl HashOverload {
    pub fn diagnostic(self) -> &'static str {
        match self {
            Self::QueueFull => "password-worker admission queue is full",
            Self::WaitExpired => "password-worker admission wait expired",
            Self::Unavailable => "password-worker admission is unavailable",
        }
    }
}

impl fmt::Display for HashOverload {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Password processing is temporarily busy. Please try again.")
    }
}
impl std::error::Error for HashOverload {}

#[derive(Debug)]
pub enum HashFailure {
    Parameters,
    Hashing,
    StoredHash,
}
impl HashFailure {
    pub fn diagnostic(&self) -> &'static str {
        match self {
            Self::Parameters => "password-worker parameters are invalid",
            Self::Hashing => "password hashing failed",
            Self::StoredHash => "stored password hash is invalid",
        }
    }
}
impl fmt::Display for HashFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.diagnostic())
    }
}
impl std::error::Error for HashFailure {}

struct HashAdmission {
    workers: Arc<Semaphore>,
    outstanding: Arc<Semaphore>,
}

#[derive(Debug)]
struct HashPermit {
    _worker: OwnedSemaphorePermit,
    _outstanding: OwnedSemaphorePermit,
}

impl HashAdmission {
    fn new(workers: usize, waiting: usize) -> Self {
        Self {
            workers: Arc::new(Semaphore::new(workers)),
            outstanding: Arc::new(Semaphore::new(workers + waiting)),
        }
    }

    async fn acquire(&self, wait: WaitDuration) -> std::result::Result<HashPermit, HashOverload> {
        let outstanding =
            self.outstanding
                .clone()
                .try_acquire_owned()
                .map_err(|error| match error {
                    tokio::sync::TryAcquireError::NoPermits => HashOverload::QueueFull,
                    tokio::sync::TryAcquireError::Closed => HashOverload::Unavailable,
                })?;
        // Only admitted callers wait, and only worker holders spawn CPU work.
        // Cancellation releases queued admission; active work retains both
        // permits in its blocking closure until it actually finishes.
        let worker = tokio::time::timeout(wait, self.workers.clone().acquire_owned())
            .await
            .map_err(|_| HashOverload::WaitExpired)?
            .map_err(|_| HashOverload::Unavailable)?;
        Ok(HashPermit {
            _worker: worker,
            _outstanding: outstanding,
        })
    }
}

pub async fn hash_password(ip: &str, password: String) -> Result<String> {
    super::rate_limit::charge_password_work(ip)?;
    let permit = HASH_ADMISSION.acquire(HASH_WAIT).await?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let params = Params::new(
            PASSWORD_MEMORY,
            PASSWORD_PASSES,
            PASSWORD_LANES,
            Some(PASSWORD_KEY_BYTES),
        )
        .map_err(|_| HashFailure::Parameters)?;
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password(password.as_bytes())
            .map(|hash| hash.to_string())
            .map_err(|_| anyhow!(HashFailure::Hashing))
    })
    .await?
}

pub async fn verify_password(ip: &str, password: String, hash: String) -> Result<bool> {
    super::rate_limit::charge_password_work(ip)?;
    let permit = HASH_ADMISSION.acquire(HASH_WAIT).await?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let parsed = PasswordHash::new(&hash).map_err(|_| HashFailure::StoredHash)?;
        match Argon2::default().verify_password(password.as_bytes(), &parsed) {
            Ok(()) => Ok(true),
            Err(argon2::password_hash::Error::PasswordInvalid) => Ok(false),
            Err(_) => Err(anyhow!(HashFailure::StoredHash)),
        }
    })
    .await?
}

pub(super) fn password_needs_upgrade(hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(hash).map_err(|_| HashFailure::StoredHash)?;
    let params = Params::try_from(&parsed).map_err(|_| HashFailure::StoredHash)?;
    let salt_length = parsed.salt.ok_or(HashFailure::StoredHash)?.as_ref().len();
    let key_length = parsed.hash.ok_or(HashFailure::StoredHash)?.len();
    Ok(params.t_cost() < PASSWORD_PASSES
        && params.m_cost() <= PASSWORD_MEMORY
        && salt_length <= PASSWORD_SALT_BYTES
        && key_length <= PASSWORD_KEY_BYTES)
}

pub fn token_lookup_hash(secret: &str, token: &str) -> Result<String> {
    ensure!(!secret.is_empty(), "Missing signing key");
    let mut mac = Hmac::<Sha256>::new_from_slice(&Sha256::digest(secret.as_bytes()))?;
    mac.update(token.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub struct IdentityToken {
    pub token: String,
    pub expires_at: DateTime<Utc>,
}

pub async fn regenerate_token(
    pool: &PgPool,
    secret: &str,
    id: i32,
    ip: &str,
) -> Result<IdentityToken> {
    let mut bytes = [0; IDENTITY_TOKEN_BYTES];
    rand::rngs::SysRng.try_fill_bytes(&mut bytes)?;
    let token = URL_SAFE_NO_PAD.encode(bytes);
    let lookup = token_lookup_hash(secret, &token)?;
    let hash = hash_password(ip, token.clone()).await?;
    let expires_at = Utc::now() + IDENTITY_TOKEN_LIFETIME;
    sqlx::query!(
        "INSERT INTO user_identity_tokens (user_id, token_hash, token_lookup_hash, expires_at)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET
         token_hash=EXCLUDED.token_hash, token_lookup_hash=EXCLUDED.token_lookup_hash,
         expires_at=EXCLUDED.expires_at, datetime_updated=NOW()",
        id,
        hash,
        lookup,
        expires_at
    )
    .execute(pool)
    .await?;
    Ok(IdentityToken { token, expires_at })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn hashing_waits_with_bounded_queue_and_recovers_cancelled_admission() {
        let admission = Arc::new(HashAdmission::new(1, 1));
        let running = admission.acquire(WaitDuration::from_secs(1)).await.unwrap();
        let waiting = admission.clone();
        let task = tokio::spawn(async move { waiting.acquire(WaitDuration::from_secs(1)).await });
        while admission.outstanding.available_permits() != 0 {
            tokio::task::yield_now().await;
        }
        assert!(matches!(
            admission.acquire(WaitDuration::from_secs(1)).await,
            Err(HashOverload::QueueFull)
        ));
        task.abort();
        assert!(task.await.unwrap_err().is_cancelled());
        assert_eq!(admission.outstanding.available_permits(), 1);
        assert!(matches!(
            admission.acquire(WaitDuration::from_millis(1)).await,
            Err(HashOverload::WaitExpired)
        ));
        assert_eq!(admission.outstanding.available_permits(), 1);
        drop(running);
        assert!(admission.acquire(WaitDuration::from_secs(1)).await.is_ok());
    }

    #[tokio::test]
    async fn cancelled_request_does_not_release_a_running_hash_worker() {
        let admission = Arc::new(HashAdmission::new(1, 1));
        let permit = admission.acquire(WaitDuration::from_secs(1)).await.unwrap();
        let (started, ready) = tokio::sync::oneshot::channel();
        let (release, blocked) = std::sync::mpsc::channel();
        let work = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            let _ = started.send(());
            blocked.recv().unwrap();
        });
        ready.await.unwrap();
        work.abort();
        assert!(matches!(
            admission.acquire(WaitDuration::from_millis(1)).await,
            Err(HashOverload::WaitExpired)
        ));
        release.send(()).unwrap();
        work.await.unwrap();
        assert!(admission.acquire(WaitDuration::from_secs(1)).await.is_ok());
    }
}
