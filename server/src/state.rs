use anyhow::{Context, Result, bail, ensure};
use redis::{Script, aio::MultiplexedConnection};
use std::{
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, Instant},
};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// The largest checkpoint payload, in bytes.
pub const MAX_CHECKPOINT_BYTES: usize = 4 * 1024 * 1024;
const MAX_RECORDS: usize = 4096;
const RESPONSE_TIMEOUT: Duration = Duration::from_secs(30);
const LEASE_TIME: Duration = Duration::from_secs(5);
/// The shortest lease that ownership accepts.
const MIN_LEASE_TIME: Duration = Duration::from_millis(100);
/// How long startup waits for another server to release ownership.
const ACQUISITION_TIMEOUT: Duration = Duration::from_secs(10);
/// How long to wait between attempts to take ownership.
const ACQUISITION_RETRY: Duration = Duration::from_millis(25);
/// The percentage of a lease during which ownership is trusted, leaving the rest as a margin.
const SAFE_LEASE_PERCENT: u64 = 75;
/// How many times ownership is renewed per lease.
const RENEWALS_PER_LEASE: u32 = 5;
/// How often the watchdog checks that ownership is still trusted.
const WATCHDOG_INTERVAL: Duration = Duration::from_millis(10);
/// The longest state namespace, in bytes.
const MAX_NAMESPACE_LENGTH: usize = 1024;

const RESERVE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -2 end
if redis.call('EXISTS', KEYS[2]) ~= 0 then return -1 end
if redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[3]) then return -3 end
redis.call('HSET', KEYS[2], 'revision', 0, 'payload', '', 'creator', ARGV[1])
redis.call('SADD', KEYS[3], ARGV[2])
return 0
";

const ALLOCATE_TABLE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -2 end
if redis.call('SCARD', KEYS[3]) >= tonumber(ARGV[2]) then return -3 end
local current = redis.call('GET', KEYS[4])
if current and tonumber(current) >= tonumber(ARGV[3]) then return -3 end
local id = redis.call('INCR', KEYS[4])
local member = 't:' .. redis.call('GET', KEYS[4])
local key = KEYS[2] .. member
if redis.call('EXISTS', key) ~= 0 then return -3 end
redis.call('HSET', key, 'revision', 0, 'payload', '', 'creator', ARGV[1])
redis.call('SADD', KEYS[3], member)
return id
";

const SAVE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -2 end
local current = redis.call('HGET', KEYS[2], 'revision')
local expected = tonumber(ARGV[2])
if current == false or tonumber(current) ~= expected then return -1 end
if redis.call('SISMEMBER', KEYS[3], ARGV[4]) ~= 1 then return -3 end
local next = expected + 1
redis.call('HSET', KEYS[2], 'revision', next, 'payload', ARGV[3])
redis.call('SADD', KEYS[3], ARGV[4])
return next
";
const REMOVE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return -2 end
local current = redis.call('HGET', KEYS[2], 'revision')
if current == false then
  if redis.call('SISMEMBER', KEYS[3], ARGV[3]) ~= 0 then return -3 end
  return 0
