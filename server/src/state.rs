//! The live tables' latest checkpoints, which PostgreSQL stores. One server owns them at a time.

use crate::{errors::Fault, store::LockSpace};
use anyhow::{Context, Result, bail, ensure};
use axum::http::StatusCode;
use sqlx::{Connection, PgConnection, PgPool, Postgres, Transaction, postgres::PgConnectOptions};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio_util::{sync::CancellationToken, task::TaskTracker};

/// The largest checkpoint payload, in bytes.
pub const MAX_CHECKPOINT_BYTES: usize = 4 * crate::MIB;
/// How long startup waits for another server to release ownership.
const ACQUISITION_TIMEOUT: Duration = Duration::from_secs(10);
/// How long to wait between attempts to take ownership.
const ACQUISITION_RETRY: Duration = Duration::from_millis(100);
/// How often the watchdog checks the connection that holds ownership.
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(1);
/// How long the watchdog's check may take before ownership counts as lost.
const WATCHDOG_TIMEOUT: Duration = Duration::from_secs(5);

pub struct StoredState {
    pub id: u64,
    pub revision: i64,
    pub payload: String,
}

/// Table IDs are positive and stay within the integers that clients represent exactly.
fn table_id(id: u64) -> Result<i64> {
    i64::try_from(id)
        .ok()
        .filter(|id| (1..=hanabi_protocol::MAX_SAFE_INTEGER).contains(id))
        .context("Invalid table identity")
}

/// Saves a table's checkpoint in a transaction from `LiveState::begin`, if its revision is still
/// `expected`. Returns the new revision.
pub async fn save_in(
    transaction: &mut Transaction<'static, Postgres>,
    id: u64,
    expected: i64,
    payload: &str,
) -> Result<i64> {
    ensure!(
        (0..hanabi_protocol::MAX_SAFE_INTEGER).contains(&expected),
        "Invalid checkpoint revision"
    );
    ensure!(
        !payload.is_empty() && payload.len() <= MAX_CHECKPOINT_BYTES,
        "Invalid checkpoint size"
    );
    sqlx::query_scalar!(
        "UPDATE live_tables SET revision = revision + 1, payload = $3
         WHERE id = $1 AND revision = $2 RETURNING revision",
        table_id(id)?,
        expected,
        payload
    )
    .fetch_optional(&mut **transaction)
    .await?
    .context("Stale live-table checkpoint revision")
}

/// Removes a table in a transaction from `LiveState::begin`, if its revision is still `expected`.
/// A table that is already gone counts as removed.
pub async fn remove_in(
    transaction: &mut Transaction<'static, Postgres>,
    id: u64,
    expected: i64,
) -> Result<()> {
    ensure!(expected >= 0, "Invalid removal revision");
    let id = table_id(id)?;
    let removed = sqlx::query!(
        "DELETE FROM live_tables WHERE id = $1 AND revision = $2",
        id,
        expected
    )
    .execute(&mut **transaction)
    .await?
    .rows_affected();
    if removed == 0 {
        let exists = sqlx::query_scalar!("SELECT revision FROM live_tables WHERE id = $1", id)
            .fetch_optional(&mut **transaction)
            .await?;
        ensure!(exists.is_none(), "Stale live-table checkpoint revision");
    }
    Ok(())
}

struct Ownership {
    /// This server's ownership epoch. Writes commit only while it is current.
    epoch: i64,
    lost: CancellationToken,
}
impl Ownership {
    fn check(&self) -> Result<()> {
        ensure!(
            !self.lost.is_cancelled(),
            "Live-table ownership is unavailable; stop admission and recover"
        );
        Ok(())
    }
}
struct LeaseGuard(CancellationToken);
impl Drop for LeaseGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

#[derive(Clone)]
pub struct LiveState {
    pool: PgPool,
    owner: Arc<Ownership>,
    tasks: TaskTracker,
    _lease_guard: Arc<LeaseGuard>,
}

