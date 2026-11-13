use crate::{
    checkpoint::{PartChanges, SavedParts},
    model::{PendingTag, Player, Snapshot, TableChat, TableSnapshot, Tag, TagEdit},
    state::LiveState,
};
use anyhow::{Context, Result, bail, ensure};
use hanabi_protocol::ChatSource;
use hanabi_protocol::GameId;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
#[cfg(test)]
use serde_json::{Value, json};

use sqlx::{
    PgPool, Postgres, Transaction,
    postgres::{PgConnectOptions, PgPoolOptions},
};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Clone)]
pub struct Store {
    /// The pool for writes, and for reads that must see them: gameplay, live tables, archived
    /// games, and statistics.
    pub primary: PgPool,
    /// The read-only pool for the lobby's statistics and history and the public pages.
    pub lobby_reads: PgPool,
    primary_name: String,
    lobby_name: String,
    state: LiveState,
    stats: TaskTracker,
    stats_slots: Arc<Semaphore>,
    /// Bounds the statistics refreshes that run at once, so they cannot take every connection.
    stats_running: Arc<Semaphore>,
}
/// How long the primary pool waits for a connection, a statement, or an idle transaction.
pub const DATABASE_TIMEOUT: Duration = Duration::from_secs(30);
/// How long the lobby read pool, which also serves the public pages, waits for a connection or a
/// statement.
pub const LOBBY_READ_TIMEOUT: Duration = Duration::from_secs(2);
/// Connections in the primary pool, besides the one that holds live-table ownership.
pub const PRIMARY_CONNECTIONS: u32 = 14;
/// Connections in the pool that serves lobby reads and the public pages.
pub const LOBBY_READ_CONNECTIONS: u32 = 2;
/// The most derived-statistics refreshes that can run or wait at once.
const STATS_SLOTS: usize = 32;
/// The most derived-statistics refreshes that run at once.
const STATS_RUNNING: usize = 2;

/// The namespaces of the transaction advisory locks that serialize writes of the same record.
#[derive(Clone, Copy)]
#[repr(i32)]
pub(crate) enum LockSpace {
    /// The players' statistics on a variant, by variant ID.
    VariantStats = 17483,
    /// Ownership of the live tables, held for as long as a server runs.
    LiveState = 17485,
}

/// Holds the advisory lock on `key` in `space` until the transaction ends.
pub(crate) async fn advisory_lock(
    connection: &mut sqlx::PgConnection,
    space: LockSpace,
    key: i32,
) -> Result<()> {
    sqlx::query!("SELECT pg_advisory_xact_lock($1,$2)", space as i32, key)
        .execute(connection)
        .await?;
    Ok(())
}

/// Opens a pool whose connections time out stuck statements and transactions.
async fn pool(options: PgConnectOptions, max: u32) -> Result<PgPool> {
    let timeout = DATABASE_TIMEOUT.as_millis();
    Ok(PgPoolOptions::new()
        .max_connections(max)
        .acquire_timeout(DATABASE_TIMEOUT)
        .connect_with(options.options([
            ("statement_timeout", timeout),
            ("idle_in_transaction_session_timeout", timeout),
        ]))
        .await?)
}