end
if tonumber(current) ~= tonumber(ARGV[2]) then return -1 end
redis.call('DEL', KEYS[2])
redis.call('SREM', KEYS[3], ARGV[3])
return 1
";
const READ: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return redis.error_reply('STATE_LEASE_LOST') end
if redis.call('HSTRLEN', KEYS[2], 'payload') > tonumber(ARGV[2]) then return redis.error_reply('STATE_TOO_LARGE') end
return redis.call('HMGET', KEYS[2], 'revision', 'payload', 'creator')
";
const LOAD_INDEX: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return redis.error_reply('STATE_LEASE_LOST') end
if redis.call('SCARD', KEYS[2]) > tonumber(ARGV[2]) then return redis.error_reply('STATE_INDEX_TOO_LARGE') end
return redis.call('SMEMBERS', KEYS[2])
";
const RENEW: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('PEXPIRE', KEYS[1], ARGV[2])
";
const RELEASE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StateId {
    Game(i32),
    Table(u64),
}
impl StateId {
    fn member(self) -> Result<String> {
        match self {
            Self::Game(id) => {
                ensure!(id > 0, "Invalid game identity");
                Ok(format!("g:{id}"))
            }
            Self::Table(id) => {
                ensure!(
                    (1..=hanabi_protocol::MAX_SAFE_INTEGER.unsigned_abs()).contains(&id),
                    "Invalid table identity"
                );
                Ok(format!("t:{id}"))
            }
        }
    }
    fn parse(value: &str) -> Result<Self> {
        let (kind, id) = value
            .split_once(':')
            .context("Invalid Redis state identity")?;
        let parsed = match kind {
            "g" => Self::Game(id.parse()?),
            "t" => Self::Table(id.parse()?),
            _ => bail!("Unknown Redis state identity"),
        };
        ensure!(
            parsed.member()? == value,
            "Non-canonical Redis state identity"
        );
        Ok(parsed)
    }
}

pub struct StoredState {
    pub id: StateId,
    pub revision: i64,
    pub payload: String,
    creator: String,
}

struct Ownership {
    token: String,
    key: String,
    start: Instant,
    deadline: AtomicU64,
    lost: CancellationToken,
}
struct LeaseGuard(CancellationToken);
impl Drop for LeaseGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
impl Ownership {
    fn elapsed(&self) -> u64 {
        u64::try_from(self.start.elapsed().as_millis()).unwrap_or(u64::MAX)
    }
    fn check(&self) -> Result<()> {
        if self.lost.is_cancelled() || self.elapsed() >= self.deadline.load(Ordering::Acquire) {
            self.lost.cancel();
            bail!("Redis state ownership is unavailable; stop admission and recover");
        }
        Ok(())
    }
}

#[derive(Clone)]
pub struct RedisState {
    connection: MultiplexedConnection,
    owner: Arc<Ownership>,
    prefix: String,
    tasks: TaskTracker,
    _lease_guard: Arc<LeaseGuard>,
}

async fn durable(connection: &mut MultiplexedConnection) -> Result<()> {
    // WAITAOF must use the same physical connection as the preceding write.
    let (local, _replicas): (i64, i64) = redis::cmd("WAITAOF")
        .arg(1)
        .arg(0)
        .arg(u64::try_from(RESPONSE_TIMEOUT.as_millis())?)
        .query_async(connection)
        .await?;
    ensure!(local >= 1, "Redis did not confirm local AOF durability");
    Ok(())
}

impl RedisState {
    pub async fn connect(url: &str, namespace: &str) -> Result<Self> {
        Self::connect_timed(url, namespace, LEASE_TIME, ACQUISITION_TIMEOUT).await
    }
}

