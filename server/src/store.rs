use crate::{
    game::{Game, Options},
    model::{
        FORMAT, IDLE_TIMEOUT_MS, PendingTag, Phase, Player, Snapshot, TableChat, TableSnapshot, Tag,
    },
    state::RedisState,
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, SubsecRound, Utc};
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::NO_VALUE;
use serde_json::{Value, json};

use sqlx::{
    PgPool,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Clone)]
pub struct Store {
    pub primary: PgPool,
    pub archive: PgPool,
    pub lobby_reads: PgPool,
    primary_name: String,
    archive_name: String,
    lobby_name: String,
    state: Option<RedisState>,
    stats: TaskTracker,
    stats_slots: Arc<Semaphore>,
}
/// The whole seconds that the database stores for a time base, which option validation bounds.
#[expect(
    clippy::cast_possible_truncation,
    reason = "option validation bounds the time base"
)]
fn stored_seconds(time_base: f64) -> i32 {
    time_base as i32
}

/// How long the primary and archive pools wait for a connection, a statement, or an idle
/// transaction.
pub const DATABASE_TIMEOUT: Duration = Duration::from_secs(30);
/// How long the lobby read pool, which also serves the public pages, waits for a connection or a
/// statement.
pub const LOBBY_READ_TIMEOUT: Duration = Duration::from_secs(2);
/// Connections in the pool that serves gameplay and other writes.
const PRIMARY_CONNECTIONS: u32 = 8;
/// Connections in the pool that archives finished games.
const ARCHIVE_CONNECTIONS: u32 = 2;
/// Connections in the pool that serves lobby reads and the public pages.
const LOBBY_READ_CONNECTIONS: u32 = 2;
/// The most derived-statistics refreshes that can run or wait at once.
const STATS_SLOTS: usize = 32;
/// The fractional-second digits that a PostgreSQL timestamp keeps (microseconds).
const DATABASE_TIMESTAMP_DIGITS: u16 = 6;
/// The stored character assignment of a player without a character.
pub const NO_CHARACTER_ASSIGNMENT: i16 = -1;