impl Store {
    #[cfg(test)]
    pub(crate) fn fixture(primary: PgPool, state: LiveState) -> Self {
        Self {
            lobby_reads: primary.clone(),
            primary,
            primary_name: String::new(),
            lobby_name: String::new(),
            state,
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(STATS_SLOTS)),
            stats_running: Arc::new(Semaphore::new(STATS_RUNNING)),
        }
    }
    pub async fn connect(config: &crate::config::Config) -> Result<Self> {
        let options = config.database_options();
        let instance = rand::random::<u64>();
        let primary_name = format!("hanabi-live-{instance:016x}-primary");
        let lobby_name = format!("hanabi-live-{instance:016x}-lobby");
        let ownership_name = format!("hanabi-live-{instance:016x}-ownership");
        let primary = pool(
            options.clone().application_name(&primary_name),
            PRIMARY_CONNECTIONS,
        )
        .await?;
        // Open every connection now, and keep them open. After a restart, players reconnect all at
        // once, and the first lobby reads would otherwise wait for the pool to connect.
        let lobby_reads = PgPoolOptions::new()
            .max_connections(LOBBY_READ_CONNECTIONS)
            .min_connections(LOBBY_READ_CONNECTIONS)
            .acquire_timeout(LOBBY_READ_TIMEOUT)
            .connect_with(options.clone().application_name(&lobby_name).options([
                (
                    "statement_timeout",
                    LOBBY_READ_TIMEOUT.as_millis().to_string(),
                ),
                ("default_transaction_read_only", "on".to_owned()),
            ]))
            .await?;
        crate::migrations::require_current(&mut *primary.acquire().await?).await?;
        let state =
            LiveState::connect(primary.clone(), &options.application_name(&ownership_name)).await?;
        Ok(Self {
            primary,
            lobby_reads,
            primary_name,
            lobby_name,
            state,
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(STATS_SLOTS)),
            stats_running: Arc::new(Semaphore::new(STATS_RUNNING)),
        })
    }
    pub fn check_state(&self) -> Result<()> {
        self.state.check()
    }
    pub async fn cancel_lobby_reads(&self) -> Result<()> {
        if self.lobby_name.is_empty() {
            return Ok(());
        }
        sqlx::query_scalar!(
            "SELECT pg_cancel_backend(pid) AS \"cancelled!\" FROM pg_stat_activity
             WHERE datname=current_database() AND application_name=$1
             AND backend_type='client backend' AND state='active' AND pid<>pg_backend_pid()",
            &self.lobby_name
        )
        .fetch_all(&self.primary)
        .await?;
        Ok(())
    }
    pub fn ownership_lost(&self) -> CancellationToken {
        self.state.lost()
    }
    pub async fn allocate_table(&self) -> Result<TableId> {
        self.state.allocate_table().await
    }
    pub async fn reserve(&self) -> Result<GameId> {
        self.check_state()?;
        let id: i64 = sqlx::query_scalar!(
            "SELECT nextval(pg_get_serial_sequence('games','id')) AS \"value!\""
        )
        .fetch_one(&self.primary)
        .await?;
        Ok(GameId::try_from(id)?)
    }
    /// The connections of the primary pool and of the lobby read pool.
    pub async fn database_reports(&self) -> Result<(PoolReport, PoolReport)> {
        async fn report(pool: &PgPool, name: &str) -> Result<PoolReport> {
            let row = sqlx::query!(
                r#"SELECT count(*) AS "total!",
                          count(*) FILTER (WHERE state = 'active') AS "active!",
                          count(*) FILTER (WHERE state = 'idle') AS "idle!",
                          count(*) FILTER (WHERE state LIKE 'idle in transaction%') AS "idle_transaction!"
                   FROM pg_stat_activity
                   WHERE datname = current_database() AND application_name = $1"#,
                name
            )
            .fetch_one(pool)
            .await?;
            Ok(PoolReport {
                max: pool.options().get_max_connections(),
                total: row.total,
                active: Some(row.active),
                idle: row.idle,
                idle_transaction: Some(row.idle_transaction),
            })
        }
        Ok(tokio::try_join!(
            report(&self.primary, &self.primary_name),
            report(&self.lobby_reads, &self.lobby_name)
        )?)
    }
    pub async fn remove(&self, id: TableId, revision: i64) -> Result<()> {
        self.state.remove(id, revision).await
    }
    /// A live table and its revision, as the database holds it.
    #[cfg(test)]
    pub async fn get(&self, id: TableId) -> Result<Option<(TableSnapshot, i64)>> {
        self.state
            .get(id)
            .await?
            .map(|stored| {
                Ok((
                    crate::checkpoint::decode(&stored.payload, &stored.parts)?,
                    stored.revision,
                ))
            })
            .transpose()
    }
    /// A `tableStart` request for a table's seated players, as its owner sees them.
    #[cfg(test)]
    pub async fn start_request(&self, id: TableId) -> Result<Value> {
        let (table, _) = self.get(id).await?.context("Missing durable table")?;
        let ids: Vec<_> = table.players().iter().filter_map(|p| p.id).collect();
        Ok(json!({"tableId": id, "intendedPlayerIds": ids}))
    }
    /// The saved live tables. A pregame's cached game totals may be stale; its actor refreshes
    /// them after startup, so that startup does not wait for statistics.
    ///
    /// A table whose checkpoint cannot be read is left out, with why, so that it does not stop the
    /// other tables from starting. Its checkpoint stays in the database, and the next start reads
    /// it again.
    pub async fn recover(&self) -> Result<Recovered> {
        let mut recovered = Recovered::default();
        for stored in self.state.load().await? {
            let read =
                crate::checkpoint::decode(&stored.payload, &stored.parts).and_then(|table| {
                    ensure!(table.id == stored.id, "Live-table identity mismatch");
                    Ok(table)
                });
            // An upgraded table saves every part again, as if the database held none of their
            // contents.
            let saved = if crate::checkpoint::is_outdated(&stored.payload) {
                let blank = stored
                    .parts
                    .iter()
                    .map(|(key, _)| (key.clone(), String::new()))
                    .collect::<Vec<_>>();
                Saved::of(stored.revision, &blank)
            } else {
                Saved::of(stored.revision, &stored.parts)
            };
            match read {
                Ok(table) => recovered.tables.push((table, saved)),
                Err(error) => recovered.unreadable.push((stored.id, error)),
            }
        }
        Ok(recovered)
    }
    /// The saved live tables, for tests, which fail if any table cannot be read.
    #[cfg(test)]
    pub async fn load(&self) -> Result<Vec<(TableSnapshot, Saved)>> {
        let recovered = self.recover().await?;
        if let Some((id, error)) = recovered.unreadable.into_iter().next() {
            return Err(error.context(format!("Table {id} is unreadable")));
        }
        Ok(recovered.tables)
    }
    /// Saves a table on its own. See `commit`.
    pub async fn save(&self, table: &mut TableSnapshot, saved: &mut Saved) -> Result<()> {
        self.commit(table, saved, Commit::default()).await?;
        Ok(())
    }
    /// Saves a table and the work that goes with it in one transaction. New chat messages and a
    /// finished game are archived, a tag edit is applied, and a table that a split creates is
    /// saved. `saved` is what the database held for the table before, and what it holds after.
    /// A failure before the commit changes nothing.
    pub async fn commit(
        &self,
        table: &mut TableSnapshot,
        saved: &mut Saved,
        work: Commit<'_>,
    ) -> Result<Outcome> {
        let mut metric = crate::metrics::STORAGE_METRICS.start("checkpoint");
        let result = async {
            let mut transaction = self.state.begin().await?;
            let new_chat = reserve_chat(&mut transaction, table).await?;
            if let Some(edit) = work.tag {
                table.game_mut().context("Missing tagged replay")?.tags =
                    apply_tag(&mut transaction, edit).await?;
            }
            let (encoded, parts) = crate::checkpoint::encode(table, &saved.parts)?;
            archive_chat(
                &mut transaction,
                new_chat.iter().map(|&index| &table.chat[index]),
            )
            .await?;
            if work.archive {
                crate::archive::insert(
                    &mut transaction,
                    table.game().context("Missing finished game")?,
                )
                .await?;
            }
            let seed = if work.count_seed {
                table.game().context("Missing finished game")?.seed.as_ref()
            } else {
                None
            };
            let seed_games = match seed {
                Some(seed) => Some(
                    sqlx::query_scalar!(
                        "SELECT count(*) AS \"value!\" FROM games WHERE seed=$1",
                        seed
                    )
                    .fetch_one(&mut *transaction)
                    .await?,
                ),
                _ => None,
            };
            let mut written = 0;
            let after = if work.retire {
                crate::state::remove_in(&mut transaction, table.id, saved.revision).await?;
                Saved {
                    revision: saved.revision,
                    parts: SavedParts::default(),
                }
            } else {
                written += written_bytes(&encoded.head, &encoded.changes);
                let revision = crate::state::save_in(
                    &mut transaction,
                    table.id,
                    saved.revision,
                    &encoded.head,
                    &encoded.changes,
                )
                .await?;
                Saved { revision, parts }
            };
            let spawn = match work.spawn {
                Some(spawn) => {
                    // The new table was only reserved, so it has no parts yet.
                    let (encoded, parts) =
                        crate::checkpoint::encode(&mut spawn.clone(), &SavedParts::default())?;
                    written += written_bytes(&encoded.head, &encoded.changes);
                    let revision = crate::state::save_in(
                        &mut transaction,
                        spawn.id,
                        0,
                        &encoded.head,
                        &encoded.changes,
                    )
                    .await?;
                    Some(Saved { revision, parts })
                }
                None => None,
            };
            self.state.commit(transaction).await?;
            *saved = after;
            crate::metrics::record_checkpoint(written);
            Ok(Outcome { spawn, seed_games })
        }
        .await;
        if result.is_ok() {
            metric.success();
        } else {
            crate::metrics::record_checkpoint_failure();
        }
        result
    }
    /// What the database holds for table `id` at `revision`, for tests that save tables by their
    /// revision.
    #[cfg(test)]
    pub async fn saved_at(&self, id: TableId, revision: i64) -> Result<Saved> {
        let parts = match self.state.get(id).await? {
            Some(stored) if stored.revision == revision => stored.parts,
            _ => vec![],
        };
        Ok(Saved::of(revision, &parts))
    }
    /// Saves a table that the database holds at `revision`. Returns its new revision.
    #[cfg(test)]
    pub async fn save_at(&self, table: &TableSnapshot, revision: i64) -> Result<i64> {
        let mut saved = self.saved_at(table.id, revision).await?;
        self.save(&mut table.clone(), &mut saved).await?;
        Ok(saved.revision)
    }
    /// Commits a table that the database holds at `revision`.
    #[cfg(test)]
    pub async fn commit_at(
        &self,
        table: &mut TableSnapshot,
        revision: i64,
        work: Commit<'_>,
    ) -> Result<Committed> {
        let mut saved = self.saved_at(table.id, revision).await?;
        let outcome = self.commit(table, &mut saved, work).await?;
        Ok(Committed {
            revision: saved.revision,
            spawn_revision: outcome.spawn.map(|spawn| spawn.revision),
            seed_games: outcome.seed_games,
        })
    }
    /// The first seed with this prefix that none of the human players have played. Bots play many
    /// games, so the server does not look up their seeds.
    pub async fn next_seed(&self, players: &[Player], prefix: String) -> Result<String> {
        let ids = players
            .iter()
            .filter(|p| !p.bot)
            .filter_map(|p| p.id)
            .collect::<Vec<_>>();
        let seeds = if ids.is_empty() {
            vec![]
        } else {
            crate::lobby::blocked_seeds(&self.primary, &ids, &prefix).await?
        };
        let seeds = seeds.into_iter().collect::<std::collections::HashSet<_>>();
        for next in 1_u64.. {
            let seed = format!("{prefix}{next}");
            if !seeds.contains(&seed) {
                return Ok(seed);
            }
        }
        unreachable!()
    }
    pub fn refresh_background(&self, snapshot: Snapshot) {
        let Ok(permit) = self.stats_slots.clone().try_acquire_owned() else {
            tracing::warn!(
                "Derived statistics capacity exhausted; the completed archive remains durable."
            );
            return;
        };
        let store = self.clone();
        self.stats.spawn(async move {
            let _permit = permit;
            let Ok(_running) = store.stats_running.acquire().await else {
                return;
            };
            if let Err(e) = crate::stats::refresh(&store.primary, &snapshot).await {
                tracing::error!("Derived statistics failed: {e}");
            }
        });
    }
    /// Adds time that users spent in a replay to their review time, in the background.
    pub fn credit_review_background(&self, credits: Vec<(UserId, Duration)>) {
        let (users, seconds): (Vec<i32>, Vec<i64>) = credits
            .into_iter()
            .filter_map(|(user, time)| Some((user.get(), i64::try_from(time.as_secs()).ok()?)))
            .filter(|(_, seconds)| *seconds > 0)
            .unzip();
        if users.is_empty() {
            return;
        }
        let Ok(permit) = self.stats_slots.clone().try_acquire_owned() else {
            tracing::warn!("Derived statistics capacity exhausted; review time was not counted.");
            return;
        };
        let store = self.clone();
        self.stats.spawn(async move {
            let _permit = permit;
            let Ok(_running) = store.stats_running.acquire().await else {
                return;
            };
            let result = sqlx::query!(
                "UPDATE users u SET seconds_reviewing=u.seconds_reviewing+c.seconds
                 FROM UNNEST($1::integer[],$2::bigint[]) AS c(id,seconds) WHERE u.id=c.id",
                &users,
                &seconds
            )
            .execute(&store.primary)
            .await;
            if let Err(e) = result {
                tracing::error!("Review time failed: {e}");
            }
        });
    }
    pub async fn close(&self) -> Result<()> {
        self.stats.close();
        self.stats.wait().await;
        let result = self.state.close().await;
        self.lobby_reads.close().await;
        self.primary.close().await;
        result
    }
}
/// A database pool's connections, as the operations endpoint reports them.
#[derive(serde::Serialize)]
pub struct PoolReport {
    #[serde(rename = "maxConnections")]
    pub max: u32,
    #[serde(rename = "totalConnections")]
    pub total: i64,
    #[serde(rename = "activeConnections", skip_serializing_if = "Option::is_none")]
    pub active: Option<i64>,
    #[serde(rename = "idleConnections")]
    pub idle: i64,
    #[serde(
        rename = "idleTransactionConnections",
        skip_serializing_if = "Option::is_none"
    )]
    pub idle_transaction: Option<i64>,
}
/// The bytes that a save writes: the head and the changed parts.
fn written_bytes(head: &str, changes: &PartChanges) -> usize {
    head.len()
        + changes
            .written
            .iter()
            .map(|(key, value)| key.len() + value.len())
            .sum::<usize>()
}
/// The live tables that `Store::recover` read, and the tables whose checkpoints it could not read.
#[derive(Default)]
pub struct Recovered {
    pub tables: Vec<(TableSnapshot, Saved)>,
    pub unreadable: Vec<(TableId, anyhow::Error)>,
}