impl RedisState {
    async fn connect_timed(
        url: &str,
        namespace: &str,
        lease_time: Duration,
        acquisition: Duration,
    ) -> Result<Self> {
        ensure!(
            !namespace.is_empty() && namespace.len() <= MAX_NAMESPACE_LENGTH,
            "Invalid Redis namespace"
        );
        let client = redis::Client::open(url).map_err(|_| anyhow::anyhow!("Invalid REDIS_URL"))?;
        let config = redis::AsyncConnectionConfig::new()
            .set_connection_timeout(Some(RESPONSE_TIMEOUT))
            .set_response_timeout(Some(RESPONSE_TIMEOUT));
        // Deliberately no ConnectionManager: reconnecting between EVAL and WAITAOF would
        // lose the write offset that WAITAOF is supposed to acknowledge.
        let mut connection = client
            .get_multiplexed_async_connection_with_config(&config)
            .await?;
        let mut renewal = client
            .get_multiplexed_async_connection_with_config(&config)
            .await?;
        redis::cmd("CLIENT")
            .arg("SETNAME")
            .arg("hanabi-state")
            .query_async::<String>(&mut connection)
            .await?;
        redis::cmd("CLIENT")
            .arg("SETNAME")
            .arg("hanabi-lease")
            .query_async::<String>(&mut renewal)
            .await?;
        let info: String = redis::cmd("INFO")
            .arg("persistence")
            .query_async(&mut connection)
            .await?;
        ensure!(
            info.lines().any(|line| line.trim() == "aof_enabled:1"),
            "Redis AOF must be enabled"
        );
        let memory: String = redis::cmd("INFO")
            .arg("memory")
            .query_async(&mut connection)
            .await?;
        ensure!(
            memory
                .lines()
                .any(|line| line.trim() == "maxmemory_policy:noeviction"),
            "Redis must use maxmemory-policy noeviction to preserve acknowledged state"
        );
        let encoded = hex::encode(namespace);
        let prefix = format!("hanabi:{{{encoded}}}");
        let key = format!("{prefix}:owner");
        let token = format!("{:032x}", rand::random::<u128>());
        let started = Instant::now();
        ensure!(lease_time >= MIN_LEASE_TIME, "Ownership interval too short");
        let lease_ms = u64::try_from(lease_time.as_millis())?;
        let safe_window = lease_ms * SAFE_LEASE_PERCENT / 100;
        let request_start;
        loop {
            let before = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
            let acquired: Option<String> = redis::cmd("SET")
                .arg(&key)
                .arg(&token)
                .arg("NX")
                .arg("PX")
                .arg(lease_ms)
                .query_async(&mut connection)
                .await?;
            if acquired.is_some() {
                request_start = before;
                break;
            }
            ensure!(
                started.elapsed() < acquisition,
                "Another server owns this Redis state namespace"
            );
            tokio::time::sleep(ACQUISITION_RETRY).await;
        }
        durable(&mut connection).await?;
        let owner = Arc::new(Ownership {
            token,
            key,
            start: started,
            deadline: AtomicU64::new(request_start + safe_window),
            lost: CancellationToken::new(),
        });
        owner.check()?;
        let tasks = TaskTracker::new();
        let renewing = owner.clone();
        tasks.spawn(async move {
            loop {
                tokio::select! {
                    () = renewing.lost.cancelled() => break,
                    () = tokio::time::sleep(lease_time / RENEWALS_PER_LEASE) => {}
                }
                if renewing.check().is_err() {
                    break;
                }
                let before = renewing.elapsed();
                let refreshed = async {
                    let renewed: i64 = Script::new(RENEW)
                        .key(&renewing.key)
                        .arg(&renewing.token)
                        .arg(lease_ms)
                        .invoke_async(&mut renewal)
                        .await?;
                    ensure!(
                        renewed == 1,
                        "Redis ownership lease was replaced or expired"
                    );
                    durable(&mut renewal).await?;
                    ensure!(
                        renewing.elapsed() < before + safe_window,
                        "Ownership renewal arrived too late"
                    );
                    Ok::<(), anyhow::Error>(())
                };
                let result = tokio::select! {
                    () = renewing.lost.cancelled() => break,
                    result = refreshed => result,
                };
                if let Err(error) = result {
                    eprintln!("Redis ownership renewal failed: {error}");
                    renewing.lost.cancel();
                    break;
                }
                renewing
                    .deadline
                    .store(before + safe_window, Ordering::Release);
            }
        });
        let watchdog = owner.clone();
        tasks.spawn(async move {
            loop {
                tokio::select! {
                    () = watchdog.lost.cancelled() => break,
                    () = tokio::time::sleep(WATCHDOG_INTERVAL) => {
                        if watchdog.check().is_err() { break; }
                    }
                }
            }
        });
        let lease_guard = Arc::new(LeaseGuard(owner.lost.clone()));
        Ok(Self {
            connection,
            owner,
            prefix,
            tasks,
            _lease_guard: lease_guard,
        })
    }