impl LiveState {
    /// Takes ownership of the live tables. A dedicated connection holds a session advisory lock
    /// while the server runs, and the ownership epoch fences writes from any earlier owner.
    pub async fn connect(pool: PgPool, options: &PgConnectOptions) -> Result<Self> {
        Self::connect_within(pool, options, ACQUISITION_TIMEOUT).await
    }

    async fn connect_within(
        pool: PgPool,
        options: &PgConnectOptions,
        acquisition: Duration,
    ) -> Result<Self> {
        let mut lock = PgConnection::connect_with(options).await?;
        let started = Instant::now();
        loop {
            let acquired = sqlx::query_scalar!(
                "SELECT pg_try_advisory_lock($1, 0) AS \"acquired!\"",
                LockSpace::LiveState as i32
            )
            .fetch_one(&mut lock)
            .await?;
            if acquired {
                break;
            }
            ensure!(
                started.elapsed() < acquisition,
                "Another server owns the live tables in this database"
            );
            tokio::time::sleep(ACQUISITION_RETRY).await;
        }
        // This waits for any write that an earlier owner has in progress.
        let epoch =
            sqlx::query_scalar!("UPDATE live_state_owner SET epoch = epoch + 1 RETURNING epoch")
                .fetch_one(&mut lock)
                .await?;
        let owner = Arc::new(Ownership {
            epoch,
            lost: CancellationToken::new(),
        });
        let tasks = TaskTracker::new();
        let watchdog = owner.clone();
        tasks.spawn(async move {
            loop {
                tokio::select! {
                    () = watchdog.lost.cancelled() => break,
                    () = tokio::time::sleep(WATCHDOG_INTERVAL) => {}
                }
                let alive = tokio::time::timeout(WATCHDOG_TIMEOUT, lock.ping()).await;
                if !matches!(alive, Ok(Ok(()))) {
                    eprintln!("The connection that holds live-table ownership failed.");
                    watchdog.lost.cancel();
                    break;
                }
            }
            // Closing the connection releases the advisory lock.
            let _ = lock.close().await;
        });
        let lease_guard = Arc::new(LeaseGuard(owner.lost.clone()));
        Ok(Self {
            pool,
            owner,
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

    /// Begins a transaction that commits only while this server owns the live tables. Locking the
    /// epoch makes a new owner wait for this transaction before it reads the tables.
    pub async fn begin(&self) -> Result<Transaction<'static, Postgres>> {
        self.check()?;
        let mut transaction = self.pool.begin().await?;
        let epoch = sqlx::query_scalar!("SELECT epoch FROM live_state_owner FOR SHARE")
            .fetch_one(&mut *transaction)
            .await?;
        if epoch != self.owner.epoch {
            self.owner.lost.cancel();
            bail!("Another server took ownership of the live tables; stop admission and recover");
        }
        Ok(transaction)
    }

    /// Commits a transaction from `begin`. A failed commit may still have been applied, so the
    /// server stops admitting work.
    pub async fn commit(&self, transaction: Transaction<'static, Postgres>) -> Result<()> {
        if let Err(error) = transaction.commit().await {
            self.owner.lost.cancel();
            return Err(anyhow::Error::from(error).context(Fault::new(
                "persistence_uncertain",
                "The live-state write may have been saved, but the database could not confirm it. Do not repeat game actions; wait for recovery.",
                StatusCode::SERVICE_UNAVAILABLE,
            )));
        }
        self.check()
    }

    pub async fn save(&self, id: u64, expected: i64, payload: &str) -> Result<i64> {
        let mut transaction = self.begin().await?;
        let revision = save_in(&mut transaction, id, expected, payload).await?;
        self.commit(transaction).await?;
        Ok(revision)
    }

    /// Reserves a table ID that was allocated earlier, such as the destination of a split.
    pub async fn reserve(&self, id: u64) -> Result<()> {
        let id = table_id(id)?;
        let mut transaction = self.begin().await?;
        sqlx::query_scalar!(
            "INSERT INTO live_tables (id, revision, payload, epoch) VALUES ($1, 0, NULL, $2)
             ON CONFLICT DO NOTHING RETURNING id",
            id,
            self.owner.epoch
        )
        .fetch_optional(&mut *transaction)
        .await?
        .context("The live table already exists")?;
        self.commit(transaction).await
    }

    /// Reserves a new table ID. IDs are never reused.
    pub async fn allocate_table(&self) -> Result<u64> {
        let mut transaction = self.begin().await?;
        let id = sqlx::query_scalar!(
            "INSERT INTO live_tables (id, revision, payload, epoch)
             VALUES (nextval('live_table_ids'), 0, NULL, $1) RETURNING id",
            self.owner.epoch
        )
        .fetch_one(&mut *transaction)
        .await?;
        self.commit(transaction).await?;
        Ok(id.cast_unsigned())
    }

    pub async fn remove(&self, id: u64, expected: i64) -> Result<()> {
        let mut transaction = self.begin().await?;
        remove_in(&mut transaction, id, expected).await?;
        self.commit(transaction).await
    }

    pub async fn get(&self, id: u64) -> Result<Option<StoredState>> {
        self.check()?;
        let row = sqlx::query!(
            "SELECT revision, payload FROM live_tables WHERE id = $1",
            table_id(id)?
        )
        .fetch_optional(&self.pool)
        .await?;
        self.check()?;
        Ok(row.map(|row| StoredState {
            id,
            revision: row.revision,
            payload: row.payload.unwrap_or_default(),
        }))
    }

    /// The saved tables. Reservations that an earlier owner left unused are removed.
    pub async fn load(&self) -> Result<Vec<StoredState>> {
        let mut transaction = self.begin().await?;
        sqlx::query!(
            "DELETE FROM live_tables WHERE revision = 0 AND epoch <> $1",
            self.owner.epoch
        )
        .execute(&mut *transaction)
        .await?;
        let rows = sqlx::query!(
            "SELECT id, revision, payload AS \"payload!\" FROM live_tables
             WHERE revision > 0 ORDER BY id"
        )
        .fetch_all(&mut *transaction)
        .await?;
        self.commit(transaction).await?;
        Ok(rows
            .into_iter()
            .map(|row| StoredState {
                id: row.id.cast_unsigned(),
                revision: row.revision,
                payload: row.payload,
            })
            .collect())
    }

    /// Takes ownership of a test database's live tables.
    #[cfg(test)]
    pub(crate) async fn for_test(pool: &PgPool) -> Result<Self> {
        Self::connect(pool.clone(), &pool.connect_options()).await
    }

    /// Releases ownership.
    pub async fn close(&self) -> Result<()> {
        self.owner.lost.cancel();
        self.tasks.close();
        self.tasks.wait().await;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::accounts::test_support::TestDb;

    /// Ends the connection that holds a server's ownership, as a network failure would.
    async fn drop_ownership_connection(pool: &PgPool) -> Result<()> {
        let ended = sqlx::query_scalar!(
            "SELECT pg_terminate_backend(pid) AS \"ended!\" FROM pg_locks
             WHERE locktype = 'advisory' AND classid = $1 AND granted
             AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
            LockSpace::LiveState as i32
        )
        .fetch_all(pool)
        .await?;
        ensure!(ended == [true], "Expected one ownership connection");
        Ok(())
    }

    #[tokio::test]
    async fn revisions_fence_concurrent_writers_and_ids_are_not_reused() -> Result<()> {
        let Some(db) = TestDb::create().await else {
            return Ok(());
        };
        let state = LiveState::for_test(&db.pool).await?;
        let id = state.allocate_table().await?;
        ensure!(state.save(id, 0, "initial").await? == 1);
        let (one, two) = tokio::join!(state.save(id, 1, "one"), state.save(id, 1, "two"));
        ensure!(one.is_ok() != two.is_ok(), "Two stale writers succeeded");
        let saved = state.get(id).await?.context("Missing table")?;
        ensure!(saved.revision == 2 && ["one", "two"].contains(&saved.payload.as_str()));
        ensure!(
            state.remove(id, 1).await.is_err(),
            "Removed a stale revision"
        );
        state.remove(id, 2).await?;
        ensure!(
            state.save(id, 0, "resurrected").await.is_err(),
            "A removed table was saved again"
        );
        ensure!(state.load().await?.is_empty(), "A removed table was loaded");
        ensure!(state.allocate_table().await? > id, "A table ID was reused");
        state.close().await?;
        db.close().await;
        Ok(())
    }

    #[tokio::test]
    async fn one_server_owns_the_live_tables_at_a_time() -> Result<()> {
        let Some(db) = TestDb::create().await else {
            return Ok(());
        };
        let first = LiveState::for_test(&db.pool).await?;
        let options = db.pool.connect_options();
        ensure!(
            LiveState::connect_within(db.pool.clone(), &options, Duration::ZERO)
                .await
                .is_err(),
            "A second server took ownership while the first ran"
        );
        let id = first.allocate_table().await?;
        first.save(id, 0, "first").await?;
        first.close().await?;
        ensure!(first.save(id, 1, "closed").await.is_err());
        let second = LiveState::for_test(&db.pool).await?;
        ensure!(second.get(id).await?.context("Missing table")?.payload == "first");
        second.close().await?;
        db.close().await;
        Ok(())
    }

    #[tokio::test]
    async fn a_replaced_owner_cannot_write_and_learns_that_it_lost_ownership() -> Result<()> {
        let Some(db) = TestDb::create().await else {
            return Ok(());
        };
        let first = LiveState::for_test(&db.pool).await?;
        let id = first.allocate_table().await?;
        first.save(id, 0, "first").await?;
        drop_ownership_connection(&db.pool).await?;
        let second = LiveState::for_test(&db.pool).await?;
        ensure!(
            first.save(id, 1, "stale").await.is_err(),
            "A replaced owner saved a table"
        );
        ensure!(
            first.lost().is_cancelled(),
            "A replaced owner kept admitting work"
        );
        ensure!(second.get(id).await?.context("Missing table")?.payload == "first");
        second.save(id, 1, "second").await?;
        second.close().await?;
        db.close().await;
        Ok(())
    }

    #[tokio::test]
    async fn the_watchdog_notices_a_failed_ownership_connection() -> Result<()> {
        let Some(db) = TestDb::create().await else {
            return Ok(());
        };
        let state = LiveState::for_test(&db.pool).await?;
        drop_ownership_connection(&db.pool).await?;
        tokio::time::timeout(
            WATCHDOG_INTERVAL + WATCHDOG_TIMEOUT,
            state.lost().cancelled(),
        )
        .await
        .context("The watchdog did not notice the failed connection")?;
        ensure!(state.check().is_err());
        db.close().await;
        Ok(())
    }

    #[tokio::test]
    async fn new_owners_remove_unused_reservations_of_earlier_ones() -> Result<()> {
        let Some(db) = TestDb::create().await else {
            return Ok(());
        };
        let first = LiveState::for_test(&db.pool).await?;
        let unused = first.allocate_table().await?;
        let saved = first.allocate_table().await?;
        first.save(saved, 0, "saved").await?;
        first.close().await?;
        let second = LiveState::for_test(&db.pool).await?;
        let own = second.allocate_table().await?;
        let loaded = second.load().await?;
        ensure!(
            loaded.len() == 1 && loaded[0].id == saved,
            "Wrong saved tables"
        );
        ensure!(
            second.get(unused).await?.is_none(),
            "An unused reservation remained"
        );
        ensure!(
            second
                .get(own)
                .await?
                .is_some_and(|table| table.revision == 0),
            "The current owner lost its reservation"
        );
        second.close().await?;
        db.close().await;
        Ok(())
    }
}