/// The work that `Store::commit` does along with saving a table.
#[derive(Default)]
pub struct Commit<'a> {
    /// A tag edit for the replay's database game.
    pub tag: Option<&'a PendingTag>,
    /// Whether to archive the table's finished game.
    pub archive: bool,
    /// Whether to remove the table instead of saving it.
    pub retire: bool,
    /// A reserved table to save, such as one that a split creates.
    pub spawn: Option<&'a TableSnapshot>,
    /// Whether to count the saved games on the table's seed, for a game that just finished.
    pub count_seed: bool,
}

/// What `Store::commit` returns.
pub struct Outcome {
    /// What the database holds for the table in `Commit::spawn`.
    pub spawn: Option<Saved>,
    /// The saved games on the table's seed, if `Commit::count_seed` asked for them.
    pub seed_games: Option<i64>,
}

/// What the database holds for a live table: its revision, and what it holds of its parts, which
/// tells a save which parts to write. The table's actor keeps it.
#[derive(Clone, Debug, Default)]
pub struct Saved {
    pub revision: i64,
    parts: SavedParts,
}

impl Saved {
    /// What the database holds for a table at `revision` with these parts.
    fn of(revision: i64, parts: &[(String, String)]) -> Self {
        Self {
            revision,
            parts: SavedParts::of(parts),
        }
    }
}

/// The revisions after a commit, for tests.
#[cfg(test)]
pub struct Committed {
    /// The table's new revision, or its last one if it was removed.
    pub revision: i64,
    /// The revision of the table in `Commit::spawn`.
    pub spawn_revision: Option<i64>,
    pub seed_games: Option<i64>,
}

/// Gives new chat messages their archive IDs and stored timestamps. Returns their positions.
async fn reserve_chat(
    transaction: &mut Transaction<'static, Postgres>,
    table: &mut TableSnapshot,
) -> Result<Vec<usize>> {
    let pending = table
        .chat
        .iter()
        .enumerate()
        .filter(|(_, chat)| chat.id.is_none())
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    if pending.is_empty() {
        return Ok(pending);
    }
    let ids = sqlx::query_scalar!(
        "SELECT nextval(pg_get_serial_sequence('chat_log','id')) AS \"value!\"
         FROM generate_series(1,$1::integer)",
        i32::try_from(pending.len())?
    )
    .fetch_all(&mut **transaction)
    .await?;
    ensure!(
        ids.len() == pending.len(),
        "Incomplete chat identity reservation"
    );
    for (&index, id) in pending.iter().zip(ids) {
        let chat = &mut table.chat[index];
        chat.message.message.sent_at = hanabi_protocol::Timestamp::from(chat.sent()?);
        chat.id = Some(i32::try_from(id)?);
    }
    Ok(pending)
}