    pub fn check(&self) -> Result<()> {
        self.owner.check()
    }
    pub fn lost(&self) -> CancellationToken {
        self.owner.lost.clone()
    }
    fn index(&self) -> String {
        format!("{}:states", self.prefix)
    }
    fn key(&self, id: StateId) -> Result<String> {
        Ok(format!("{}:state:{}", self.prefix, id.member()?))
    }

    async fn acknowledge(&self, connection: &mut MultiplexedConnection) -> Result<()> {
        if let Err(error) = durable(connection).await {
            self.owner.lost.cancel();
            return Err(error.context(crate::errors::Fault::new(
                "persistence_uncertain",
                "The live-state write may have been saved, but durability could not be confirmed. Do not repeat game actions; wait for recovery.",
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
            )));
        }
        self.check()
    }

    fn reply(&self, result: redis::RedisResult<i64>) -> Result<i64> {
        match result {
            Ok(-2) => {
                self.owner.lost.cancel();
                bail!("Redis state ownership was lost");
            }
            Ok(-1) => bail!("Stale Redis checkpoint revision"),
            Ok(-3) => bail!("Redis state capacity or index integrity failure"),
            Ok(value) => Ok(value),
            Err(error) => {
                self.owner.lost.cancel();
                Err(anyhow::Error::from(error).context(crate::errors::Fault::new(
                    "persistence_uncertain",
                    "The live-state operation may have completed without confirmation. Do not repeat game actions; wait for recovery.",
                    axum::http::StatusCode::SERVICE_UNAVAILABLE,
                )))
            }
        }
    }

    pub async fn save(&self, id: StateId, expected: i64, payload: &str) -> Result<i64> {
        self.check()?;
        ensure!(
            (0..hanabi_protocol::MAX_SAFE_INTEGER).contains(&expected),
            "Invalid checkpoint revision"
        );
        ensure!(
            !payload.is_empty() && payload.len() <= MAX_CHECKPOINT_BYTES,
            "Invalid checkpoint size"
        );
        let mut connection = self.connection.clone();
        let reply = Script::new(SAVE)
            .key(&self.owner.key)
            .key(self.key(id)?)
            .key(self.index())
            .arg(&self.owner.token)
            .arg(expected)
            .arg(payload)
            .arg(id.member()?)
            .arg(MAX_RECORDS)
            .invoke_async(&mut connection)
            .await;
        let revision = self.reply(reply)?;
        self.acknowledge(&mut connection).await?;
        Ok(revision)
    }

    pub async fn reserve(&self, id: StateId) -> Result<()> {
        self.check()?;
        let mut connection = self.connection.clone();
        let result = Script::new(RESERVE)
            .key(&self.owner.key)
            .key(self.key(id)?)
            .key(self.index())
            .arg(&self.owner.token)
            .arg(id.member()?)
            .arg(MAX_RECORDS)
            .invoke_async(&mut connection)
            .await;
        self.reply(result)?;
        self.acknowledge(&mut connection).await
    }

    pub async fn allocate_table(&self) -> Result<u64> {
        self.check()?;
        let mut connection = self.connection.clone();
        let result = Script::new(ALLOCATE_TABLE)
            .key(&self.owner.key)
            .key(format!("{}:state:", self.prefix))
            .key(self.index())
            .key(format!("{}:table-counter", self.prefix))
            .arg(&self.owner.token)
            .arg(MAX_RECORDS)
            .arg(hanabi_protocol::MAX_SAFE_INTEGER)
            .invoke_async(&mut connection)
            .await;
        let id = self.reply(result)?;
        ensure!(id > 0, "Invalid allocated table ID");
        self.acknowledge(&mut connection).await?;
        Ok(id.cast_unsigned())
    }

