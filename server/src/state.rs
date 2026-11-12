//! The live tables' latest checkpoints, which PostgreSQL stores. One server owns them at a time.

use crate::{checkpoint::PartChanges, errors::Fault, store::LockSpace};
use anyhow::{Context, Result, ensure};
use axum::http::StatusCode;
use hanabi_protocol::TableId;
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
    pub id: TableId,
    pub revision: i64,
    /// The checkpoint's head; see `checkpoint`.
    pub payload: String,
    /// The checkpoint's parts, by key.
    pub parts: Vec<(String, String)>,
}

/// Table IDs are positive and stay within the integers that clients represent exactly.
fn table_id(id: TableId) -> Result<i64> {
    i64::try_from(id.get())
        .ok()
        .filter(|id| (1..=hanabi_protocol::MAX_SAFE_INTEGER).contains(id))
        .context("Invalid table identity")
}

/// Saves a table's checkpoint head and the changes to its parts in a transaction from
/// `LiveState::begin`, if its revision is still `expected`. Returns the new revision.
pub async fn save_in(
    transaction: &mut Transaction<'static, Postgres>,
    id: TableId,
    expected: i64,
    payload: &str,
    parts: &PartChanges,
) -> Result<i64> {
    ensure!(
        (0..hanabi_protocol::MAX_SAFE_INTEGER).contains(&expected),
        "Invalid checkpoint revision"
    );
    ensure!(
        !payload.is_empty() && payload.len() <= MAX_CHECKPOINT_BYTES,
        "Invalid checkpoint size"
    );
    let id = table_id(id)?;
    let revision = sqlx::query_scalar!(
        "UPDATE live_tables SET revision = revision + 1, payload = $3
         WHERE id = $1 AND revision = $2 RETURNING revision",
        id,
        expected,
        payload
    )
    .fetch_optional(&mut **transaction)
    .await?
    .context("Stale live-table checkpoint revision")?;
    if !parts.removed.is_empty() {
        sqlx::query!(
            "DELETE FROM live_table_parts WHERE table_id = $1 AND part = ANY($2)",
            id,
            &parts.removed
        )
        .execute(&mut **transaction)
        .await?;
    }
    if !parts.written.is_empty() {
        let (keys, values): (Vec<&str>, Vec<&str>) = parts
            .written
            .iter()
            .map(|(key, value)| (key.as_str(), value.as_str()))
            .unzip();
        sqlx::query!(
            "INSERT INTO live_table_parts (table_id, part, value)
             SELECT $1, p.part, p.value FROM UNNEST($2::text[], $3::text[]) AS p(part, value)
             ON CONFLICT (table_id, part) DO UPDATE SET value = excluded.value",
            id,
            &keys as &[&str],
            &values as &[&str]
        )
        .execute(&mut **transaction)
        .await?;
    }
    Ok(revision)
}

/// Groups the rows of a query that joins each table's head to its parts, ordered by table, into
/// stored tables. Reading heads and parts in one statement sees one snapshot, so a table's parts
/// always belong to its head.
fn stored(
    rows: impl IntoIterator<Item = (i64, i64, String, Option<String>, Option<String>)>,
) -> Result<Vec<StoredState>> {
    let mut tables: Vec<StoredState> = Vec::new();
    for (id, revision, payload, part, value) in rows {
        let id = TableId::try_from(id)?;
        if tables.last().is_none_or(|table| table.id != id) {
            tables.push(StoredState {
                id,
                revision,
                payload,
                parts: Vec::new(),
            });
        }
        if let (Some(part), Some(value), Some(table)) = (part, value, tables.last_mut()) {
            table.parts.push((part, value));
        }
    }
    Ok(tables)
}