async fn archive_chat(
    transaction: &mut Transaction<'static, Postgres>,
    entries: impl Iterator<Item = &TableChat>,
) -> Result<()> {
    let (mut ids, mut users, mut messages, mut tables, mut sources, mut sent) =
        (vec![], vec![], vec![], vec![], vec![], vec![]);
    for entry in entries {
        ids.push(entry.id.context("Missing chat identity")?);
        // Server messages have no author.
        users.push(entry.user.map(UserId::get));
        messages.push(entry.message.message.text.clone());
        let table = entry
            .message
            .table_id
            .context("Invalid archived chat room")?;
        tables.push(i64::try_from(table.get())?);
        sources.push(match entry.message.message.author().source() {
            ChatSource::User => "user",
            ChatSource::Server => "server",
            ChatSource::Discord => bail!("Invalid table chat source"),
        });
        sent.push(entry.sent()?);
    }
    if ids.is_empty() {
        return Ok(());
    }
    sqlx::query!(
        "INSERT INTO chat_log(id,user_id,message,table_id,source,datetime_sent)
         SELECT c.id,c.user_id,c.message,c.table_id,c.source,c.sent
         FROM UNNEST($1::integer[],$2::integer[],$3::text[],$4::bigint[],$5::text[],
                     $6::timestamptz[]) AS c(id,user_id,message,table_id,source,sent)",
        &ids,
        // SQLx infers `&[i32]`; the cast allows NULL elements.
        &users as &[Option<i32>],
        &messages,
        &tables,
        &sources as &[&str],
        &sent
    )
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn apply_tag(
    transaction: &mut Transaction<'static, Postgres>,
    edit: &PendingTag,
) -> Result<Vec<Tag>> {
    // Serializes tag edits of the same game from different tables.
    sqlx::query!(
        "SELECT id FROM games WHERE id=$1 FOR UPDATE",
        edit.game_id.get()
    )
    .fetch_one(&mut **transaction)
    .await?;
    match &edit.edit {
        TagEdit::Add(tag) => {
            sqlx::query!("INSERT INTO game_tags(game_id,user_id,tag) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3)", edit.game_id.get(), edit.user_id.get(), tag).execute(&mut **transaction).await?;
        }
        TagEdit::Delete(tag) => {
            sqlx::query!(
                "DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3",
                edit.game_id.get(),
                edit.user_id.get(),
                tag
            )
            .execute(&mut **transaction)
            .await?;
        }
        TagEdit::DeleteAll => {
            sqlx::query!(
                "DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2",
                edit.game_id.get(),
                edit.user_id.get()
            )
            .execute(&mut **transaction)
            .await?;
        }
    }
    sqlx::query!(
        "SELECT user_id,tag FROM game_tags WHERE game_id=$1 ORDER BY user_id,tag",
        edit.game_id.get()
    )
    .fetch_all(&mut **transaction)
    .await?
    .into_iter()
    .map(|row| {
        Ok(Tag {
            user: UserId::try_from(row.user_id)?,
            tag: row.tag,
        })
    })
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Phase;
    use crate::{
        accounts::test_support::TestDb,
        actors::{Hub, HubCommand, TableCommand},
        game::{Game, Options},
        model::ExtraOptions,
        model::{FORMAT, IDLE_TIMEOUT_MS},
        stats::zero_stats,
        transport::Session,
    };
    use chrono::Utc;
    use hanabi_engine::{EndCondition, GameSetup, Interpretation};
    use std::{
        collections::{BTreeMap, BTreeSet},
        sync::Arc,
    };
    use tokio::sync::oneshot;

    fn pregame(id: TableId) -> TableSnapshot {
        TableSnapshot {
            format: FORMAT.into(),
            id,
            name: "Native parity".into(),
            owner: hanabi_protocol::UserRef {
                user_id: UserId::new(1).unwrap(),
                username: "Alice".into(),
            },
            visible: true,
            options: Options::default(),
            max_players: 6,
            password_hash: None,
            extra: ExtraOptions::default(),
            created: Utc::now(),
            phase: Phase::Pregame {
                players: vec![Player {
                    id: Some(UserId::new(1).unwrap()),
                    name: "Alice".into(),
                    bot: false,
                    stats: zero_stats(),
                }],
                kicked: vec![],
                runtime: crate::model::PregameRuntime::default(),
            },
            chat: vec![],
            shadows: BTreeMap::new(),
        }
    }
    fn terminal(table: &mut TableSnapshot) -> Result<()> {
        terminal_after(table, |_| Ok(()))
    }
    /// Ends a table's game, as `terminal` does, after `play` takes its turns.
    fn terminal_after(
        table: &mut TableSnapshot,
        play: impl FnOnce(&mut Game) -> Result<()>,
    ) -> Result<()> {
        let players = vec![
            Player {
                id: Some(UserId::new(1).unwrap()),
                name: "Alice".into(),
                bot: false,
                stats: zero_stats(),
            },
            Player {
                id: Some(UserId::new(2).unwrap()),
                name: "Bob".into(),
                bot: false,
                stats: zero_stats(),
            },
        ];
        let mut game = Game::create(GameSetup {
            options: table.options.clone(),
            player_names: players.iter().map(|p| p.name.clone()).collect(),
            seed: Some("p2v0s1".into()),
            deck: None,
            characters: None,
            interpretation: Interpretation::Live,
        })?;
        play(&mut game)?;
        game.terminate(
            0,
            EndCondition::TerminatedByPlayer,
            Some(0),
            None,
            Some(hanabi_engine::CompletionTiming {
                player_times: vec![0, 0],
                duration: 123,
            }),
        )?;
        table.phase = Phase::Live {
            snapshot: Box::new(Snapshot {
                format: FORMAT.into(),
                table_id: table.id,
                game_id: Some(GameId::new(1).unwrap()),
                owner: UserId::new(1).unwrap(),
                name: table.name.clone(),
                players,
                seed: Some("p2v0s1".into()),
                created: table.created,
                started: Utc::now(),
                finished: Some(Utc::now()),
                game,
                clocks: vec![0, 0],
                duration: 123,
                turn_elapsed: 0,
                timer_started: true,
                idle_remaining: IDLE_TIMEOUT_MS,
                paused_by: None,
                queued_pauses: vec![false, false],
                notes: vec![vec![String::new(); 55]; 2],
                spectator_notes: BTreeMap::new(),
                tags: vec![Tag {
                    user: UserId::new(1).unwrap(),
                    tag: "native".into(),
                }],
                votes: vec![false, false],
                maintenance_applied: false,
            }),
            runtime: crate::model::LiveRuntime::default(),
        };
        Ok(())
    }
    #[test]
    fn checkpoints_round_trip_as_a_head_and_parts() -> Result<()> {
        let mut table = pregame(TableId::new(1).unwrap());
        terminal(&mut table)?;
        table.convert_to_replay()?;
        let owner = crate::model::NoteOwner {
            name: "Spectator".into(),
            notes: vec![String::new(); 55],
        };
        table
            .game_mut()
            .unwrap()
            .spectator_notes
            .insert(UserId::new(3).unwrap(), owner.clone());
        table.game_mut().unwrap().notes[1][2] = "note".into();
        table.chat.push(TableChat {
            id: Some(7),
            user: Some(UserId::new(1).unwrap()),
            message: hanabi_protocol::ChatMessage::public(
                "hello",
                hanabi_protocol::ChatAuthor::User {
                    username: "Alice".into(),
                },
                hanabi_protocol::Timestamp::from(Utc::now()),
            )
            .into(),
        });
        let expected = serde_json::to_value(&table)?;
        let (encoded, _) = crate::checkpoint::encode(&mut table, &SavedParts::default())?;
        ensure!(
            serde_json::to_value(&table)? == expected,
            "Encoding did not put the table's lists back"
        );
        let parts = encoded.changes.written.clone();
        for key in [
            "chat/0",
            "step/0",
            "notes/1",
            "spectatorNotes/3",
            "game/start",
        ] {
            ensure!(
                parts.iter().any(|(part, _)| part == key),
                "Missing part {key}"
            );
        }
        ensure!(!encoded.head.contains("hello"), "The head kept the chat");
        let head: Value = serde_json::from_str(&encoded.head)?;
        ensure!(
            head["phase"]["snapshot"].get("players").is_none()
                && head["phase"]["snapshot"]["game"].get("setup").is_none(),
            "The head kept the game's start"
        );
        let decoded = crate::checkpoint::decode(&encoded.head, &parts)?;
        ensure!(serde_json::to_value(&decoded)? == expected);
        // Servers wrote the game's start in the head before it had a part of its own, which is no
        // longer read.
        let (_, start) = parts
            .iter()
            .find(|(key, _)| key == "game/start")
            .context("Missing game start")?;
        let start: Value = serde_json::from_str(start)?;
        let mut deployed = head.clone();
        deployed["phase"]["snapshot"]["players"] = start["players"].clone();
        deployed["phase"]["snapshot"]["game"]["setup"] = start["setup"].clone();
        let without_start = parts
            .iter()
            .filter(|(key, _)| key != "game/start")
            .cloned()
            .collect::<Vec<_>>();
        ensure!(
            crate::checkpoint::decode(&deployed.to_string(), &without_start).is_err(),
            "A head that holds its game's start was read"
        );
        ensure!(
            crate::checkpoint::decode(&deployed.to_string(), &parts).is_err(),
            "A game start was read from both the head and a part"
        );
        // The head cannot hold a list, and parts cannot have gaps.
        let inline = serde_json::to_string(&table)?;
        ensure!(crate::checkpoint::decode(&inline, &[]).is_err());
        let gap = parts
            .iter()
            .filter(|(key, _)| key != "step/0")
            .cloned()
            .collect::<Vec<_>>();
        ensure!(crate::checkpoint::decode(&encoded.head, &gap).is_err());
        let mut invalid = parts.clone();
        invalid.push(("spectatorNotes/not-a-user".into(), json!(owner).to_string()));
        ensure!(crate::checkpoint::decode(&encoded.head, &invalid).is_err());
        Ok(())
    }
    #[test]
    fn saves_write_only_new_entries_and_rewrite_lists_that_do_not_continue() -> Result<()> {
        let mut table = pregame(TableId::new(1).unwrap());
        terminal(&mut table)?;
        table.convert_to_replay()?;
        let message = |id: i32| TableChat {
            id: Some(id),
            user: Some(UserId::new(1).unwrap()),
            message: hanabi_protocol::ChatMessage::public(
                format!("message {id}"),
                hanabi_protocol::ChatAuthor::User {
                    username: "Alice".into(),
                },
                hanabi_protocol::Timestamp::from(Utc::now()),
            )
            .into(),
        };
        let keys = |encoded: &crate::checkpoint::Encoded| {
            encoded
                .changes
                .written
                .iter()
                .map(|(key, _)| key.clone())
                .collect::<Vec<_>>()
        };
        table.chat = vec![message(1), message(2)];
        let (_, saved) = crate::checkpoint::encode(&mut table, &SavedParts::default())?;
        table.chat.push(message(3));
        let (grown, saved) = crate::checkpoint::encode(&mut table, &saved)?;
        ensure!(
            keys(&grown) == ["chat/2"] && grown.changes.removed.is_empty(),
            "A new message rewrote other parts: {:?}",
            keys(&grown)
        );
        let (unchanged, _) = crate::checkpoint::encode(&mut table, &saved)?;
        ensure!(
            unchanged.changes.written.is_empty(),
            "An unchanged table rewrote parts"
        );
        table.chat.remove(0);
        let (rewritten, _) = crate::checkpoint::encode(&mut table, &saved)?;
        ensure!(
            keys(&rewritten) == ["chat/0", "chat/1"] && rewritten.changes.removed == ["chat/2"],
            "A chat that does not continue the saved one was not rewritten: {:?}",
            keys(&rewritten)
        );
        Ok(())
    }
    async fn database() -> Result<Option<(TestDb, PgPool)>> {
        let Some(db) = TestDb::create().await else {
            return Ok(None);
        };
        sqlx::query!("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES(1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1'),(3,'Cathy','cathy','test','127.0.0.1')").execute(&db.pool).await?;
        let pool = db.pool.clone();
        Ok(Some((db, pool)))
    }
    #[tokio::test]
    async fn recovered_pregames_refresh_their_totals_after_startup() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state.clone());
        let result = async {
            sqlx::query!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
                 speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
                 all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
                 SELECT 'Recovery stats',2,0,false,NULL,NULL,false,false,false,false,false,
                 false,false,'recovery-'||n,0,30,CASE n WHEN 1 THEN 1 ELSE 4 END,NOW(),NOW()
                 FROM generate_series(1,2) n")
            .execute(&store.primary)
            .await?;
            sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat)
                 SELECT id,1,0 FROM games")
            .execute(&store.primary)
            .await?;
            let mut table = pregame(store.allocate_table().await?);
            let Phase::Pregame { players, .. } = &mut table.phase else {
                unreachable!();
            };
            players[0].stats.num_games = hanabi_protocol::Count::new(727).unwrap();
            players.push(Player {
                id: Some(UserId::new(2).unwrap()),
                name: "Bob".into(),
                bot: false,
                stats: zero_stats(),
            });
            players[1].stats.num_games = hanabi_protocol::Count::new(572).unwrap();
            let original_revision = store.save_at(&table, 0).await?;
            let mut replay = pregame(store.allocate_table().await?);
            terminal(&mut replay)?;
            replay.game_mut().unwrap().players[0].stats.num_games = hanabi_protocol::Count::new(727).unwrap();
            replay.phase = Phase::Replay {
                snapshot: Box::new(replay.game().unwrap().clone()),
                replay: crate::model::ReplayState {
                    leader: UserId::new(1).unwrap(),
                    segment: hanabi_protocol::Turn::default(),
                    efficiency_modifier: hanabi_protocol::EfficiencyModifier::default(),
                    hypothetical: false,
                    hypothetical_actions: vec![],
                    show_drawn_cards: false,
                    spoiler_free: false,
                    restart_declined: vec![],
                }, runtime: crate::model::ReplayRuntime::default() };
            let replay_revision = store.save_at(&replay, 0).await?;
            // Startup does not wait for statistics, even while their table is locked.
            let mut blocked_archive = store.primary.begin().await?;
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("LOCK TABLE users IN ACCESS EXCLUSIVE MODE").execute(&mut *blocked_archive).await?;
            let tasks = TaskTracker::new();
            let hub = tokio::time::timeout(
                Duration::from_secs(1),
                Hub::start(store.clone(), tasks.clone(), crate::server_info::test_info(), crate::integrations::IntegrationSlot::default(),),
            )
            .await??;
            let (cached, cached_revision) = store.get(table.id).await?.context("Missing pregame")?;
            ensure!(cached_revision == original_revision && cached.players()[0].stats.num_games == hanabi_protocol::Count::new(727).unwrap(),
                "Startup waited for optional statistics or changed its cached snapshot");
            blocked_archive.rollback().await?;
            let Phase::Pregame { players, .. } = &mut table.phase else {
                unreachable!();
            };
            players[0].stats.num_games = hanabi_protocol::Count::new(1).unwrap();
            players[1].stats.num_games = hanabi_protocol::Count::new(0).unwrap();
            let refreshed = tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let (durable, revision) = store.get(table.id).await?.context("Missing pregame")?;
                    if revision > original_revision {
                        return Ok::<_, anyhow::Error>((durable, revision));
                    }
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            })
            .await?;
            let (stop, stopped) = oneshot::channel();
            hub.send(HubCommand::Stop(stop)).await?;
            stopped.await?;
            tasks.close();
            tasks.wait().await;
            let (durable, revision) = refreshed?;
            ensure!(
                revision == original_revision + 1
                    && serde_json::to_value(&durable)? == serde_json::to_value(&table)?,
                "Recovery must save refreshed totals once, without changing other pregame data"
            );
            let (saved_replay, saved_revision) = store.get(replay.id).await?.context("Missing replay")?;
            ensure!(
                saved_revision == replay_revision
                    && serde_json::to_value(&saved_replay)? == serde_json::to_value(&replay)?,
                "Recovery changed historical replay statistics"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }
    #[tokio::test]
    async fn an_unreadable_table_does_not_stop_the_others_from_starting() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state.clone());
        let result = async {
            let good = pregame(store.allocate_table().await?);
            store.save_at(&good, 0).await?;
            let bad = pregame(store.allocate_table().await?);
            store.save_at(&bad, 0).await?;
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up database state or failures directly"
            )]
            sqlx::query("UPDATE live_tables SET payload = '{}' WHERE id = $1")
                .bind(i64::try_from(bad.id.get())?)
                .execute(&store.primary)
                .await?;
            let tasks = TaskTracker::new();
            let (hub, unreadable) = Hub::recover(
                store.clone(),
                tasks.clone(),
                crate::server_info::test_info(),
                crate::integrations::IntegrationSlot::default(),
            )
            .await?;
            ensure!(
                unreadable.len() == 1
                    && unreadable[0].code == hanabi_protocol::NoticeCode::TableUnreadable,
                "The unreadable table was not reported"
            );
            let (stop, stopped) = oneshot::channel();
            hub.send(HubCommand::Stop(stop)).await?;
            stopped.await?;
            tasks.close();
            tasks.wait().await;
            let recovered = store.recover().await?;
            ensure!(
                recovered.tables.len() == 1 && recovered.tables[0].0.id == good.id,
                "The readable table was not recovered"
            );
            // The unreadable checkpoint stays, so that a later start can read it.
            ensure!(
                recovered.unreadable.len() == 1 && recovered.unreadable[0].0 == bad.id,
                "The unreadable checkpoint was removed"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }
    #[tokio::test]
    async fn saves_rewrite_only_changed_parts() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool.clone(), state.clone());
        let result = async {
            let mut table = pregame(store.allocate_table().await?);
            terminal(&mut table)?;
            table.convert_to_replay()?;

            let id = i64::try_from(table.id.get())?;
            let versions = || async {
                Ok::<_, anyhow::Error>(
                    sqlx::query!(
                        "SELECT part, xmin::text AS \"version!\" FROM live_table_parts
                         WHERE table_id = $1",
                        id
                    )
                    .fetch_all(&pool)
                    .await?
                    .into_iter()
                    .map(|row| (row.part, row.version))
                    .collect::<BTreeMap<_, _>>(),
                )
            };
            let revision = store.save_at(&table, 0).await?;
            let before = versions().await?;
            ensure!(
                before.len()
                    == crate::checkpoint::encode(&mut table.clone(), &SavedParts::default())?
                        .0
                        .changes
                        .written
                        .len(),
                "The first save did not store the lists as parts"
            );
            let head = state.get(table.id).await?.context("Missing table")?.payload;
            ensure!(
                head.contains("\"steps\":[]"),
                "The head kept the game's steps"
            );

            table.game_mut().unwrap().notes[1][0] = "changed".into();
            store.save_at(&table, revision).await?;
            let after = versions().await?;
            let changed = before
                .iter()
                .filter(|(part, version)| after.get(*part) != Some(*version))
                .map(|(part, _)| part.as_str())
                .collect::<Vec<_>>();
            ensure!(
                changed == ["notes/1"],
                "A note edit rewrote other parts: {changed:?}"
            );
            let (saved, _) = store.get(table.id).await?.context("Missing table")?;
            ensure!(serde_json::to_value(&saved)? == serde_json::to_value(&table)?);
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn derived_stats_update_only_the_columns_for_each_player_count() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let result = async {
            sqlx::query!(
                "INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
                 SELECT n,'Player'||n,'player'||n,'test','127.0.0.1' FROM generate_series(4,6) n"
            )
            .execute(&store.primary)
            .await?;
            let mut table = pregame(store.allocate_table().await?);
            terminal(&mut table)?;
            let template = table.game().unwrap().clone();
            // A player count without a game has no best score.
            let mut expected = [None::<i16>; 5];
            for count in hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS {
                let mut snapshot = template.clone();
                snapshot.players = (1..=hanabi_engine::int(count))
                    .map(|id| Player {
                        id: Some(UserId::new(id).unwrap()),
                        name: format!("Player{id}"),
                        bot: false,
                        stats: zero_stats(),
                    })
                    .collect();
                snapshot.game.state_mut().score = hanabi_engine::int(count) + 10;
                expected[count - 2] = Some(i16::try_from(count)? + 10);
                crate::stats::refresh(&store.primary, &snapshot).await?;
                let user = sqlx::query!(
                    "SELECT best_score2,best_score3,best_score4,best_score5,best_score6
                     FROM user_stats WHERE user_id=1 AND variant_id=0"
                )
                .fetch_one(&store.primary)
                .await?;
                let users = [
                    user.best_score2,
                    user.best_score3,
                    user.best_score4,
                    user.best_score5,
                    user.best_score6,
                ];
                ensure!(
                    users == expected,
                    "User stats after {count} players: {users:?}"
                );
            }
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }
    #[tokio::test]
    async fn player_statistics_carry_each_best_scores_modifier() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let result = async {
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up database state or failures directly"
            )]
            sqlx::raw_sql(
                "INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
                 VALUES(9001,'Carol','carol','test','127.0.0.1');
                 INSERT INTO user_stats(user_id,variant_id,num_games,best_score2,best_score2_mod,
                 best_score3,best_score3_mod) VALUES(9001,0,2,25,4,20,0);",
            )
            .execute(&store.primary)
            .await?;
            let carol =
                crate::stats::pregame_stats(&store.primary, UserId::new(9001).unwrap(), 0).await?;
            let best = serde_json::to_value(&carol.variant.best_scores)?;
            ensure!(
                best[0]["score"] == 25 && best[0]["modified"] == true,
                "A modified best score lost its modifier: {}",
                best[0]
            );
            ensure!(
                best[1]["modified"] == false,
                "An unmodified best score gained a modifier: {}",
                best[1]
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn new_games_skip_only_the_seeds_that_humans_played() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let result = async {
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up database state or failures directly"
            )]
            sqlx::raw_sql(
                "INSERT INTO games(id,name,num_players,variant_id,timed,speedrun,deck_plays,
                 empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
                 seed,score,num_turns,end_condition,datetime_started,datetime_finished)
                 SELECT n,'Seeds',2,0,false,false,false,false,false,false,false,false,
                 'p2v0s'||n,0,30,1,NOW(),NOW() FROM generate_series(1,2) n;
                 INSERT INTO game_participants(game_id,user_id,seat) VALUES(1,1,0),(2,2,0);",
            )
            .execute(&store.primary)
            .await?;
            let player = |id, bot| Player {
                id: Some(UserId::new(id).unwrap()),
                name: format!("Player {id}"),
                bot,
                stats: zero_stats(),
            };
            let human = store
                .next_seed(&[player(1, false), player(2, true)], "p2v0s".into())
                .await?;
            ensure!(
                human == "p2v0s2",
                "A bot's seed blocked a human's game: {human}"
            );
            let bots = store
                .next_seed(&[player(1, true), player(2, true)], "p2v0s".into())
                .await?;
            ensure!(
                bots == "p2v0s1",
                "Bots did not replay a played seed: {bots}"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        db.close().await;
        result
    }

    async fn send(
        hub: &tokio::sync::mpsc::Sender<HubCommand>,
        session: Arc<Session>,
        command: &str,
        data: Value,
    ) -> Result<()> {
        let (reply, received) = oneshot::channel();
        hub.send(HubCommand::Client {
            session,
            message: crate::actors::client_message(command, &data)?,
            reply,
        })
        .await?;
        tokio::time::timeout(Duration::from_secs(10), received).await???;
        Ok(())
    }
    /// A table chat message as players send it.
    fn chat(id: TableId, text: &str) -> Result<TableChat> {
        Ok(TableChat {
            id: None,
            user: Some(UserId::new(1).unwrap()),
            message: serde_json::from_value(json!({
                "text": text, "tableId": id, "sentAt": "2026-11-02T20:00:00.123456Z",
                "kind": {"type": "public", "author": {"type": "user", "username": "Alice"}},
            }))?,
        })
    }

    async fn count(pool: &PgPool, table: &str) -> Result<i64> {
        #[expect(
            clippy::disallowed_methods,
            reason = "test SQL that counts the rows of a fixed table"
        )]
        Ok(
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(pool)
                .await?,
        )
    }

    #[tokio::test]
    async fn finishing_a_game_archives_it_and_saves_its_replay_in_one_commit() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool.clone(), state);
        let result = async {
            let id = store.allocate_table().await?;
            let table = pregame(id);
            ensure!(store.save_at(&table, 0).await? == 1, "First revision");
            let (a, b) = tokio::join!(store.save_at(&table, 1), store.save_at(&table, 1));
            ensure!(
                a.is_ok() != b.is_ok(),
                "Two writers committed the same revision"
            );
            let mut finished = table.clone();
            terminal(&mut finished)?;
            finished.game_mut().unwrap().idle_remaining = 0;
            ensure!(
                store.save_at(&finished, 2).await.is_err(),
                "A finished live game was saved"
            );
            finished.convert_to_replay()?;
            let notes = &mut finished.game_mut().unwrap().notes;
            notes[0][0] = "first".into();
            notes[1][54] = "last".into();
            let archive = || Commit {
                archive: true,
                count_seed: true,
                ..Commit::default()
            };

            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query("ALTER TABLE game_actions ADD CONSTRAINT reject_test CHECK(type<0)")
                .execute(&pool)
                .await?;
            ensure!(
                store
                    .commit_at(&mut finished.clone(), 2, archive())
                    .await
                    .is_err(),
                "A broken archive committed"
            );
            ensure!(
                count(&pool, "games").await? == 0,
                "A partial archive escaped"
            );
            let restored = store.load().await?;
            ensure!(
                restored[0].1.revision == 2 && matches!(restored[0].0.phase, Phase::Pregame { .. }),
                "A failed commit changed the table"
            );
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query("ALTER TABLE game_actions DROP CONSTRAINT reject_test")
                .execute(&pool)
                .await?;

            let committed = store.commit_at(&mut finished.clone(), 2, archive()).await?;
            ensure!(committed.revision == 3);
            ensure!(
                committed.seed_games == Some(1),
                "The seed count left out the game that the commit archived"
            );
            // A restart refreshes the statistics again after the background refresh.
            for _ in 0..2 {
                crate::stats::refresh(&store.primary, finished.game().unwrap()).await?;
            }
            let users = sqlx::query_scalar!(
                "SELECT num_games FROM user_stats WHERE variant_id=0 ORDER BY user_id"
            )
            .fetch_all(&pool)
            .await?;
            ensure!(
                users == [1, 1],
                "The game was not counted once: players {users:?}"
            );
            let restored = store.load().await?;
            ensure!(
                matches!(restored[0].0.phase, Phase::Replay { .. })
                    && restored[0].0.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS,
                "The finished game did not become a fresh review"
            );
            ensure!(count(&pool, "game_actions").await? == 1);
            let replay = crate::archive::replay(
                &store.primary,
                GameId::new(1).unwrap(),
                TableId::new(99).unwrap(),
                UserId::new(1).unwrap(),
            )
            .await?;
            ensure!(
                replay.game.actions == finished.game().unwrap().game.actions
                    && replay.notes == finished.game().unwrap().notes
                    && replay.tags.len() == 1,
                "The archived game differs"
            );

            let edit = PendingTag {
                game_id: GameId::new(1).unwrap(),
                user_id: UserId::new(1).unwrap(),
                edit: TagEdit::Add("added".into()),
            };
            let tagging = || Commit {
                tag: Some(&edit),
                ..Commit::default()
            };
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query("ALTER TABLE game_tags ADD CONSTRAINT reject_test CHECK(tag <> 'added')")
                .execute(&pool)
                .await?;
            let mut replay_table = restored[0].0.clone();
            ensure!(
                store
                    .commit_at(&mut replay_table.clone(), 3, tagging())
                    .await
                    .is_err(),
                "A rejected tag committed"
            );
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query("ALTER TABLE game_tags DROP CONSTRAINT reject_test")
                .execute(&pool)
                .await?;
            store.commit_at(&mut replay_table, 3, tagging()).await?;
            ensure!(
                replay_table
                    .game()
                    .unwrap()
                    .tags
                    .iter()
                    .any(|t| t.tag == "added")
                    && store.load().await?[0].0.game().unwrap().tags.len() == 2,
                "The tag was not saved with the table"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn new_chat_is_archived_once_in_the_commit_that_saves_it() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool.clone(), state);
        let result = async {
            let id = store.allocate_table().await?;
            let mut table = pregame(id);
            store.save_at(&table, 0).await?;
            // The schema starts the chat log with one message.
            let initial = count(&pool, "chat_log").await?;
            table.chat = vec![chat(id, "first")?, chat(id, "second")?];

            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query(
                "ALTER TABLE chat_log ADD CONSTRAINT reject_test CHECK(message <> 'second')",
            )
            .execute(&pool)
            .await?;
            ensure!(
                store
                    .commit_at(&mut table.clone(), 1, Commit::default())
                    .await
                    .is_err(),
                "A rejected message committed"
            );
            ensure!(
                count(&pool, "chat_log").await? == initial,
                "A partial archive escaped"
            );
            #[expect(
                clippy::disallowed_methods,
                reason = "test SQL that sets up a database failure"
            )]
            sqlx::query("ALTER TABLE chat_log DROP CONSTRAINT reject_test")
                .execute(&pool)
                .await?;

            let revision = store
                .commit_at(&mut table, 1, Commit::default())
                .await?
                .revision;
            ensure!(
                table.chat.iter().all(|chat| chat.id.is_some())
                    && table.chat[0].message.message.sent_at.as_str() == "2026-11-02T20:00:00.123Z",
                "Archived messages lack their identities or stored timestamps"
            );
            store
                .commit_at(&mut table, revision, Commit::default())
                .await?;
            ensure!(
                count(&pool, "chat_log").await? == initial + 2,
                "Messages were not archived once"
            );
            let restored = store.load().await?;
            ensure!(
                restored[0]
                    .0
                    .chat
                    .iter()
                    .map(|chat| chat.id)
                    .collect::<Vec<_>>()
                    == table.chat.iter().map(|chat| chat.id).collect::<Vec<_>>(),
                "The checkpoint lost its archive identities"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn a_split_saves_both_tables_in_one_commit() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let result = async {
            let source_id = store.allocate_table().await?;
            let source = pregame(source_id);
            store.save_at(&source, 0).await?;
            let mut destination = pregame(store.allocate_table().await?);
            destination.owner = hanabi_protocol::UserRef {
                user_id: UserId::new(2).unwrap(),
                username: "Bob".into(),
            };
            if let Phase::Pregame { players, .. } = &mut destination.phase {
                players[0] = Player {
                    id: Some(UserId::new(2).unwrap()),
                    name: "Bob".into(),
                    bot: false,
                    stats: zero_stats(),
                };
            }
            let split = |retire| Commit {
                retire,
                spawn: Some(&destination),
                ..Commit::default()
            };
            ensure!(
                store
                    .commit_at(&mut source.clone(), 5, split(true))
                    .await
                    .is_err(),
                "A stale split committed"
            );
            let restored = store.load().await?;
            ensure!(
                restored.len() == 1 && restored[0].0.id == source_id,
                "A failed split changed the tables"
            );
            let committed = store.commit_at(&mut source.clone(), 1, split(true)).await?;
            ensure!(committed.spawn_revision == Some(1));
            let restored = store.load().await?;
            ensure!(
                restored.len() == 1 && restored[0].0.id == destination.id,
                "The split did not move the table"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn games_archive_chat_and_last_replay_departure_retires_table() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) = Session::new(
                UserId::new(hanabi_engine::int(index) + 1).unwrap(),
                (*name).into(),
                1,
            );
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                blocks: BTreeSet::new(),
                welcome: crate::actors::test_welcome(),
                initial: vec![],
                reply,
            })
            .await?;
            received.await??;
            users.push(session);
            outgoing.push(frames);
        }
        let result=async{
            send(&hub,users[0].clone(),"tableCreate",json!({"settings":{"name":"auto parity"}})).await?;
            let id=store.load().await?[0].0.id;
            send(&hub,users[1].clone(),"tableJoin",json!({"tableId":id})).await?;
            send(&hub,users[0].clone(),"tableStart",store.start_request(id).await?).await?;
            tokio::time::timeout(Duration::from_secs(5),async{
                loop{if store.load().await?.iter().any(|(t,_)|t.id==id&&matches!(t.phase,Phase::Live{..})){return Ok::<(),anyhow::Error>(());}tokio::time::sleep(Duration::from_millis(20)).await;}
            }).await??;
            send(&hub,users[2].clone(),"tableSpectate",json!({"tableId":id,"shadowingPlayerIndex":0})).await?;
            send(&hub,users[0].clone(),"chat",json!({"tableId":id,"text":"retained authored chat"})).await?;
            send(&hub,users[0].clone(),"tableTerminate",json!({"tableId":id})).await?;
            let rows:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM chat_log WHERE user_id=1 AND source='user' AND table_id=$1 AND message='retained authored chat'", i64::try_from(id.get())?).fetch_one(&store.primary).await?;
            ensure!(rows==1,"Accepted authored chat was omitted or duplicated in PostgreSQL");
            let restored=store.load().await?;
            ensure!(restored[0].0.chat.iter().all(|chat|chat.id.is_some()),"Chat was not archived with its checkpoint");
            for user in &users{send(&hub,user.clone(),"tableUnattend",json!({"tableId":id})).await?;}
            tokio::time::timeout(Duration::from_secs(3),async{
                while let Some(frame)=outgoing[2].recv().await{
                    if crate::transport::is_event(frame.message.to_text()?, "tableRemoved"){return Ok::<(),anyhow::Error>(());}
                }anyhow::bail!("Socket closed before tableRemoved")
            }).await??;
            ensure!(store.load().await?.is_empty(),"Departed replay remained recoverable");
            Ok::<(),anyhow::Error>(())
        }.await;
        let (reply, received) = oneshot::channel();
        hub.send(HubCommand::Stop(reply)).await?;
        received.await?;
        tasks.close();
        tasks.wait().await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn actual_actor_split_replay_hypothetical_and_restart_are_durable() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) = Session::new(
                UserId::new(hanabi_engine::int(index) + 1).unwrap(),
                (*name).into(),
                1,
            );
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                blocks: BTreeSet::new(),
                welcome: crate::actors::test_welcome(),
                initial: vec![],
                reply,
            })
            .await?;
            received.await??;
            users.push(session);
            outgoing.push(frames);
        }
        let result = async {
            send(
                &hub,
                users[0].clone(),
                "tableCreate",
                json!({"settings":{"name":"split parity","maxPlayers":6}}),
            )
            .await?;
            let id = store.load().await?[0].0.id;
            for user in users.iter().skip(1) {
                send(&hub, user.clone(), "tableJoin", json!({"tableId":id})).await?;
            }
            send(
                &hub,
                users[0].clone(),
                "chat",
                json!({"tableId":id,"text":"/split Bob"}),
            )
            .await?;
            let tables = store.load().await?;
            ensure!(tables.len() == 2, "Split table not persisted");
            let source = tables
                .iter()
                .find(|(t, _)| t.id == id)
                .context("Lost source")?;
            ensure!(
                source.0.seated_users().collect::<Vec<_>>() == vec![UserId::new(1).unwrap(), UserId::new(3).unwrap()],
                "Wrong split membership"
            );
            send(
                &hub,
                users[0].clone(),
                "tableUpdate",
                json!({
                    "tableId":id,
                    "settings":{"name":"Split","options":{"variantId":1343}},
                }),
            )
            .await?;
            send(&hub, users[0].clone(), "tableStart", store.start_request(id).await?).await?;
            send(
                &hub,
                users[0].clone(),
                "tableTerminate",
                json!({"tableId":id}),
            )
            .await?;
            send(
                &hub,
                users[0].clone(),
                "replayAction",
                json!({"tableId":id,"action":{"type":"hypothetical","control":{"type":"start"}}}),
            )
            .await?;
            let action = json!({"type":"turn","turn":7,"currentPlayerIndex":1});
            send(
                &hub,
                users[0].clone(),
                "replayAction",
                json!({"tableId":id,"action":{"type":"hypothetical","control":{"type":"event","event":action}}}),
            )
            .await?;
            let tables = store.load().await?;
            let source = tables.iter().find(|(t, _)| t.id == id).unwrap();
            let Phase::Replay { replay, .. } = &source.0.phase else {
                anyhow::bail!("Not a replay");
            };
            ensure!(
                replay.hypothetical
                    && serde_json::to_value(&replay.hypothetical_actions)? == json!([action]),
                "Hypothetical was not recovered exactly"
            );
            send(
                &hub,
                users[0].clone(),
                "tableRestart",
                json!({"tableId":id,"startNow":true}),
            )
            .await?;
            tokio::time::timeout(Duration::from_secs(5), async {
                loop {
                    let tables = store.load().await?;
                    if let Some((table, _)) = tables
                        .iter()
                        .find(|(t, _)| matches!(t.phase, Phase::Live { .. }))
                    {
                        ensure!(
                            table.id == id
                                && table.options.variant_name == "Reversed (5 Suits)"
                                && table.players().len() == 2,
                            "Restart lost rules or seats"
                        );
                        ensure!(
                            tables
                                .iter()
                                .all(|(t, _)| !matches!(t.phase, Phase::Replay { .. })),
                            "Restart retained the replay"
                        );
                        return Ok::<(), anyhow::Error>(());
                    }
                    tokio::time::sleep(Duration::from_millis(20)).await;
                }
            })
            .await??;
            Ok::<(), anyhow::Error>(())
        }
        .await;
        let (reply, received) = oneshot::channel();
        hub.send(HubCommand::Quiesce(reply)).await?;
        for handle in received.await? {
            let (reply, received) = oneshot::channel();
            handle.sender.send(TableCommand::Drain(reply)).await?;
            received.await??;
        }
        let (reply, received) = oneshot::channel();
        hub.send(HubCommand::Stop(reply)).await?;
        received.await?;
        tasks.close();
        tasks.wait().await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn actors_run_multiplayer_variants_and_recover_all_runtime_mutations() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let state = LiveState::for_test(&pool).await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
            crate::integrations::IntegrationSlot::default(),
        )
        .await?;
        let mut users = vec![];
        let mut frames = vec![];
        for (i, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, outgoing) = Session::new(
                UserId::new(hanabi_engine::int(i) + 1).unwrap(),
                (*name).into(),
                1,
            );
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                blocks: BTreeSet::new(),
                welcome: crate::actors::test_welcome(),
                initial: vec![],
                reply,
            })
            .await?;
            received.await??;
            users.push(session);
            frames.push(outgoing);
        }
        let result=async{
            send(&hub,users[0].clone(),"tableCreate",json!({"settings":{"name":"native","maxPlayers":6,"deal":{"type":"seed","suffix":"native"},"options":{"variantId":51,"timeControl":{"baseSeconds":120,"perTurnSeconds":20},"oneExtraCard":true,"detrimentalCharacters":true}}})).await?;
            let id=store.load().await?[0].0.id;
            for user in users.iter().skip(1){send(&hub,user.clone(),"tableJoin",json!({"tableId":id})).await?;}
            send(&hub,users[0].clone(),"tableStart",store.start_request(id).await?).await?;
            let loaded=store.load().await?;let s=loaded[0].0.game().unwrap();ensure!(s.players.len()==3&&s.game.stacks.len()==6&&s.game.clue_tokens==16,"Native variant ignored");
            let active=s.game.active_player_index;let actor=usize::try_from(s.players[active].user()?.get())?-1;
            send(&hub,users[actor].clone(),"gameLoaded",json!({"tableId":id})).await?;
            send(&hub,users[actor].clone(),"pause",json!({"tableId":id,"paused":true})).await?;
            send(&hub,users[actor].clone(),"note",json!({"tableId":id,"order":0,"text":"private"})).await?;
            send(&hub,users[actor].clone(),"tagAdd",json!({"tableId":id,"tag":"native-live"})).await?;
            let loaded=store.load().await?;let s=loaded[0].0.game().unwrap();ensure!(s.paused()&&s.notes[active][0]=="private"&&s.tags.len()==1,"Runtime mutations not durable");
            let (reply,received)=oneshot::channel();hub.send(HubCommand::Quiesce(reply)).await?;let handles=received.await?;
            for handle in handles{let (reply,received)=oneshot::channel();handle.sender.send(TableCommand::Drain(reply)).await?;received.await??;}
            let stored=store.load().await?;ensure!(stored[0].0.game().unwrap().maintenance_applied,"Maintenance allowance was not persisted");
            Ok::<(),anyhow::Error>(())
        }.await;
        let (reply, received) = oneshot::channel();
        hub.send(HubCommand::Stop(reply)).await?;
        received.await?;
        tasks.close();
        tasks.wait().await;
        store.close().await?;
        db.close().await;
        result
    }
}