    pub async fn remove(&self, id: StateId, expected: i64) -> Result<()> {
        self.check()?;
        ensure!(expected >= 0, "Invalid removal revision");
        let mut connection = self.connection.clone();
        let result = Script::new(REMOVE)
            .key(&self.owner.key)
            .key(self.key(id)?)
            .key(self.index())
            .arg(&self.owner.token)
            .arg(expected)
            .arg(id.member()?)
            .invoke_async(&mut connection)
            .await;
        self.reply(result)?;
        self.acknowledge(&mut connection).await
    }

    pub async fn get(&self, id: StateId) -> Result<Option<StoredState>> {
        self.check()?;
        let mut connection = self.connection.clone();
        let result: redis::RedisResult<(Option<i64>, Option<String>, Option<String>)> =
            Script::new(READ)
                .key(&self.owner.key)
                .key(self.key(id)?)
                .arg(&self.owner.token)
                .arg(MAX_CHECKPOINT_BYTES)
                .invoke_async(&mut connection)
                .await;
        let (revision, payload, creator) = match result {
            Ok(result) => result,
            Err(error) => {
                self.owner.lost.cancel();
                return Err(error.into());
            }
        };
        self.check()?;
        match (revision, payload, creator) {
            (None, None, None) => Ok(None),
            (Some(revision), Some(payload), Some(creator)) => {
                ensure!(
                    revision >= 0
                        && (revision == 0) == payload.is_empty()
                        && payload.len() <= MAX_CHECKPOINT_BYTES
                        && !creator.is_empty(),
                    "Invalid stored Redis checkpoint"
                );
                Ok(Some(StoredState {
                    id,
                    revision,
                    payload,
                    creator,
                }))
            }
            _ => bail!("Incomplete Redis checkpoint"),
        }
    }

    pub async fn load(&self) -> Result<Vec<StoredState>> {
        self.check()?;
        let mut connection = self.connection.clone();
        let members: Vec<String> = Script::new(LOAD_INDEX)
            .key(&self.owner.key)
            .key(self.index())
            .arg(&self.owner.token)
            .arg(MAX_RECORDS)
            .invoke_async(&mut connection)
            .await
            .map_err(|error| {
                self.owner.lost.cancel();
                anyhow::Error::from(error).context("Failed to load the authoritative Redis index")
            })?;
        self.check()?;
        let mut states = Vec::with_capacity(members.len());
        for member in members {
            let id = StateId::parse(&member)?;
            let record = self
                .get(id)
                .await?
                .context("Redis state index references a missing checkpoint")?;
            if record.revision == 0 {
                if record.creator != self.owner.token {
                    self.remove(id, 0).await?;
                }
            } else {
                states.push(record);
            }
        }
        self.check()?;
        Ok(states)
    }