/// The namespaces of the transaction advisory locks that serialize writes of the same record.
#[derive(Clone, Copy)]
#[repr(i32)]
pub(crate) enum LockSpace {
    /// A game being archived, by game ID.
    Game = 17482,
    /// A variant's statistics, by variant ID.
    VariantStats = 17483,
    /// A durable chat message, by chat ID.
    Chat = 17484,
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
    pub(crate) fn fixture(primary: PgPool, state: RedisState) -> Self {
        Self {
            archive: primary.clone(),
            lobby_reads: primary.clone(),
            primary,
            primary_name: String::new(),
            archive_name: String::new(),
            lobby_name: String::new(),
            state: Some(state),
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(STATS_SLOTS)),
        }
    }
    pub async fn connect(config: &crate::config::Config) -> Result<Self> {
        let options = PgConnectOptions::new()
            .host(&config.database_host)
            .port(config.database_port)
            .username(&config.database_user)
            .password(&config.database_password)
            .database(&config.database)
            .ssl_mode(PgSslMode::Disable);
        let instance = rand::random::<u64>();
        let primary_name = format!("hanabi-live-{instance:016x}-primary");
        let archive_name = format!("hanabi-live-{instance:016x}-archive");
        let lobby_name = format!("hanabi-live-{instance:016x}-lobby");
        let primary = pool(
            options.clone().application_name(&primary_name),
            PRIMARY_CONNECTIONS,
        )
        .await?;
        let archive = pool(
            options.clone().application_name(&archive_name),
            ARCHIVE_CONNECTIONS,
        )
        .await?;
        let lobby_reads = PgPoolOptions::new()
            .max_connections(LOBBY_READ_CONNECTIONS)
            .acquire_timeout(LOBBY_READ_TIMEOUT)
            .connect_lazy_with(options.application_name(&lobby_name).options([
                (
                    "statement_timeout",
                    LOBBY_READ_TIMEOUT.as_millis().to_string(),
                ),
                ("default_transaction_read_only", "on".to_owned()),
            ]));
        crate::migrations::require_current(&primary).await?;
        let namespace = serde_json::to_string(&(
            &config.database_host,
            config.database_port,
            &config.database,
        ))?;
        let state = RedisState::connect(&config.redis_url, &namespace).await?;
        Ok(Self {
            primary,
            archive,
            lobby_reads,
            primary_name,
            archive_name,
            lobby_name,
            state: Some(state),
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(STATS_SLOTS)),
        })
    }
    pub(crate) fn state(&self) -> Result<&RedisState> {
        self.state
            .as_ref()
            .context("Redis authority is not connected")
    }
    pub fn check_state(&self) -> Result<()> {
        self.state()?.check()
    }
    pub fn state_health(&self) -> Result<()> {
        self.check_state()
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
    pub fn state_lost(&self) -> CancellationToken {
        self.state.as_ref().map_or_else(
            || {
                let token = CancellationToken::new();
                token.cancel();
                token
            },
            RedisState::lost,
        )
    }
    pub async fn allocate_table(&self) -> Result<u64> {
        self.state()?.allocate_table().await
    }
    pub async fn reserve(&self) -> Result<i32> {
        self.check_state()?;
        let id: i64 = sqlx::query_scalar!(
            "SELECT nextval(pg_get_serial_sequence('games','id')) AS \"value!\""
        )
        .fetch_one(&self.archive)
        .await?;
        Ok(i32::try_from(id)?)
    }
    pub async fn database_reports(&self) -> Result<Value> {
        async fn report(pool: &PgPool, name: &str) -> Result<Value> {
            let row=sqlx::query!("SELECT count(*)::bigint total,count(*) FILTER(WHERE state='active')::bigint active,count(*) FILTER(WHERE state='idle')::bigint idle,count(*) FILTER(WHERE state LIKE 'idle in transaction%')::bigint idle_transaction FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1", name).fetch_one(pool).await?;
            Ok(
                json!({"maxConnections":pool.options().get_max_connections(),"totalConnections":row.total,"activeConnections":row.active,"idleConnections":row.idle,"idleTransactionConnections":row.idle_transaction}),
            )
        }
        let (primary, recovery) = tokio::try_join!(
            report(&self.primary, &self.primary_name),
            report(&self.archive, &self.archive_name)
        )?;
        Ok(json!({"primary":primary,"recovery":recovery}))
    }
    pub async fn save(&self, table: &TableSnapshot, revision: i64) -> Result<i64> {
        let mut metric = crate::metrics::STORAGE_METRICS.start("checkpoint");
        let result = async {
            table.validate()?;
            ensure!(
                table.chat[table.chat_archived..]
                    .iter()
                    .all(|chat| chat.id.is_some()),
                "Pending chat must reserve numeric archive identities before checkpointing"
            );
            let payload = serde_json::to_string(table)?;
            let revision = self.state()?.save(table.id, revision, &payload).await?;
            crate::metrics::record_checkpoint(payload.len());
            Ok(revision)
        }
        .await;
        if result.is_ok() {
            metric.success();
        } else {
            crate::metrics::record_checkpoint_failure();
        }
        result
    }
    pub async fn remove(&self, id: u64, revision: i64) -> Result<()> {
        self.state()?.remove(id, revision).await
    }
    pub async fn load(&self) -> Result<Vec<(TableSnapshot, i64)>> {
        self.restore(true).await
    }
    pub async fn load_for_startup(&self) -> Result<Vec<(TableSnapshot, i64)>> {
        // Pregame actors refresh cached totals without holding up live-game admission.
        self.restore(false).await
    }
    async fn restore(&self, refresh_stats: bool) -> Result<Vec<(TableSnapshot, i64)>> {
        let mut output = vec![];
        let stored = self.state()?.load().await?;
        let mut queue = std::collections::VecDeque::from(stored);
        let mut seen = std::collections::HashSet::new();
        while let Some(stored) = queue.pop_front() {
            let id = stored.id;
            if !seen.insert(id) {
                continue;
            }
            let mut table = TableSnapshot::decode(&stored.payload)?;
            ensure!(table.id == id, "Redis identity mismatch");
            let mut revision = stored.revision;
            if let Some(edit) = table.pending_tag.take() {
                let tags = self.apply_tag(&edit).await?;
                table.game_mut().context("Missing tagged replay")?.tags = tags;
                revision = self.save(&table, revision).await?;
            }
            if table.chat_archived < table.chat.len() {
                self.archive_chat(&table.chat[table.chat_archived..])
                    .await?;
                table.chat_archived = table.chat.len();
                revision = self.save(&table, revision).await?;
            }
            if let Some(destination) = table.pending_spawn.take() {
                let destination_id = destination.id;
                let existing = self.state()?.get(destination_id).await?;
                match existing {
                    Some(ref record) if record.revision > 0 => {
                        ensure!(
                            serde_json::to_value(TableSnapshot::decode(&record.payload)?)?
                                == serde_json::to_value(&destination)?,
                            "Conflicting table transfer destination"
                        );
                    }
                    _ => {
                        if existing.is_none() {
                            self.state()?.reserve(destination_id).await?;
                        }
                        self.save(&destination, 0).await?;
                    }
                }
                queue.push_back(
                    self.state()?
                        .get(destination_id)
                        .await?
                        .context("Lost transfer destination")?,
                );
                if table.retire_after_spawn {
                    self.remove(id, revision).await?;
                    continue;
                }
                table.retire_after_spawn = false;
                revision = self.save(&table, revision).await?;
            }
            if let Phase::Live { snapshot } = &table.phase
                && snapshot.game.end_condition != EndCondition::InProgress
            {
                if !table.extra.no_write_to_database {
                    self.complete(snapshot, revision).await?;
                    self.refresh_background((**snapshot).clone());
                }
                table.convert_to_replay()?;
                revision = self.save(&table, revision).await?;
            }
            output.push((table, revision));
        }
        let users = output
            .iter()
            .filter_map(|(table, _)| match &table.phase {
                Phase::Pregame { players, .. } => Some(players),
                _ => None,
            })
            .flatten()
            .map(|player| player.id)
            .collect::<std::collections::BTreeSet<_>>();
        if refresh_stats && !users.is_empty() {
            let counts = self
                .completed_game_counts(&users.into_iter().collect::<Vec<_>>())
                .await?;
            for (table, revision) in &mut output {
                let Phase::Pregame { players, .. } = &mut table.phase else {
                    continue;
                };
                let mut changed = false;
                for player in players {
                    let count = counts.get(&player.id).copied().unwrap_or(0);
                    let stats = player
                        .stats
                        .as_object_mut()
                        .context("Invalid cached pregame statistics")?;
                    if stats.get("numGames").and_then(Value::as_i64) != Some(count) {
                        stats.insert("numGames".into(), json!(count));
                        changed = true;
                    }
                }
                if changed {
                    *revision = self.save(table, *revision).await?;
                }
            }
        }
        Ok(output)
    }
    /// Redis terminal state is fsynced first. PostgreSQL commits all archive rows
    /// atomically; the caller subsequently CAS-finalizes Redis to replay state.
    pub async fn complete(
        &self,
        s: &Snapshot,
        revision: i64,
    ) -> Result<(DateTime<Utc>, DateTime<Utc>)> {
        ensure!(
            s.game_id > 0 && s.game.end_condition != EndCondition::InProgress,
            "Cannot archive an ongoing/JSON game"
        );
        let stored = self
            .state()?
            .get(s.table_id)
            .await?
            .context("Missing terminal Redis checkpoint")?;
        ensure!(
            stored.revision == revision,
            "Completion requires the current checkpoint"
        );
        let durable = TableSnapshot::decode(&stored.payload)?;
        let saved = durable.game().context("Missing terminal game")?;
        ensure!(
            serde_json::to_value(saved)? == serde_json::to_value(s)?,
            "Completion differs from durable terminal state"
        );
        let finished = s.finished.context("Missing completion time")?;
        let o = &s.game.options;
        let variant = hanabi_engine::get_variant(&o.variant_name)?;
        let mut tx = self.archive.begin().await?;
        advisory_lock(&mut tx, LockSpace::Game, s.game_id).await?;
        self.check_state()?;
        let existing = sqlx::query_as!(
            crate::archive::GameRecord,
            "SELECT id,name,num_players,variant_id,timed,time_base,time_per_turn,
             speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
             detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished
             FROM games WHERE id=$1",
            s.game_id
        )
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(row) = existing {
            let existing_options = options_from_record(&row)?;
            let mut expected = o.clone();
            expected.variant_id = Some(variant.id);
            expected.time_base = f64::from(stored_seconds(o.time_base));
            expected.table_name = None;
            expected.max_players = None;
            ensure!(
                existing_options == expected
                    && row.seed.clone() == s.seed
                    && row.name.clone() == s.name
                    && i32::from(row.score) == s.game.score
                    && i32::from(row.end_condition) == s.game.end_condition as i32
                    && i32::from(row.num_turns) == s.game.turn,
                "Conflicting completed game"
            );
            let players = sqlx::query!("SELECT user_id,seat,character_assignment,character_metadata FROM game_participants WHERE game_id=$1 ORDER BY seat", s.game_id)
            .fetch_all(&mut *tx)
            .await?;
            ensure!(players.len() == s.players.len(), "Conflicting participants");
            for (seat, (row, player)) in players.iter().zip(&s.players).enumerate() {
                let character = &s.game.players[seat];
                let assignment = hanabi_engine::characters()
                    .iter()
                    .find(|c| c.name == character.character)
                    .map_or(Ok(NO_CHARACTER_ASSIGNMENT), |c| i16::try_from(c.id))?;
                let metadata = if hanabi_engine::Character::from_name(&character.character)
                    .is_some_and(hanabi_engine::Character::has_assigned_metadata)
                {
                    i16::try_from(character.character_metadata)?
                } else {
                    0
                };
                ensure!(
                    row.user_id == player.id
                        && i16::try_from(seat).ok() == Some(row.seat)
                        && row.character_assignment == assignment
                        && row.character_metadata == metadata,
                    "Conflicting participant identity"
                );
            }
            let notes=sqlx::query!("SELECT p.seat,n.card_order,n.note FROM game_participant_notes n JOIN game_participants p ON p.id=n.game_participant_id WHERE p.game_id=$1 ORDER BY p.seat,n.card_order", s.game_id).fetch_all(&mut *tx).await?;
            let expected_notes = s
                .notes
                .iter()
                .enumerate()
                .flat_map(|(seat, notes)| {
                    notes
                        .iter()
                        .enumerate()
                        .filter(|(_, note)| !note.is_empty())
                        .map(move |(order, note)| (seat, order, note))
                })
                .collect::<Vec<_>>();
            ensure!(
                notes.len() == expected_notes.len(),
                "Conflicting note count"
            );
            for (row, (seat, order, note)) in notes.iter().zip(expected_notes) {
                ensure!(
                    i16::try_from(seat).ok() == Some(row.seat)
                        && i16::try_from(order).ok() == Some(row.card_order)
                        && row.note.clone() == *note,
                    "Conflicting authored note"
                );
            }
            let rows = sqlx::query!(
                "SELECT type,target,value FROM game_actions WHERE game_id=$1 ORDER BY turn",
                s.game_id
            )
            .fetch_all(&mut *tx)
            .await?;
            ensure!(
                rows.len() == s.game.actions.len(),
                "Conflicting action count"
            );
            for (row, a) in rows.iter().zip(&s.game.actions) {
                ensure!(
                    i32::from(row.r#type) == i32::from(a.action_type)
                        && i32::from(row.target) == a.target
                        && i32::from(row.value) == a.value,
                    "Conflicting action"
                );
            }
            ensure!(
                hanabi_engine::create_shuffled_deck(variant, &s.seed) == s.game.identities(),
                "Conflicting deck"
            );
            let times = (row.datetime_started, row.datetime_finished);
            ensure!(
                times.0.timestamp_micros() == s.started.timestamp_micros()
                    && times.1.timestamp_micros() == finished.timestamp_micros(),
                "Conflicting completion timestamps"
            );
            tx.commit().await?;
            return Ok(times);
        }
        sqlx::query!("INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)", s.game_id, &s.name, i16::try_from(o.num_players)?, i16::try_from(variant.id)?, o.timed, stored_seconds(o.time_base), i32::try_from(o.time_per_turn)?, o.speedrun, o.deck_plays, o.empty_clues, o.one_extra_card, o.one_less_card, o.all_or_nothing, o.detrimental_characters, &s.seed, i16::try_from(s.game.score)?, i16::try_from(s.game.turn)?, s.game.end_condition as i16, s.started, finished).execute(&mut *tx).await?;
        for (seat, p) in s.players.iter().enumerate() {
            let character = &s.game.players[seat];
            let assignment = hanabi_engine::characters()
                .iter()
                .find(|c| c.name == character.character)
                .map_or(Ok(NO_CHARACTER_ASSIGNMENT), |c| i16::try_from(c.id))?;
            let metadata = if hanabi_engine::Character::from_name(&character.character)
                .is_some_and(hanabi_engine::Character::has_assigned_metadata)
            {
                i16::try_from(character.character_metadata)?
            } else {
                0
            };
            let participant:i32=sqlx::query_scalar!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata) VALUES($1,$2,$3,$4,$5) RETURNING id", s.game_id, p.id, i16::try_from(seat)?, assignment, metadata).fetch_one(&mut *tx).await?;
            for (order, note) in s.notes[seat]
                .iter()
                .enumerate()
                .filter(|(_, n)| !n.is_empty())
            {
                sqlx::query!("INSERT INTO game_participant_notes(game_participant_id,card_order,note) VALUES($1,$2,$3)", participant, i16::try_from(order)?, note).execute(&mut *tx).await?;
            }
        }
        let kinds: Vec<i16> = s
            .game
            .actions
            .iter()
            .map(|a| i16::try_from(i32::from(a.action_type)))
            .collect::<Result<_, _>>()?;
        let targets: Vec<i16> = s
            .game
            .actions
            .iter()
            .map(|a| i16::try_from(a.target))
            .collect::<Result<_, _>>()?;
        let values: Vec<i16> = s
            .game
            .actions
            .iter()
            .map(|a| i16::try_from(a.value))
            .collect::<Result<_, _>>()?;
        sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) SELECT $1,(a.turn-1)::smallint,a.kind,a.target,a.value FROM UNNEST($2::smallint[],$3::smallint[],$4::smallint[]) WITH ORDINALITY AS a(kind,target,value,turn)", s.game_id, &kinds, &targets, &values).execute(&mut *tx).await?;
        for tag in &s.tags {
            sqlx::query!(
                "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,$2,$3)",
                s.game_id,
                tag.user,
                &tag.tag
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        self.check_state()?;
        Ok((s.started, finished))
    }
    pub async fn historical(&self, id: i32, table_id: u64, owner: i32) -> Result<Snapshot> {
        let archive = crate::archive::load(&self.primary, id)
            .await?
            .context("Unknown replay")?;
        let row = archive.game;
        let options = options_from_record(&row)?;
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        let seed: String = row.seed.clone();
        let deck = hanabi_engine::create_shuffled_deck(variant, &seed);
        ensure!(
            deck.len() <= hanabi_engine::create_deck(variant).len()
                && deck.iter().all(|c| c.suit_index < variant.suits.len()),
            "Malformed stored deck"
        );
        let rows = archive.players;
        ensure!(rows.len() == options.num_players, "Invalid replay roster");
        let mut players = vec![];
        let mut characters = vec![];
        let mut notes = vec![vec![String::new(); deck.len() + variant.suits.len()]; rows.len()];
        for (seat, r) in rows.iter().enumerate() {
            ensure!(
                i16::try_from(seat).ok() == Some(r.seat),
                "Invalid replay seat"
            );
            players.push(Player {
                id: r.user_id,
                name: r.name.clone(),
                stats: zero_stats(),
            });
            let assignment = r.character_assignment;
            let character = hanabi_engine::characters()
                .iter()
                .find(|c| i16::try_from(c.id).ok() == Some(assignment));
            ensure!(
                assignment == NO_CHARACTER_ASSIGNMENT || character.is_some(),
                "Unknown stored character"
            );
            let name = character.map_or("", |c| c.name.as_str());
            characters.push(AssignedCharacter {
                name: name.into(),
                metadata: if hanabi_engine::Character::from_name(name)
                    .is_some_and(hanabi_engine::Character::has_assigned_metadata)
                {
                    i32::from(r.character_metadata)
                } else {
                    NO_VALUE
                },
            });
        }
        for note in archive.notes {
            let cell = notes
                .get_mut(usize::try_from(note.seat)?)
                .and_then(|notes| {
                    usize::try_from(note.order)
                        .ok()
                        .and_then(|order| notes.get_mut(order))
                })
                .context("Invalid stored note")?;
            *cell = note.note;
        }
        let game = Game::replay(
            GameSetup {
                options,
                player_names: players.iter().map(|p| p.name.clone()).collect(),
                seed: seed.clone(),
                deck: Some(deck),
                characters: Some(characters),
                interpretation: Interpretation::LegacyReplay,
            },
            archive.actions,
        )?;
        ensure!(
            game.score == i32::from(row.score)
                && game.end_condition as i32 == i32::from(row.end_condition),
            "Historical replay result mismatch"
        );
        let n = players.len();
        Ok(Snapshot {
            format: FORMAT.into(),
            table_id,
            game_id: row.id,
            owner,
            name: row.name.clone(),
            players,
            seed,
            created: Utc::now(),
            started: row.datetime_started,
            finished: Some(row.datetime_finished),
            game,
            clocks: vec![0; n],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            idle_remaining: IDLE_TIMEOUT_MS,
            pause_player_index: NO_VALUE,
            queued_pauses: vec![false; n],
            notes,
            spectator_notes: BTreeMap::new(),
            tags: archive.tags,
            votes: vec![false; n],
            maintenance_applied: false,
        })
    }
    pub async fn prepare_chat(&self, table: &mut TableSnapshot) -> Result<()> {
        self.check_state()?;
        let pending = table
            .chat
            .iter()
            .enumerate()
            .skip(table.chat_archived)
            .filter(|(_, chat)| chat.id.is_none())
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        if pending.is_empty() {
            return Ok(());
        }
        ensure!(
            pending.len() <= crate::model::MAX_TABLE_CHAT,
            "Oversized chat reservation"
        );
        let ids:Vec<i64>=sqlx::query_scalar!("SELECT nextval(pg_get_serial_sequence('chat_log','id')) AS \"value!\" FROM generate_series(1,$1::integer)", i32::try_from(pending.len())?).fetch_all(&self.archive).await?;
        self.check_state()?;
        ensure!(
            ids.len() == pending.len(),
            "Incomplete chat identity reservation"
        );
        for (index, id) in pending.into_iter().zip(ids) {
            let chat = &mut table.chat[index];
            let datetime = DateTime::parse_from_rfc3339(
                chat.message["datetime"]
                    .as_str()
                    .context("Invalid chat timestamp")?,
            )?
            .with_timezone(&Utc);
            chat.message["datetime"] = json!(crate::model::timestamp(datetime));
            chat.id = Some(i32::try_from(id)?);
        }
        Ok(())
    }
    pub async fn archive_chat(&self, entries: &[TableChat]) -> Result<()> {
        self.check_state()?;
        let mut tx = self.archive.begin().await?;
        let mut entries = entries.iter().collect::<Vec<_>>();
        entries.sort_by_key(|chat| chat.id);
        for entry in entries {
            let id = entry.id.context("Missing durable chat identity")?;
            ensure!(id > 0, "Invalid durable chat identity");
            advisory_lock(&mut tx, LockSpace::Chat, id).await?;
            self.check_state()?;
            let msg = entry.message["msg"]
                .as_str()
                .context("Invalid archived chat message")?;
            let room = entry.message["room"]
                .as_str()
                .context("Invalid archived chat room")?;
            let source = entry.message["source"]
                .as_str()
                .context("Invalid archived chat source")?;
            ensure!(
                matches!(source, "user" | "server"),
                "Invalid table chat source"
            );
            let datetime = DateTime::parse_from_rfc3339(
                entry.message["datetime"]
                    .as_str()
                    .context("Invalid chat timestamp")?,
            )?
            .with_timezone(&Utc);
            ensure!(
                datetime.trunc_subsecs(DATABASE_TIMESTAMP_DIGITS) == datetime,
                "Chat timestamp must use PostgreSQL precision before checkpointing"
            );
            sqlx::query!("INSERT INTO chat_log(id,user_id,message,room,source,datetime_sent) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING", id, entry.user, msg, room, source, datetime).execute(&mut *tx).await?;
            let existing = sqlx::query!(
                "SELECT user_id,message,room,source,datetime_sent FROM chat_log WHERE id=$1",
                id
            )
            .fetch_one(&mut *tx)
            .await?;
            ensure!(
                existing.user_id == entry.user
                    && existing.message.clone() == msg
                    && existing.room.clone() == room
                    && existing.source.clone() == source
                    && existing.datetime_sent == datetime,
                "Conflicting archived chat identity"
            );
        }
        tx.commit().await?;
        self.check_state()?;
        Ok(())
    }
    pub async fn apply_tag(&self, edit: &PendingTag) -> Result<Vec<Tag>> {
        self.check_state()?;
        let mut tx = self.archive.begin().await?;
        sqlx::query!("SELECT id FROM games WHERE id=$1 FOR UPDATE", edit.game_id)
            .fetch_one(&mut *tx)
            .await?;
        self.check_state()?;
        match edit.operation.as_str() {
            "tag" => {
                sqlx::query!("INSERT INTO game_tags(game_id,user_id,tag) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3)", edit.game_id, edit.user_id, &edit.tag).execute(&mut *tx).await?;
            }
            "tagDelete" => {
                sqlx::query!(
                    "DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3",
                    edit.game_id,
                    edit.user_id,
                    &edit.tag
                )
                .execute(&mut *tx)
                .await?;
            }
            "tagsDeleteAll" => {
                sqlx::query!(
                    "DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2",
                    edit.game_id,
                    edit.user_id
                )
                .execute(&mut *tx)
                .await?;
            }
            _ => anyhow::bail!("Invalid durable tag operation"),
        }
        let mut tags = vec![];
        for row in sqlx::query!(
            "SELECT user_id,tag FROM game_tags WHERE game_id=$1 ORDER BY user_id,tag",
            edit.game_id
        )
        .fetch_all(&mut *tx)
        .await?
        {
            tags.push(Tag {
                user: row.user_id,
                tag: row.tag.clone(),
            });
        }
        tx.commit().await?;
        self.check_state()?;
        Ok(tags)
    }
    pub async fn tags_for_game(&self, id: i32) -> Result<Option<Vec<Tag>>> {
        let rows=sqlx::query!("SELECT t.user_id AS \"user_id?\",t.tag AS \"tag?\" FROM games g LEFT JOIN game_tags t ON t.game_id=g.id WHERE g.id=$1 ORDER BY t.user_id,t.tag", id).fetch_all(&self.primary).await?;
        if rows.is_empty() {
            return Ok(None);
        }
        let mut tags = vec![];
        for row in rows {
            if let Some(tag) = row.tag.clone() {
                tags.push(Tag {
                    user: row.user_id.context("Missing tag author")?,
                    tag,
                });
            }
        }
        Ok(Some(tags))
    }
    pub async fn player(&self, id: i32, name: String) -> Result<Player> {
        self.player_for_variant(id, name, 0).await
    }
    async fn completed_game_counts(&self, ids: &[i32]) -> Result<BTreeMap<i32, i64>> {
        crate::database::normal_game_counts(&self.primary, ids, false).await
    }
    pub async fn player_for_variant(&self, id: i32, name: String, variant: u32) -> Result<Player> {
        let count = self
            .completed_game_counts(&[id])
            .await?
            .get(&id)
            .copied()
            .unwrap_or(0);
        let row = sqlx::query_as!(
            crate::database::UserStats,
            "SELECT user_id,variant_id,num_games,best_score2,best_score2_mod,best_score3,best_score3_mod,
             best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,best_score6_mod
             FROM user_stats WHERE user_id=$1 AND variant_id=$2",
            id,
            i16::try_from(variant)?
        )
        .fetch_optional(&self.primary)
        .await?;
        let mut stats = zero_stats();
        stats["numGames"] = json!(count);
        if let Some(row) = row {
            stats["variant"]["numGames"] = json!(row.num_games);
            for (index, (score, modifier)) in [
                (row.best_score2, row.best_score2_mod),
                (row.best_score3, row.best_score3_mod),
                (row.best_score4, row.best_score4_mod),
                (row.best_score5, row.best_score5_mod),
                (row.best_score6, row.best_score6_mod),
            ]
            .into_iter()
            .enumerate()
            {
                let best = &mut stats["variant"]["bestScores"][index];
                best["score"] = json!(score);
                crate::model::ScoreModifier::from_bits(modifier).write(best);
            }
        }
        Ok(Player { id, name, stats })
    }
    pub async fn seed_count(&self, seed: &str) -> Result<i64> {
        Ok(sqlx::query_scalar!(
            "SELECT count(*) AS \"value!\" FROM games WHERE seed=$1",
            seed
        )
        .fetch_one(&self.primary)
        .await?)
    }
    pub async fn next_seed(
        &self,
        players: &[Player],
        prefix: String,
        suffix: &str,
    ) -> Result<String> {
        if !suffix.is_empty() {
            return Ok(prefix + suffix);
        }
        let ids = players.iter().map(|p| p.id).collect::<Vec<_>>();
        let seeds = crate::lobby::blocked_seeds(&self.primary, &ids, &prefix).await?;
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
            eprintln!(
                "Derived statistics capacity exhausted; the completed archive remains durable."
            );
            return;
        };
        let store = self.clone();
        self.stats.spawn(async move {
            let _permit = permit;
            if let Err(e) = store.refresh(&snapshot).await {
                eprintln!("Derived statistics failed: {e}");
            }
        });
    }
    pub(crate) async fn refresh(&self, s: &Snapshot) -> Result<()> {
        let variant = hanabi_engine::get_variant(&s.game.options.variant_name)?;
        let v = i16::try_from(variant.id)?;
        let players = i32::try_from(s.players.len())?;
        let mut tx = self.archive.begin().await?;
        advisory_lock(&mut tx, LockSpace::VariantStats, i32::from(v)).await?;
        sqlx::query!("INSERT INTO seeds(seed,num_games) VALUES($1,(SELECT count(*) FROM games WHERE seed=$1)) ON CONFLICT(seed) DO UPDATE SET num_games=excluded.num_games", &s.seed).execute(&mut *tx).await?;
        sqlx::query!(
            "INSERT INTO variant_stats(variant_id) VALUES($1) ON CONFLICT DO NOTHING",
            v
        )
        .execute(&mut *tx)
        .await?;
        let modifier = crate::model::ScoreModifier::of(&s.game.options);
        for p in &s.players {
            sqlx::query!(
                "INSERT INTO user_stats(user_id,variant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
                p.id,
                v
            )
            .execute(&mut *tx)
            .await?;
            sqlx::query!(
                "UPDATE user_stats SET best_score2=CASE WHEN $5=2 THEN GREATEST(best_score2,$3) ELSE best_score2 END,best_score2_mod=CASE WHEN $5=2 AND ($3>best_score2 OR ($3=best_score2 AND $4<best_score2_mod)) THEN $4 ELSE best_score2_mod END,
                 best_score3=CASE WHEN $5=3 THEN GREATEST(best_score3,$3) ELSE best_score3 END,best_score3_mod=CASE WHEN $5=3 AND ($3>best_score3 OR ($3=best_score3 AND $4<best_score3_mod)) THEN $4 ELSE best_score3_mod END,
                 best_score4=CASE WHEN $5=4 THEN GREATEST(best_score4,$3) ELSE best_score4 END,best_score4_mod=CASE WHEN $5=4 AND ($3>best_score4 OR ($3=best_score4 AND $4<best_score4_mod)) THEN $4 ELSE best_score4_mod END,
                 best_score5=CASE WHEN $5=5 THEN GREATEST(best_score5,$3) ELSE best_score5 END,best_score5_mod=CASE WHEN $5=5 AND ($3>best_score5 OR ($3=best_score5 AND $4<best_score5_mod)) THEN $4 ELSE best_score5_mod END,
                 best_score6=CASE WHEN $5=6 THEN GREATEST(best_score6,$3) ELSE best_score6 END,best_score6_mod=CASE WHEN $5=6 AND ($3>best_score6 OR ($3=best_score6 AND $4<best_score6_mod)) THEN $4 ELSE best_score6_mod END,
                 num_games=s.n
                 FROM (SELECT count(*)::integer n FROM games g
                 JOIN game_participants p ON p.game_id=g.id
                 WHERE p.user_id=$1 AND g.variant_id=$2 AND NOT g.speedrun) s
                 WHERE user_id=$1 AND variant_id=$2",
                p.id,
                v,
                i16::try_from(s.game.score)?,
                modifier.bits(),
                players,
            )
            .execute(&mut *tx)
            .await?;
        }
        sqlx::query!(
            "UPDATE variant_stats SET best_score2=CASE WHEN $5=2 AND $4 THEN GREATEST(best_score2,$2) ELSE best_score2 END,
             best_score3=CASE WHEN $5=3 AND $4 THEN GREATEST(best_score3,$2) ELSE best_score3 END,
             best_score4=CASE WHEN $5=4 AND $4 THEN GREATEST(best_score4,$2) ELSE best_score4 END,
             best_score5=CASE WHEN $5=5 AND $4 THEN GREATEST(best_score5,$2) ELSE best_score5 END,
             best_score6=CASE WHEN $5=6 AND $4 THEN GREATEST(best_score6,$2) ELSE best_score6 END,
             num_games=s.n,num_max_scores=s.maximum
             FROM (SELECT count(*)::integer n,(count(*) FILTER(WHERE score=$3))::integer maximum
             FROM games WHERE variant_id=$1 AND NOT speedrun) s
             WHERE variant_id=$1",
            v,
            i16::try_from(s.game.score)?,
            i16::try_from(variant.max_score)?,
            modifier == crate::model::ScoreModifier::default(),
            players,
        )
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn close(&self) -> Result<()> {
        self.stats.close();
        self.stats.wait().await;
        let result = if let Some(state) = &self.state {
            state.close().await
        } else {
            Ok(())
        };
        self.archive.close().await;
        self.lobby_reads.close().await;
        self.primary.close().await;
        result
    }
}
pub fn zero_stats() -> Value {
    let best_scores = (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
        .map(|n| {
            let mut best = json!({"numPlayers":n,"score":0});
            crate::model::ScoreModifier::default().write(&mut best);
            best
        })
        .collect::<Vec<_>>();
    json!({"numGames":0,"variant":{"numGames":0,"bestScores":best_scores}})
}
pub fn options_from_record(row: &crate::archive::GameRecord) -> Result<Options> {
    let variant = hanabi_engine::get_variant_by_id(u32::try_from(row.variant_id)?)?;
    Ok(Options {
        num_players: usize::try_from(row.num_players)?,
        variant_name: variant.name.clone(),
        variant_id: Some(variant.id),
        timed: row.timed,
        time_base: f64::from(row.time_base),
        time_per_turn: i64::from(row.time_per_turn),
        speedrun: row.speedrun,
        deck_plays: row.deck_plays,
        empty_clues: row.empty_clues,
        one_extra_card: row.one_extra_card,
        one_less_card: row.one_less_card,
        all_or_nothing: row.all_or_nothing,
        detrimental_characters: row.detrimental_characters,
        table_name: None,
        max_players: None,
    })
}
pub fn validate_standard_record(row: &crate::archive::GameRecord) -> Result<()> {
    options_from_record(row)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        accounts::test_support::TestDb,
        actors::{Hub, HubCommand, TableCommand},
        model::ExtraOptions,
        test_redis::RedisFixture,
        transport::Session,
    };
    use std::sync::Arc;
    use tokio::sync::oneshot;

    fn pregame(id: u64) -> TableSnapshot {
        TableSnapshot {
            format: FORMAT.into(),
            id,
            name: "Native parity".into(),
            owner: 1,
            visible: true,
            options: Options::default(),
            max_players: 6,
            password_hash: None,
            extra: ExtraOptions::default(),
            created: Utc::now(),
            phase: Phase::Pregame {
                players: vec![Player {
                    id: 1,
                    name: "Alice".into(),
                    stats: zero_stats(),
                }],
                automatic_start: None,
                countdown: None,
                kicked: vec![],
            },
            chat: vec![],
            chat_archived: 0,
            shadows: BTreeMap::new(),
            pending_spawn: None,
            retire_after_spawn: false,
            pending_tag: None,
        }
    }
    fn terminal(table: &mut TableSnapshot) -> Result<()> {
        let players = vec![
            Player {
                id: 1,
                name: "Alice".into(),
                stats: zero_stats(),
            },
            Player {
                id: 2,
                name: "Bob".into(),
                stats: zero_stats(),
            },
        ];
        let mut game = Game::create(GameSetup {
            options: table.options.clone(),
            player_names: players.iter().map(|p| p.name.clone()).collect(),
            seed: "p2v0s1".into(),
            deck: None,
            characters: None,
            interpretation: Interpretation::Live,
        })?;
        game.terminate(
            0,
            EndCondition::TerminatedByPlayer,
            0,
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
                game_id: 1,
                owner: 1,
                name: table.name.clone(),
                players,
                seed: "p2v0s1".into(),
                created: table.created,
                started: Utc::now(),
                finished: Some(Utc::now()),
                game,
                clocks: vec![0, 0],
                duration: 123,
                turn_elapsed: 0,
                timer_started: true,
                idle_remaining: IDLE_TIMEOUT_MS,
                pause_player_index: NO_VALUE,
                queued_pauses: vec![false, false],
                notes: vec![vec![String::new(); 55]; 2],
                spectator_notes: BTreeMap::new(),
                tags: vec![Tag {
                    user: 1,
                    tag: "native".into(),
                }],
                votes: vec![false, false],
                maintenance_applied: false,
            }),
        };
        Ok(())
    }
    #[test]
    fn spectator_note_owners_round_trip_and_reject_invalid_keys() -> Result<()> {
        let mut table = pregame(1);
        terminal(&mut table)?;
        let owner = crate::model::NoteOwner {
            name: "Spectator".into(),
            notes: vec![String::new(); 55],
        };
        table
            .game_mut()
            .unwrap()
            .spectator_notes
            .insert(3, owner.clone());
        let payload = serde_json::to_string(&table)?;
        let decoded = TableSnapshot::decode(&payload)?;
        let direct: TableSnapshot = serde_json::from_str(&payload)?;
        ensure!(serde_json::to_value(&decoded)? == serde_json::to_value(&table)?);
        ensure!(serde_json::to_value(&direct)? == serde_json::to_value(&table)?);
        let mut invalid = serde_json::to_value(&table)?;
        invalid["phase"]["snapshot"]["spectator_notes"] = json!({"not-a-user":owner});
        ensure!(TableSnapshot::decode(&invalid.to_string()).is_err());
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
    async fn recovery_refreshes_only_pregame_totals_and_persists_them_once() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "pregame-count-recovery").await?;
        let store = Store::fixture(pool, state.clone());
        let result = async {
            sqlx::query!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
                 speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
                 all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
                 SELECT 'Recovery stats',2,0,false,120,20,false,false,false,false,false,
                 false,false,'recovery-'||n,0,30,CASE n WHEN 1 THEN 1 ELSE 4 END,NOW(),NOW()
                 FROM generate_series(1,2) n")
            .execute(&store.primary)
            .await?;
            sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
                 SELECT id,1,0,0,0 FROM games")
            .execute(&store.primary)
            .await?;
            let mut table = pregame(store.allocate_table().await?);
            let Phase::Pregame { players, .. } = &mut table.phase else {
                unreachable!();
            };
            players[0].stats["numGames"] = json!(727);
            players.push(Player {
                id: 2,
                name: "Bob".into(),
                stats: zero_stats(),
            });
            players[1].stats["numGames"] = json!(572);
            let original_revision = store.save(&table, 0).await?;
            let mut replay = pregame(store.allocate_table().await?);
            terminal(&mut replay)?;
            replay.game_mut().unwrap().players[0].stats["numGames"] = json!(727);
            replay.phase = Phase::Replay {
                snapshot: Box::new(replay.game().unwrap().clone()),
                replay: crate::model::ReplayState {
                    leader: 1,
                    segment: 0,
                    efficiency_modifier: 0,
                    hypothetical: false,
                    hypothetical_actions: vec![],
                    show_drawn_cards: false,
                    spoiler_free: false,
                },
            };
            let replay_revision = store.save(&replay, 0).await?;
            let mut blocked_archive = store.primary.begin().await?;
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("LOCK TABLE games IN ACCESS EXCLUSIVE MODE").execute(&mut *blocked_archive).await?;
            let startup = tokio::time::timeout(Duration::from_secs(1), store.load_for_startup()).await??;
            let cached = startup.iter().find(|(saved, _)| saved.id == table.id).context("Missing startup pregame")?;
            ensure!(cached.1 == original_revision && cached.0.players()[0].stats["numGames"] == 727,
                "Startup waited for optional statistics or changed its cached snapshot");
            blocked_archive.rollback().await?;
            let restored = store.load().await?;
            let (actual, revision) = restored
                .iter()
                .find(|(saved, _)| saved.id == table.id)
                .context("Missing restored pregame")?;
            let Phase::Pregame { players, .. } = &mut table.phase else {
                unreachable!();
            };
            players[0].stats["numGames"] = json!(1);
            players[1].stats["numGames"] = json!(0);
            ensure!(
                serde_json::to_value(actual)? == serde_json::to_value(&table)?,
                "Recovery must refresh totals without changing other pregame data"
            );
            ensure!(*revision == original_revision + 1);
            let durable = state
                .get(table.id)
                .await?
                .context("Missing durable pregame")?;
            ensure!(
                durable.revision == *revision
                    && serde_json::from_str::<Value>(&durable.payload)?
                        == serde_json::to_value(&table)?,
                "Refreshed totals were not durably saved"
            );
            let (saved_replay, saved_revision) = restored
                .iter()
                .find(|(saved, _)| saved.id == replay.id)
                .context("Missing replay")?;
            ensure!(
                *saved_revision == replay_revision
                    && serde_json::to_value(saved_replay)? == serde_json::to_value(&replay)?,
                "Recovery changed historical replay statistics"
            );
            let again = store.load().await?;
            ensure!(
                again.iter().find(|(saved, _)| saved.id == table.id).unwrap().1 == *revision,
                "Unchanged totals caused another checkpoint write"
            );
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
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "derived-stats").await?;
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
            let mut expected = [0_i16; 5];
            for count in hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS {
                let mut snapshot = template.clone();
                snapshot.players = (1..=hanabi_engine::int(count))
                    .map(|id| Player {
                        id,
                        name: format!("Player{id}"),
                        stats: zero_stats(),
                    })
                    .collect();
                snapshot.game.score = hanabi_engine::int(count) + 10;
                expected[count - 2] = i16::try_from(count)? + 10;
                store.refresh(&snapshot).await?;
                let user = sqlx::query!(
                    "SELECT best_score2,best_score3,best_score4,best_score5,best_score6
                     FROM user_stats WHERE user_id=1 AND variant_id=0"
                )
                .fetch_one(&store.primary)
                .await?;
                let variant = sqlx::query!(
                    "SELECT best_score2,best_score3,best_score4,best_score5,best_score6
                     FROM variant_stats WHERE variant_id=0"
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
                let variants = [
                    variant.best_score2,
                    variant.best_score3,
                    variant.best_score4,
                    variant.best_score5,
                    variant.best_score6,
                ];
                ensure!(
                    users == expected,
                    "User stats after {count} players: {users:?}"
                );
                ensure!(
                    variants == expected,
                    "Variant stats after {count} players: {variants:?}"
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
    async fn redis_is_sole_authority_and_terminal_archive_is_atomic_and_retryable() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        crate::accounts::test_support::legacy_column_order(&pool).await?;
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-store-integration").await?;
        let store = Store::fixture(pool, state);
        let result = async {
            let id = store.allocate_table().await?;
            let mut table = pregame(id);
            ensure!(store.save(&table, 0).await? == 1, "First revision");
            let (a, b) = tokio::join!(store.save(&table, 1), store.save(&table, 1));
            ensure!(a.is_ok() != b.is_ok(), "Two CAS writers committed");
            let restored = store.load().await?;
            ensure!(
                restored.len() == 1
                    && restored[0].1 == 2
                    && matches!(restored[0].0.phase, Phase::Pregame { .. }),
                "Pregame not durable"
            );
            terminal(&mut table)?;
            table.game_mut().unwrap().idle_remaining = 0;
            table.game_mut().unwrap().players[0].stats["variant"]["numGames"] = json!(3);
            table.game_mut().unwrap().spectator_notes.insert(
                3,
                crate::model::NoteOwner {
                    name: "Spectator".into(),
                    notes: vec![String::new(); 55],
                },
            );
            let revision = store.save(&table, 2).await?;
            let mut changed = table.game().unwrap().clone();
            changed.players[0].stats["variant"]["numGames"] = json!(4);
            ensure!(
                store.complete(&changed, revision).await.is_err(),
                "Completion accepted statistics that differ from the durable checkpoint"
            );
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("ALTER TABLE game_actions ADD CONSTRAINT reject_native_test CHECK(type<0)")
                .execute(&store.primary)
                .await?;
            ensure!(
                store
                    .complete(table.game().unwrap(), revision)
                    .await
                    .is_err(),
                "Broken archive committed"
            );
            let games: i64 = sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM games")
                .fetch_one(&store.primary)
                .await?;
            ensure!(games == 0, "Partial PG transaction escaped");
            ensure!(
                store
                    .state()?
                    .get(id)
                    .await?
                    .unwrap()
                    .revision
                    == revision,
                "Terminal Redis state lost"
            );
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("ALTER TABLE game_actions DROP CONSTRAINT reject_native_test")
                .execute(&store.primary)
                .await?;
            store.complete(table.game().unwrap(), revision).await?;
            store.complete(table.game().unwrap(), revision).await?;
            let recovered = store.load().await?;
            ensure!(
                recovered.len() == 1 && matches!(recovered[0].0.phase, Phase::Replay { .. }),
                "Cross-store terminal retry failed"
            );
            ensure!(recovered[0].0.game().unwrap().idle_remaining == IDLE_TIMEOUT_MS,
                "Recovered completion inherited an expired live-game idle budget");
            store.stats.close();
            store.stats.wait().await;
            let games: Option<i32> = sqlx::query_scalar!("SELECT num_games FROM user_stats WHERE user_id=1 AND variant_id=0")
            .fetch_optional(&store.primary)
            .await?;
            ensure!(games == Some(1), "Recovered completion did not refresh statistics");
            let actions: i64 = sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM game_actions")
                .fetch_one(&store.primary)
                .await?;
            ensure!(actions == 1, "Idempotent archive duplicated actions");
            let replay = store.historical(1, 99, 1).await?;
            ensure!(
                replay.game.actions == table.game().unwrap().game.actions && replay.tags.len() == 1,
                "Archive replay differs"
            );
            let mut pending=recovered[0].0.clone();
            pending.pending_tag=Some(PendingTag{game_id:1,user_id:1,operation:"tag".into(),tag:"recovered-tag".into()});
            store.save(&pending,recovered[0].1).await?;
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("ALTER TABLE game_tags ADD CONSTRAINT reject_native_tag CHECK(tag <> 'recovered-tag')").execute(&store.primary).await?;
            ensure!(store.load().await.is_err(),"Rejected replay tag was not surfaced");
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("ALTER TABLE game_tags DROP CONSTRAINT reject_native_tag").execute(&store.primary).await?;
            let recovered=store.load().await?;
            ensure!(recovered[0].0.pending_tag.is_none()&&recovered[0].0.game().unwrap().tags.iter().any(|t|t.tag=="recovered-tag"),"Replay tag intent was not recovered");
            store.load().await?;
            let tags:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM game_tags WHERE tag='recovered-tag'").fetch_one(&store.primary).await?;
            ensure!(tags==1,"Recovered tag was duplicated");
            let latest = recovered[0].1;
            store.remove(id, latest).await?;
            ensure!(
                store.save(&table, 0).await.is_err(),
                "Removed table resurrected"
            );
            Ok::<(), anyhow::Error>(())
        }
        .await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn interrupted_split_recovers_reserved_destination_without_duplicate_membership()
    -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-split-recovery").await?;
        let store = Store::fixture(pool, state);
        let source_id = store.allocate_table().await?;
        let destination_id = store.allocate_table().await?;
        let mut source = pregame(source_id);
        let mut destination = source.clone();
        destination.id = destination_id;
        if let Phase::Pregame { players, .. } = &mut source.phase {
            *players = vec![Player {
                id: 2,
                name: "Bob".into(),
                stats: zero_stats(),
            }];
        }
        source.owner = 2;
        source.pending_spawn = Some(Box::new(destination));
        store.save(&source, 0).await?;
        store.state()?.close().await?;
        let state = RedisState::connect(&redis.url, "native-split-recovery").await?;
        let restored = Store::fixture(store.primary.clone(), state);
        let result = async {
            let tables = restored.load().await?;
            ensure!(tables.len() == 2, "Interrupted split lost destination");
            let members = tables
                .iter()
                .flat_map(|(t, _)| t.players().iter().map(|p| p.id))
                .collect::<Vec<_>>();
            ensure!(
                members.len() == 2 && members.contains(&1) && members.contains(&2),
                "Split duplicated/lost members"
            );
            ensure!(
                tables.iter().all(|(t, _)| t.pending_spawn.is_none()),
                "Transfer was not finalized"
            );
            for (table, revision) in tables {
                restored.remove(table.id, revision).await?;
            }
            Ok::<(), anyhow::Error>(())
        }
        .await;
        restored.close().await?;
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
    #[tokio::test]
    async fn player_statistics_carry_each_best_scores_modifier() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-best-score-modifiers").await?;
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
            let player = store.player(9001, "Carol".into()).await?;
            let best = &player.stats["variant"]["bestScores"];
            ensure!(
                best[0]["score"] == 25
                    && best[0]["modifier"] == 4
                    && best[0]["oneExtraCard"] == true
                    && best[0]["deckPlays"] == false,
                "A modified best score lost its modifier: {}",
                best[0]
            );
            ensure!(
                best[1]["modifier"] == 0 && best[1]["oneExtraCard"] == false,
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
    async fn reserved_chat_ids_survive_failure_and_concurrent_retries_without_conflating_messages()
    -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-chat-identities").await?;
        let store = Store::fixture(pool, state);
        let result=async{
            let id=store.allocate_table().await?;let mut table=pregame(id);
            let message=json!({"msg":"identical legitimate entry","who":"Alice","source":"user","room":format!("table{id}"),"datetime":"2026-11-02T20:00:00.123456789Z"});
            table.chat=vec![
                TableChat{id:None,user:1,message:message.clone()},
                TableChat{id:None,user:1,message:message.clone()},
                TableChat{id:None,user:1,message},
            ];
            store.prepare_chat(&mut table).await?;
            let ids=table.chat.iter().map(|chat|chat.id.unwrap()).collect::<Vec<_>>();
            ensure!(ids.iter().collect::<std::collections::HashSet<_>>().len()==3,"Distinct messages shared an identity");
            ensure!(table.chat[0].message["datetime"]=="2026-11-02T20:00:00.123Z","Timestamp was not canonicalized before durability");
            store.save(&table,0).await?;
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query(sqlx::AssertSqlSafe(format!("ALTER TABLE chat_log ADD CONSTRAINT reject_reserved_chat CHECK(id <> {})",ids[2]))).execute(&store.primary).await?;
            ensure!(store.archive_chat(&table.chat).await.is_err(),"Partial archive failure was not surfaced");
            let rows:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM chat_log WHERE id=ANY($1)", &ids).fetch_one(&store.primary).await?;
            ensure!(rows==0,"Failed chat batch escaped rollback");
            #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
            sqlx::query("ALTER TABLE chat_log DROP CONSTRAINT reject_reserved_chat").execute(&store.primary).await?;
            let (left,right)=tokio::join!(store.archive_chat(&table.chat),store.archive_chat(&table.chat));
            left?;right?;
            let rows:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM chat_log WHERE id=ANY($1)", &ids).fetch_one(&store.primary).await?;
            ensure!(rows==3,"Concurrent retries duplicated or conflated legitimate chat");
            let mut conflicting=table.chat[0].clone();conflicting.message["msg"]=json!("conflicting payload");
            ensure!(store.archive_chat(&[conflicting]).await.is_err(),"Conflicting content reused a durable chat identity");
            let recovered=store.load().await?;
            ensure!(recovered[0].0.chat_archived==3&&recovered[0].0.chat.iter().map(|c|c.id.unwrap()).collect::<Vec<_>>()==ids,"Recovery changed reserved chat identities");
            store.remove(id,recovered[0].1).await?;
            Ok::<(),anyhow::Error>(())
        }.await;
        store.close().await?;
        db.close().await;
        result
    }

    #[tokio::test]
    async fn expired_owner_waiting_on_pg_locks_cannot_reapply_chat_or_tag_mutations() -> Result<()>
    {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-postgres-fence").await?;
        let store = Store::fixture(pool, state.clone());
        let id = store.allocate_table().await?;
        let mut table = pregame(id);
        terminal(&mut table)?;
        table.chat.push(TableChat{id:None,user:1,message:json!({"msg":"fenced chat","who":"Alice","source":"user","room":format!("table{id}"),"datetime":"2026-11-02T20:00:00.123456Z"})});
        store.prepare_chat(&mut table).await?;
        let chat_id = table.chat[0].id.unwrap();
        let revision = store.save(&table, 0).await?;
        store.complete(table.game().unwrap(), revision).await?;
        let mut blocker = store.primary.begin().await?;
        sqlx::query!("SELECT id FROM games WHERE id=1 FOR UPDATE")
            .fetch_one(&mut *blocker)
            .await?;
        advisory_lock(&mut blocker, LockSpace::Chat, chat_id).await?;
        let old = store.clone();
        let old_tag = tokio::spawn(async move {
            old.apply_tag(&PendingTag {
                game_id: 1,
                user_id: 1,
                operation: "tagsDeleteAll".into(),
                tag: String::new(),
            })
            .await
        });
        let old = store.clone();
        let entries = table.chat.clone();
        let old_chat = tokio::spawn(async move { old.archive_chat(&entries).await });
        tokio::time::timeout(Duration::from_secs(3),async{
            loop{
                let waiting:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'").fetch_one(&store.primary).await?;
                if waiting>=2{return Ok::<(),anyhow::Error>(());}
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await??;
        state.close().await?;
        let replacement = RedisState::connect(&redis.url, "native-postgres-fence").await?;
        let current = Store::fixture(store.primary.clone(), replacement);
        sqlx::query!("INSERT INTO game_tags(game_id,user_id,tag) VALUES(1,1,'new-owner')")
            .execute(&mut *blocker)
            .await?;
        blocker.commit().await?;
        ensure!(
            old_tag.await?.is_err(),
            "Expired owner reapplied stale mutable tags after acquiring the lock"
        );
        ensure!(
            old_chat.await?.is_err(),
            "Expired owner archived after acquiring the serialization lock"
        );
        let tags: Vec<String> =
            sqlx::query_scalar!("SELECT tag FROM game_tags WHERE game_id=1 ORDER BY tag")
                .fetch_all(&current.primary)
                .await?;
        ensure!(
            tags == vec!["native", "new-owner"],
            "Old owner overwrote newer data"
        );
        let (one, two) = tokio::join!(
            current.archive_chat(&table.chat),
            current.archive_chat(&table.chat)
        );
        one?;
        two?;
        let rows: i64 = sqlx::query_scalar!(
            "SELECT count(*) AS \"v!\" FROM chat_log WHERE id=$1",
            chat_id
        )
        .fetch_one(&current.primary)
        .await?;
        ensure!(rows == 1, "Replacement did not archive exactly once");
        current.remove(id, revision).await?;
        current.close().await?;
        db.close().await;
        Ok(())
    }

    #[tokio::test]
    async fn auto_start_archives_chat_and_last_replay_departure_retires_table() -> Result<()> {
        let Some((db, pool)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-auto-chat-retire").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) =
                Session::new(hanabi_engine::int(index) + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
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
            send(&hub,users[0].clone(),"tableCreate",json!({"name":"auto parity","options":{}})).await?;
            let id=store.load().await?[0].0.id;
            send(&hub,users[0].clone(),"chat",json!({"room":format!("table{id}"),"msg":"/s2"})).await?;
            tokio::time::timeout(Duration::from_secs(3),async{
                while let Some(frame)=outgoing[0].recv().await{
                    if frame.message.to_text()?.contains("as soon as 2 players have joined"){return Ok::<(),anyhow::Error>(());}
                }anyhow::bail!("Socket closed before automatic-start notice")
            }).await??;
            send(&hub,users[1].clone(),"tableJoin",json!({"tableID":id})).await?;
            tokio::time::timeout(Duration::from_secs(5),async{
                loop{if store.load().await?.iter().any(|(t,_)|t.id==id&&matches!(t.phase,Phase::Live{..})){return Ok::<(),anyhow::Error>(());}tokio::time::sleep(Duration::from_millis(20)).await;}
            }).await??;
            send(&hub,users[2].clone(),"tableSpectate",json!({"tableID":id,"shadowingPlayerIndex":0})).await?;
            send(&hub,users[0].clone(),"chat",json!({"room":format!("table{id}"),"msg":"retained authored chat"})).await?;
            send(&hub,users[0].clone(),"tableTerminate",json!({"tableID":id})).await?;
            let rows:i64=sqlx::query_scalar!("SELECT count(*) AS \"v!\" FROM chat_log WHERE user_id=1 AND source='user' AND room=$1 AND message='retained authored chat'", format!("table{id}")).fetch_one(&store.primary).await?;
            ensure!(rows==1,"Accepted authored chat was omitted or duplicated in PostgreSQL");
            let restored=store.load().await?;
            ensure!(restored[0].0.chat_archived==restored[0].0.chat.len(),"Chat archival cursor not durable");
            for user in &users{send(&hub,user.clone(),"tableUnattend",json!({"tableID":id})).await?;}
            tokio::time::timeout(Duration::from_secs(3),async{
                while let Some(frame)=outgoing[2].recv().await{
                    if frame.message.to_text()?.starts_with("tableGone "){return Ok::<(),anyhow::Error>(());}
                }anyhow::bail!("Socket closed before tableGone")
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
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-split-replay").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) =
                Session::new(hanabi_engine::int(index) + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
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
                json!({"name":"split parity","maxPlayers":6,"options":{}}),
            )
            .await?;
            let id = store.load().await?[0].0.id;
            for user in users.iter().skip(1) {
                send(&hub, user.clone(), "tableJoin", json!({"tableID":id})).await?;
            }
            send(
                &hub,
                users[0].clone(),
                "chat",
                json!({"room":format!("table{id}"),"msg":"/split Bob"}),
            )
            .await?;
            let tables = store.load().await?;
            ensure!(tables.len() == 2, "Split table not persisted");
            let source = tables
                .iter()
                .find(|(t, _)| t.id == id)
                .context("Lost source")?;
            ensure!(
                source.0.players().iter().map(|p| p.id).collect::<Vec<_>>() == vec![1, 3],
                "Wrong split membership"
            );
            send(
                &hub,
                users[0].clone(),
                "tableSetVariant",
                json!({"tableID":id,"options":{"variantName":"Reversed (5 Suits)"}}),
            )
            .await?;
            send(&hub, users[0].clone(), "tableStart", json!({"tableID":id})).await?;
            send(
                &hub,
                users[0].clone(),
                "tableTerminate",
                json!({"tableID":id}),
            )
            .await?;
            send(
                &hub,
                users[0].clone(),
                "replayAction",
                json!({"tableID":id,"type":"hypoStart"}),
            )
            .await?;
            let action = json!({"type":"turn","num":7,"currentPlayerIndex":1});
            send(
                &hub,
                users[0].clone(),
                "replayAction",
                json!({"tableID":id,"type":"hypoAction","action":action}),
            )
            .await?;
            let tables = store.load().await?;
            let source = tables.iter().find(|(t, _)| t.id == id).unwrap();
            let Phase::Replay { replay, .. } = &source.0.phase else {
                anyhow::bail!("Not a replay");
            };
            ensure!(
                replay.hypothetical
                    && replay
                        .hypothetical_actions
                        .iter()
                        .map(|raw| serde_json::from_str::<Value>(raw))
                        .collect::<Result<Vec<_>, _>>()?
                        == vec![action],
                "Hypothetical was not recovered exactly"
            );
            send(
                &hub,
                users[0].clone(),
                "tableRestart",
                json!({"tableID":id,"hidePregame":true}),
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
                            table.id != id
                                && table.options.variant_name == "Reversed (5 Suits)"
                                && table.players().len() == 2,
                            "Restart lost rules or seats"
                        );
                        ensure!(
                            tables.iter().all(|(t, _)| t.id != id),
                            "Restart retained old replay"
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
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-actors-integration").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            tasks.clone(),
            crate::server_info::test_info(),
        )
        .await?;
        let mut users = vec![];
        let mut frames = vec![];
        for (i, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, outgoing) =
                Session::new(hanabi_engine::int(i) + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
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
            send(&hub,users[0].clone(),"tableCreate",json!({"name":"!seed native","maxPlayers":6,"options":{"variantName":"Clue Starved (6 Suits)","timed":true,"timeBase":120,"timePerTurn":20,"oneExtraCard":true,"detrimentalCharacters":true}})).await?;
            let id=store.load().await?[0].0.id;
            for user in users.iter().skip(1){send(&hub,user.clone(),"tableJoin",json!({"tableID":id,"password":""})).await?;}
            send(&hub,users[0].clone(),"tableStart",json!({"tableID":id})).await?;
            let loaded=store.load().await?;let s=loaded[0].0.game().unwrap();ensure!(s.players.len()==3&&s.game.stacks.len()==6&&s.game.clue_tokens==16,"Native variant ignored");
            let active=s.game.active_player_index;let actor=usize::try_from(s.players[active].id)?-1;
            send(&hub,users[actor].clone(),"loaded",json!({"tableID":id})).await?;
            send(&hub,users[actor].clone(),"pause",json!({"tableID":id,"setting":"pause"})).await?;
            send(&hub,users[actor].clone(),"note",json!({"tableID":id,"order":0,"note":"private"})).await?;
            send(&hub,users[actor].clone(),"tag",json!({"tableID":id,"msg":"native-live"})).await?;
            let loaded=store.load().await?;let s=loaded[0].0.game().unwrap();ensure!(s.game.paused&&s.notes[active][0]=="private"&&s.tags.len()==1,"Runtime mutations not durable");
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