/// Removes a table in a transaction from `LiveState::begin`, if its revision is still `expected`.
/// A table that is already gone counts as removed.
pub async fn remove_in(
    transaction: &mut Transaction<'static, Postgres>,
    id: TableId,
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
struct OwnershipGuard(CancellationToken);
impl Drop for OwnershipGuard {
    fn drop(&mut self) {
        self.0.cancel();
    }
}

#[derive(Clone)]
pub struct LiveState {
    pool: PgPool,
    owner: Arc<Ownership>,
    tasks: TaskTracker,
    _ownership_guard: Arc<OwnershipGuard>,
}

impl LiveState {
    /// Takes ownership of the live tables. A dedicated connection holds a session advisory lock
    /// while the server runs. A server that loses that connection stops, so another can take over.
    /// Writes need no other fence: a second server cannot start beside a running one, because it
    /// cannot bind the same port, and a write from a stale revision fails.
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
        // Table IDs that an earlier owner reserved but never saved are unused. This server has
        // reserved none yet.
        sqlx::query!("DELETE FROM live_tables WHERE payload IS NULL")
            .execute(&mut lock)
            .await?;
        let owner = Arc::new(Ownership {
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
                    tracing::error!("The connection that holds live-table ownership failed.");
                    watchdog.lost.cancel();
                    break;
                }
            }
            // Closing the connection releases the advisory lock.
            let _ = lock.close().await;
        });
        let ownership_guard = Arc::new(OwnershipGuard(owner.lost.clone()));
        Ok(Self {
            pool,
            owner,
            tasks,
            _ownership_guard: ownership_guard,
        })
    }

    pub fn check(&self) -> Result<()> {
        self.owner.check()
    }
    pub fn lost(&self) -> CancellationToken {
        self.owner.lost.clone()
    }

    /// Begins a transaction for the live tables, while this server owns them.
    pub async fn begin(&self) -> Result<Transaction<'static, Postgres>> {
        self.check()?;
        Ok(self.pool.begin().await?)
    }

    /// Commits a transaction from `begin`. A failed commit may still have been applied, so the
    /// server stops admitting work.
    pub async fn commit(&self, transaction: Transaction<'static, Postgres>) -> Result<()> {
        if let Err(error) = transaction.commit().await {
            self.owner.lost.cancel();
            return Err(anyhow::Error::from(error).context(Fault::new(
                hanabi_protocol::NoticeCode::PersistenceUncertain,
                "The live-state write may have been saved, but the database could not confirm it. Do not repeat game actions; wait for recovery.",
                StatusCode::SERVICE_UNAVAILABLE,
            )));
        }
        self.check()
    }

    #[cfg(test)]
    pub async fn save(
        &self,
        id: TableId,
        expected: i64,
        payload: &str,
        parts: &PartChanges,
    ) -> Result<i64> {
        let mut transaction = self.begin().await?;
        let revision = save_in(&mut transaction, id, expected, payload, parts).await?;
        self.commit(transaction).await?;
        Ok(revision)
    }

    /// Reserves a new table ID. IDs are never reused.
    pub async fn allocate_table(&self) -> Result<TableId> {
        let mut transaction = self.begin().await?;
        let id = sqlx::query_scalar!(
            "INSERT INTO live_tables (id, revision, payload)
             VALUES (nextval('live_table_ids'), 0, NULL) RETURNING id"
        )
        .fetch_one(&mut *transaction)
        .await?;
        self.commit(transaction).await?;
        Ok(TableId::try_from(id)?)
    }

    pub async fn remove(&self, id: TableId, expected: i64) -> Result<()> {
        let mut transaction = self.begin().await?;
        remove_in(&mut transaction, id, expected).await?;
        self.commit(transaction).await
    }

    #[cfg(test)]
    pub async fn get(&self, id: TableId) -> Result<Option<StoredState>> {
        self.check()?;
        let rows = sqlx::query!(
            r#"SELECT t.id, t.revision, t.payload, p.part AS "part?", p.value AS "value?"
               FROM live_tables t LEFT JOIN live_table_parts p ON p.table_id = t.id
               WHERE t.id = $1"#,
            table_id(id)?
        )
        .fetch_all(&self.pool)
        .await?;
        self.check()?;
        Ok(stored(rows.into_iter().map(|row| {
            (
                row.id,
                row.revision,
                row.payload.unwrap_or_default(),
                row.part,
                row.value,
            )
        }))?
        .pop())
    }

    /// The saved tables.
    pub async fn load(&self) -> Result<Vec<StoredState>> {
        let mut transaction = self.begin().await?;
        let rows = sqlx::query!(
            r#"SELECT t.id, t.revision, t.payload AS "payload!", p.part AS "part?",
                      p.value AS "value?"
               FROM live_tables t LEFT JOIN live_table_parts p ON p.table_id = t.id
               WHERE t.payload IS NOT NULL ORDER BY t.id"#
        )
        .fetch_all(&mut *transaction)
        .await?;
        self.commit(transaction).await?;
        stored(
            rows.into_iter()
                .map(|row| (row.id, row.revision, row.payload, row.part, row.value)),
        )
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
        ensure!(
            state
                .save(id, 0, "initial", &PartChanges::default())
                .await?
                == 1
        );
        let none = PartChanges::default();
        let (one, two) = tokio::join!(
            state.save(id, 1, "one", &none),
            state.save(id, 1, "two", &none)
        );
        ensure!(one.is_ok() != two.is_ok(), "Two stale writers succeeded");
        let saved = state.get(id).await?.context("Missing table")?;
        ensure!(saved.revision == 2 && ["one", "two"].contains(&saved.payload.as_str()));
        ensure!(
            state.remove(id, 1).await.is_err(),
            "Removed a stale revision"
        );
        state.remove(id, 2).await?;
        ensure!(
            state
                .save(id, 0, "resurrected", &PartChanges::default())
                .await
                .is_err(),
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
        first.save(id, 0, "first", &PartChanges::default()).await?;
        first.close().await?;
        ensure!(
            first
                .save(id, 1, "closed", &PartChanges::default())
                .await
                .is_err()
        );
        let second = LiveState::for_test(&db.pool).await?;
        ensure!(second.get(id).await?.context("Missing table")?.payload == "first");
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
        first
            .save(saved, 0, "saved", &PartChanges::default())
            .await?;
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