    pub async fn close(&self) -> Result<()> {
        self.owner.lost.cancel();
        self.tasks.close();
        self.tasks.wait().await;
        let mut connection = self.connection.clone();
        let removed: i64 = Script::new(RELEASE)
            .key(&self.owner.key)
            .arg(&self.owner.token)
            .invoke_async(&mut connection)
            .await?;
        if removed != 0 {
            durable(&mut connection).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_redis::RedisFixture;

    async fn connect(fixture: &RedisFixture, namespace: &str) -> Result<RedisState> {
        RedisState::connect_timed(
            &fixture.url,
            namespace,
            Duration::from_millis(500),
            Duration::from_secs(2),
        )
        .await
    }

    #[tokio::test]
    async fn durable_cas_survives_abrupt_redis_restart_without_resurrection() -> Result<()> {
        let mut fixture = RedisFixture::start(true).await?;
        let first = RedisState::connect(&fixture.url, "cas").await?;
        let id = StateId::Game(1);
        first.reserve(id).await?;
        ensure!(
            first.save(id, 0, "initial").await? == 1,
            "Wrong initial revision"
        );
        let (one, two) = tokio::join!(first.save(id, 1, "one"), first.save(id, 1, "two"));
        ensure!(one.is_ok() != two.is_ok(), "Two stale writers succeeded");
        let committed = first.get(id).await?.context("Missing state")?;
        ensure!(committed.revision == 2, "Wrong committed revision");
        fixture.kill()?;
        fixture.restart().await?;
        let recovered = RedisState::connect(&fixture.url, "cas").await?;
        // A brief scheduler stall must not invalidate this functional recovery test's lease.
        std::thread::sleep(Duration::from_millis(400));
        let restored = recovered
            .get(id)
            .await
            .context("Reading the recovered checkpoint after a scheduling stall")?
            .context("Lost durable state")?;
        ensure!(
            restored.payload == committed.payload && restored.revision == 2,
            "AOF recovery changed acknowledged state"
        );
        ensure!(
            first.save(id, 2, "stale process").await.is_err(),
            "Old process retained write authority"
        );
        recovered.remove(id, 2).await?;
        ensure!(
            recovered.save(id, 0, "resurrected").await.is_err(),
            "Removed state was resurrected"
        );
        ensure!(
            recovered.load().await?.is_empty(),
            "Removed state remained indexed"
        );
        recovered.close().await?;
        Ok(())
    }

    #[tokio::test]
    async fn ownership_replacement_fences_writes_and_old_owner_release() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let first = RedisState::connect(&fixture.url, "fence").await?;
        let id = StateId::Table(first.allocate_table().await?);
        first.save(id, 0, "owned").await?;
        // Replacement must reject a second owner even when polling is briefly delayed.
        std::thread::sleep(Duration::from_millis(650));
        first.check()?;
        let occupied =
            RedisState::connect_timed(&fixture.url, "fence", LEASE_TIME, Duration::ZERO).await;
        ensure!(occupied.is_err(), "Two owners acquired the same namespace");
        let mut control = redis::Client::open(fixture.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("DEL")
            .arg(&first.owner.key)
            .query_async::<i64>(&mut control)
            .await?;
        let second = RedisState::connect(&fixture.url, "fence").await?;
        ensure!(
            first.save(id, 1, "old owner").await.is_err(),
            "Missing ownership fence"
        );
        first.close().await?;
        ensure!(
            second.save(id, 1, "new owner").await? == 2,
            "Old close removed the current lease"
        );
        second.close().await?;
        Ok(())
    }

    #[tokio::test]
    async fn volatile_redis_is_rejected_and_durability_loss_closes_admission() -> Result<()> {
        let volatile = RedisFixture::start(false).await?;
        ensure!(
            connect(&volatile, "volatile").await.is_err(),
            "Volatile Redis accepted"
        );
        let fixture = RedisFixture::start(true).await?;
        let mut control = redis::Client::open(fixture.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("CONFIG")
            .arg("SET")
            .arg("maxmemory-policy")
            .arg("allkeys-lru")
            .query_async::<String>(&mut control)
            .await?;
        ensure!(
            connect(&fixture, "eviction").await.is_err(),
            "Evictable state was accepted"
        );
        redis::cmd("CONFIG")
            .arg("SET")
            .arg("maxmemory-policy")
            .arg("noeviction")
            .query_async::<String>(&mut control)
            .await?;
        let state = connect(&fixture, "durability").await?;
        let id = StateId::Game(1);
        state.reserve(id).await?;
        redis::cmd("CONFIG")
            .arg("SET")
            .arg("appendonly")
            .arg("no")
            .query_async::<String>(&mut control)
            .await?;
        ensure!(
            state.save(id, 0, "not acknowledged").await.is_err(),
            "Write without AOF was acknowledged"
        );
        ensure!(
            state.check().is_err(),
            "Admission remained open after uncertain durability"
        );
        Ok(())
    }

    #[tokio::test]
    async fn watchdog_expires_authority_even_while_redis_is_unresponsive() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let state = connect(&fixture, "watchdog").await?;
        let mut control = redis::Client::open(fixture.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("CLIENT")
            .arg("PAUSE")
            .arg("1000")
            .arg("ALL")
            .query_async::<String>(&mut control)
            .await?;
        tokio::time::timeout(Duration::from_secs(2), state.lost().cancelled()).await?;
        ensure!(state.check().is_err(), "Expired owner remained active");
        Ok(())
    }

    #[tokio::test]
    async fn unused_reservations_recover_but_corrupt_indexes_do_not_look_empty() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let first = connect(&fixture, "recovery").await?;
        first.reserve(StateId::Game(1)).await?;
        first.close().await?;
        let second = connect(&fixture, "recovery").await?;
        ensure!(
            second.load().await?.is_empty(),
            "Unacknowledged reservation became a game"
        );
        let mut control = redis::Client::open(fixture.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("SADD")
            .arg(second.index())
            .arg("g:2")
            .query_async::<i64>(&mut control)
            .await?;
        ensure!(
            second.load().await.is_err(),
            "Corrupt index was silently discarded"
        );
        second.close().await?;
        Ok(())
    }

    #[tokio::test]
    async fn table_ids_are_durable_and_not_reused_after_state_removal() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let first = connect(&fixture, "identities").await?;
        let (left, right) = tokio::try_join!(first.allocate_table(), first.allocate_table())?;
        ensure!(
            left != right,
            "Concurrent allocations reused a table identity"
        );
        let revision = first.save(StateId::Table(left), 0, "table").await?;
        first.remove(StateId::Table(left), revision).await?;
        first.close().await?;
        let second = connect(&fixture, "identities").await?;
        ensure!(
            second.load().await?.is_empty(),
            "Unused reservation was restored as a table"
        );
        ensure!(
            second.allocate_table().await? > left.max(right),
            "Retired table identity was reused"
        );
        second.close().await?;
        Ok(())
    }

    #[tokio::test]
    async fn dropping_the_last_handle_stops_lease_renewal() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let first = connect(&fixture, "drop").await?;
        let lost = first.lost();
        let clone = first.clone();
        drop(first);
        ensure!(
            !lost.is_cancelled(),
            "Dropping one handle stopped a shared owner"
        );
        drop(clone);
        ensure!(lost.is_cancelled(), "Unowned background renewal leaked");
        let second = connect(&fixture, "drop").await?;
        second.close().await?;
        Ok(())
    }

    #[tokio::test]
    async fn publication_guard_expires_before_the_watchdog_can_run_after_a_runtime_stall()
    -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let state = connect(&fixture, "stalled-runtime").await?;
        // The current-thread runtime cannot poll the watchdog during this stall.
        std::thread::sleep(Duration::from_millis(650));
        ensure!(
            !state.lost().is_cancelled(),
            "Watchdog unexpectedly ran while blocked"
        );
        ensure!(
            state.check().is_err(),
            "Publication remained authorized after the lease expired"
        );
        ensure!(
            state.lost().is_cancelled(),
            "Expired publication did not close admission"
        );
        Ok(())
    }

    #[tokio::test]
    async fn an_empty_recovery_index_does_not_bypass_the_ownership_fence() -> Result<()> {
        let fixture = RedisFixture::start(true).await?;
        let first = connect(&fixture, "empty-index").await?;
        let mut control = redis::Client::open(fixture.url.as_str())?
            .get_multiplexed_async_connection()
            .await?;
        redis::cmd("DEL")
            .arg(&first.owner.key)
            .query_async::<i64>(&mut control)
            .await?;
        let second = connect(&fixture, "empty-index").await?;
        ensure!(
            first.load().await.is_err(),
            "Empty recovery authorized a replaced owner"
        );
        first.close().await?;
        ensure!(
            second.load().await?.is_empty(),
            "Current empty state failed recovery"
        );
        second.close().await?;
        Ok(())
    }
}
