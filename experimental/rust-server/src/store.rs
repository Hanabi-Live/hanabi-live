use crate::{
    game::{Action, Game, Options, decode_deck, encode_deck},
    model::{
        FORMAT, PendingTag, Phase, Player, ReplayState, Snapshot, TableChat, TableSnapshot, Tag,
    },
    state::{RedisState, StateId},
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use serde_json::{Value, json};
use sqlx::{
    PgPool, Row,
    postgres::{PgConnectOptions, PgPoolOptions, PgSslMode},
};
use std::{collections::BTreeMap, sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use tokio_util::{sync::CancellationToken, task::TaskTracker};

#[derive(Clone)]
pub struct Store {
    pub primary: PgPool,
    pub archive: PgPool,
    primary_name: String,
    archive_name: String,
    state: Option<RedisState>,
    stats: TaskTracker,
    stats_slots: Arc<Semaphore>,
}
impl Store {
    #[cfg(test)]
    pub(crate) fn fixture(primary: PgPool, state: RedisState) -> Self {
        Self {
            archive: primary.clone(),
            primary,
            primary_name: String::new(),
            archive_name: String::new(),
            state: Some(state),
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(32)),
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
        let primary_name = format!("hanabi-rust-{instance:016x}-primary");
        let archive_name = format!("hanabi-rust-{instance:016x}-archive");
        async fn pool(options: PgConnectOptions, max: u32) -> Result<PgPool> {
            Ok(PgPoolOptions::new()
                .max_connections(max)
                .acquire_timeout(Duration::from_secs(30))
                .after_connect(|c, _| {
                    Box::pin(async move {
                        sqlx::query("SET statement_timeout = 30000")
                            .execute(&mut *c)
                            .await?;
                        sqlx::query("SET idle_in_transaction_session_timeout = 30000")
                            .execute(c)
                            .await?;
                        Ok(())
                    })
                })
                .connect_with(options)
                .await?)
        }
        let primary = pool(options.clone().application_name(&primary_name), 10).await?;
        let archive = pool(options.application_name(&archive_name), 2).await?;
        let version: i32 = sqlx::query_scalar("SELECT version FROM schema_version")
            .fetch_one(&primary)
            .await?;
        ensure!(
            version == 5,
            "Native server requires database schema version 5"
        );
        let old: i64 = sqlx::query_scalar("SELECT count(*) FROM active_games")
            .fetch_one(&primary)
            .await?;
        ensure!(
            old == 0,
            "Legacy PostgreSQL active_games checkpoints exist. Recover/migrate them explicitly before starting the Redis authority."
        );
        let namespace = serde_json::to_string(&(
            &config.database_host,
            config.database_port,
            &config.database,
        ))?;
        let state = RedisState::connect(&config.redis_url, &namespace).await?;
        Ok(Self {
            primary,
            archive,
            primary_name,
            archive_name,
            state: Some(state),
            stats: TaskTracker::new(),
            stats_slots: Arc::new(Semaphore::new(32)),
        })
    }
    fn state(&self) -> Result<&RedisState> {
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
    pub fn state_lost(&self) -> CancellationToken {
        self.state
            .as_ref()
            .map(RedisState::lost)
            .unwrap_or_else(|| {
                let token = CancellationToken::new();
                token.cancel();
                token
            })
    }
    pub async fn allocate_table(&self) -> Result<u64> {
        self.state()?.allocate_table().await
    }
    pub async fn reserve(&self) -> Result<i32> {
        self.check_state()?;
        let id: i64 = sqlx::query_scalar("SELECT nextval(pg_get_serial_sequence('games','id'))")
            .fetch_one(&self.archive)
            .await?;
        Ok(i32::try_from(id)?)
    }
    pub async fn database_reports(&self) -> Result<Value> {
        async fn report(pool: &PgPool, name: &str) -> Result<Value> {
            let row=sqlx::query("SELECT count(*)::bigint total,count(*) FILTER(WHERE state='active')::bigint active,count(*) FILTER(WHERE state='idle')::bigint idle,count(*) FILTER(WHERE state LIKE 'idle in transaction%')::bigint idle_transaction FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1").bind(name).fetch_one(pool).await?;
            Ok(
                json!({"maxConnections":pool.options().get_max_connections(),"totalConnections":row.try_get::<i64,_>("total")?,"activeConnections":row.try_get::<i64,_>("active")?,"idleConnections":row.try_get::<i64,_>("idle")?,"idleTransactionConnections":row.try_get::<i64,_>("idle_transaction")?}),
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
            let revision = self
                .state()?
                .save(StateId::Table(table.id), revision, &payload)
                .await?;
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
        self.state()?.remove(StateId::Table(id), revision).await
    }
    pub async fn load(&self) -> Result<Vec<(TableSnapshot, i64)>> {
        let old: i64 = sqlx::query_scalar("SELECT count(*) FROM active_games")
            .fetch_one(&self.primary)
            .await?;
        ensure!(
            old == 0,
            "Legacy PostgreSQL active game checkpoints require explicit migration"
        );
        let mut output = vec![];
        let mut queue = std::collections::VecDeque::from(self.state()?.load().await?);
        let mut seen = std::collections::HashSet::new();
        while let Some(stored) = queue.pop_front() {
            let StateId::Table(id) = stored.id else {
                anyhow::bail!(
                    "Unexpected standalone game checkpoint; explicit format migration required"
                );
            };
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
                let destination_id = StateId::Table(destination.id);
                let existing = self.state()?.get(destination_id).await?;
                match existing {
                    Some(ref record) if record.revision > 0 => {
                        ensure!(
                            serde_json::from_str::<Value>(&record.payload)?
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
                }
                let snapshot = snapshot.clone();
                let segment = snapshot.game.turn;
                table.phase = Phase::Replay {
                    snapshot,
                    replay: ReplayState {
                        leader: table.owner,
                        segment,
                        efficiency_modifier: 0,
                        hypothetical: None,
                        hypothetical_actions: vec![],
                        show_drawn_cards: false,
                    },
                };
                revision = self.save(&table, revision).await?;
            }
            output.push((table, revision));
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
            .get(StateId::Table(s.table_id))
            .await?
            .context("Missing terminal Redis checkpoint")?;
        ensure!(
            stored.revision == revision,
            "Completion requires the current checkpoint"
        );
        let durable: TableSnapshot = serde_json::from_str(&stored.payload)?;
        let saved = durable.game().context("Missing terminal game")?;
        ensure!(
            serde_json::to_value(saved)? == serde_json::to_value(s)?,
            "Completion differs from durable terminal state"
        );
        let finished = s.finished.context("Missing completion time")?;
        let o = &s.game.options;
        let variant = hanabi_engine::get_variant(&o.variant_name)?;
        let mut tx = self.archive.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(17482,$1)")
            .bind(s.game_id)
            .execute(&mut *tx)
            .await?;
        self.check_state()?;
        let existing = sqlx::query("SELECT * FROM games WHERE id=$1")
            .bind(s.game_id)
            .fetch_optional(&mut *tx)
            .await?;
        if let Some(row) = existing {
            let existing_options = options_from_record(&row)?;
            let mut expected = o.clone();
            expected.variant_id = Some(variant.id);
            expected.time_base = f64::from(o.time_base as i32);
            expected.table_name = None;
            expected.max_players = None;
            ensure!(
                existing_options == expected
                    && row.try_get::<String, _>("seed")? == s.seed
                    && row.try_get::<String, _>("name")? == s.name
                    && i32::from(row.try_get::<i16, _>("score")?) == s.game.score
                    && i32::from(row.try_get::<i16, _>("end_condition")?)
                        == s.game.end_condition as i32
                    && i32::from(row.try_get::<i16, _>("num_turns")?) == s.game.turn,
                "Conflicting completed game"
            );
            let players = sqlx::query(
                "SELECT user_id,seat,character_assignment,character_metadata FROM game_participants WHERE game_id=$1 ORDER BY seat",
            )
            .bind(s.game_id)
            .fetch_all(&mut *tx)
            .await?;
            ensure!(players.len() == s.players.len(), "Conflicting participants");
            for (seat, (row, player)) in players.iter().zip(&s.players).enumerate() {
                let character = &s.game.players[seat];
                let assignment = hanabi_engine::characters()
                    .iter()
                    .find(|c| c.name == character.character)
                    .map_or(-1, |c| c.id as i16);
                let metadata = if matches!(
                    character.character.as_str(),
                    "Fuming" | "Dumbfounded" | "Inept" | "Awkward"
                ) {
                    i16::try_from(character.character_metadata)?
                } else {
                    0
                };
                ensure!(
                    row.try_get::<i32, _>("user_id")? == player.id
                        && row.try_get::<i16, _>("seat")? == seat as i16
                        && row.try_get::<i16, _>("character_assignment")? == assignment
                        && row.try_get::<i16, _>("character_metadata")? == metadata,
                    "Conflicting participant identity"
                );
            }
            let notes=sqlx::query("SELECT p.seat,n.card_order,n.note FROM game_participant_notes n JOIN game_participants p ON p.id=n.game_participant_id WHERE p.game_id=$1 ORDER BY p.seat,n.card_order").bind(s.game_id).fetch_all(&mut *tx).await?;
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
                    row.try_get::<i16, _>("seat")? == seat as i16
                        && row.try_get::<i16, _>("card_order")? == order as i16
                        && row.try_get::<String, _>("note")? == *note,
                    "Conflicting authored note"
                );
            }
            let rows = sqlx::query(
                "SELECT type,target,value FROM game_actions WHERE game_id=$1 ORDER BY turn",
            )
            .bind(s.game_id)
            .fetch_all(&mut *tx)
            .await?;
            ensure!(
                rows.len() == s.game.actions.len(),
                "Conflicting action count"
            );
            for (row, a) in rows.iter().zip(&s.game.actions) {
                ensure!(
                    i32::from(row.try_get::<i16, _>("type")?) == a.action_type
                        && i32::from(row.try_get::<i16, _>("target")?) == a.target
                        && i32::from(row.try_get::<i16, _>("value")?) == a.value,
                    "Conflicting action"
                );
            }
            let deck: Option<Vec<u8>> =
                sqlx::query_scalar("SELECT deck FROM game_custom_decks WHERE game_id=$1")
                    .bind(s.game_id)
                    .fetch_optional(&mut *tx)
                    .await?;
            let actual = if let Some(bytes) = deck {
                decode_deck(&bytes)?
            } else {
                hanabi_engine::create_shuffled_deck(variant, &s.seed)?
            };
            ensure!(actual == s.game.identities(), "Conflicting deck");
            let times = (
                row.try_get::<DateTime<Utc>, _>("datetime_started")?,
                row.try_get::<DateTime<Utc>, _>("datetime_finished")?,
            );
            ensure!(
                times.0.timestamp_micros() == s.started.timestamp_micros()
                    && times.1.timestamp_micros() == finished.timestamp_micros(),
                "Conflicting completion timestamps"
            );
            tx.commit().await?;
            return Ok(times);
        }
        sqlx::query("INSERT INTO games(id,name,num_players,starting_player,variant_id,timed,time_base,time_per_turn,speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)")
            .bind(s.game_id).bind(&s.name).bind(o.num_players as i16).bind(o.starting_player as i16).bind(variant.id as i16).bind(o.timed).bind(o.time_base as i32).bind(o.time_per_turn as i32).bind(o.speedrun).bind(o.card_cycle).bind(o.deck_plays).bind(o.empty_clues).bind(o.one_extra_card).bind(o.one_less_card).bind(o.all_or_nothing).bind(o.detrimental_characters).bind(&s.seed).bind(s.game.score as i16).bind(s.game.turn as i16).bind(s.game.end_condition as i16).bind(s.started).bind(finished).execute(&mut *tx).await?;
        for (seat, p) in s.players.iter().enumerate() {
            let character = &s.game.players[seat];
            let assignment = hanabi_engine::characters()
                .iter()
                .find(|c| c.name == character.character)
                .map_or(-1, |c| c.id as i16);
            let metadata = if matches!(
                character.character.as_str(),
                "Fuming" | "Dumbfounded" | "Inept" | "Awkward"
            ) {
                i16::try_from(character.character_metadata)?
            } else {
                0
            };
            let participant:i32=sqlx::query_scalar("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata) VALUES($1,$2,$3,$4,$5) RETURNING id").bind(s.game_id).bind(p.id).bind(seat as i16).bind(assignment).bind(metadata).fetch_one(&mut *tx).await?;
            for (order, note) in s.notes[seat]
                .iter()
                .enumerate()
                .filter(|(_, n)| !n.is_empty())
            {
                sqlx::query("INSERT INTO game_participant_notes(game_participant_id,card_order,note) VALUES($1,$2,$3)").bind(participant).bind(order as i16).bind(note).execute(&mut *tx).await?;
            }
        }
        let kinds: Vec<i16> = s
            .game
            .actions
            .iter()
            .map(|a| a.action_type as i16)
            .collect();
        let targets: Vec<i16> = s.game.actions.iter().map(|a| a.target as i16).collect();
        let values: Vec<i16> = s.game.actions.iter().map(|a| a.value as i16).collect();
        sqlx::query("INSERT INTO game_actions(game_id,turn,type,target,value) SELECT $1,(a.turn-1)::smallint,a.kind,a.target,a.value FROM UNNEST($2::smallint[],$3::smallint[],$4::smallint[]) WITH ORDINALITY AS a(kind,target,value,turn)").bind(s.game_id).bind(kinds).bind(targets).bind(values).execute(&mut *tx).await?;
        if s.game.identities() != hanabi_engine::create_shuffled_deck(variant, &s.seed)? {
            sqlx::query("INSERT INTO game_custom_decks(game_id,deck) VALUES($1,$2)")
                .bind(s.game_id)
                .bind(encode_deck(&s.game.identities())?)
                .execute(&mut *tx)
                .await?;
        }
        for tag in &s.tags {
            sqlx::query("INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,$2,$3)")
                .bind(s.game_id)
                .bind(tag.user)
                .bind(&tag.tag)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        self.check_state()?;
        Ok((s.started, finished))
    }
    pub async fn historical(&self, id: i32, table_id: u64, owner: i32) -> Result<Snapshot> {
        let mut tx = self.primary.begin().await?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .execute(&mut *tx)
            .await?;
        let row = sqlx::query("SELECT * FROM games WHERE id=$1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .context("Unknown replay")?;
        let options = options_from_record(&row)?;
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        let seed: String = row.try_get("seed")?;
        let custom: Option<Vec<u8>> =
            sqlx::query_scalar("SELECT deck FROM game_custom_decks WHERE game_id=$1")
                .bind(id)
                .fetch_optional(&mut *tx)
                .await?;
        let deck = if let Some(bytes) = custom {
            decode_deck(&bytes)?
        } else {
            hanabi_engine::create_shuffled_deck(variant, &seed)?
        };
        ensure!(
            deck.len() <= hanabi_engine::create_deck(variant).len()
                && deck.iter().all(|c| c.suit_index < variant.suits.len()),
            "Malformed stored deck"
        );
        let rows=sqlx::query("SELECT p.*,u.username FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=$1 ORDER BY p.seat").bind(id).fetch_all(&mut *tx).await?;
        ensure!(rows.len() == options.num_players, "Invalid replay roster");
        let mut players = vec![];
        let mut characters = vec![];
        let mut notes = vec![];
        for (seat, r) in rows.iter().enumerate() {
            ensure!(
                r.try_get::<i16, _>("seat")? == seat as i16,
                "Invalid replay seat"
            );
            players.push(Player {
                id: r.try_get("user_id")?,
                name: r.try_get("username")?,
                stats: zero_stats(),
            });
            let assignment: i16 = r.try_get("character_assignment")?;
            let character = hanabi_engine::characters()
                .iter()
                .find(|c| c.id as i16 == assignment);
            ensure!(
                assignment == -1 || character.is_some(),
                "Unknown stored character"
            );
            let name = character.map_or("", |c| c.name.as_str());
            characters.push(AssignedCharacter {
                name: name.into(),
                metadata: if matches!(name, "Fuming" | "Dumbfounded" | "Inept" | "Awkward") {
                    i32::from(r.try_get::<i16, _>("character_metadata")?)
                } else {
                    -1
                },
            });
            let mut player_notes = vec![String::new(); deck.len() + variant.suits.len()];
            for note in sqlx::query("SELECT card_order,note FROM game_participant_notes WHERE game_participant_id=$1 ORDER BY card_order").bind(r.try_get::<i32,_>("id")?).fetch_all(&mut *tx).await?{
                let order=usize::try_from(note.try_get::<i16,_>("card_order")?)?;ensure!(order<player_notes.len(),"Invalid stored note");player_notes[order]=note.try_get("note")?;
            }
            notes.push(player_notes);
        }
        let mut actions = vec![];
        for r in
            sqlx::query("SELECT type,target,value FROM game_actions WHERE game_id=$1 ORDER BY turn")
                .bind(id)
                .fetch_all(&mut *tx)
                .await?
        {
            actions.push(Action {
                kind: u8::try_from(r.try_get::<i16, _>("type")?)?,
                target: i32::from(r.try_get::<i16, _>("target")?),
                value: i32::from(r.try_get::<i16, _>("value")?),
            });
        }
        let mut tags = vec![];
        for r in
            sqlx::query("SELECT user_id,tag FROM game_tags WHERE game_id=$1 ORDER BY user_id,tag")
                .bind(id)
                .fetch_all(&mut *tx)
                .await?
        {
            tags.push(Tag {
                user: r.try_get("user_id")?,
                tag: r.try_get("tag")?,
            });
        }
        tx.commit().await?;
        let game = Game::replay(
            GameSetup {
                options,
                player_names: players.iter().map(|p| p.name.clone()).collect(),
                seed: seed.clone(),
                deck: Some(deck),
                characters: Some(characters),
                interpretation: Interpretation::LegacyReplay,
            },
            actions,
        )?;
        ensure!(
            game.score == i32::from(row.try_get::<i16, _>("score")?)
                && game.end_condition as i32 == i32::from(row.try_get::<i16, _>("end_condition")?),
            "Historical replay result mismatch"
        );
        let n = players.len();
        Ok(Snapshot {
            format: FORMAT.into(),
            table_id,
            game_id: id,
            owner,
            name: row.try_get("name")?,
            players,
            seed,
            created: Utc::now(),
            started: row.try_get("datetime_started")?,
            finished: Some(row.try_get("datetime_finished")?),
            game,
            clocks: vec![0; n],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            receipts: vec![],
            idle_remaining: 1_800_000,
            pause_player_index: -1,
            queued_pauses: vec![false; n],
            notes,
            spectator_notes: BTreeMap::new(),
            tags,
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
        ensure!(pending.len() <= 4096, "Oversized chat reservation");
        let ids:Vec<i64>=sqlx::query_scalar("SELECT nextval(pg_get_serial_sequence('chat_log','id')) FROM generate_series(1,$1::integer)").bind(pending.len() as i32).fetch_all(&self.archive).await?;
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
            chat.message["datetime"] =
                json!(datetime.to_rfc3339_opts(chrono::SecondsFormat::Micros, true));
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
            sqlx::query("SELECT pg_advisory_xact_lock(17484,$1)")
                .bind(id)
                .execute(&mut *tx)
                .await?;
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
                datetime.timestamp_subsec_nanos() % 1000 == 0,
                "Chat timestamp must use PostgreSQL precision before checkpointing"
            );
            sqlx::query("INSERT INTO chat_log(id,user_id,message,room,source,datetime_sent) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING")
                .bind(id).bind(entry.user).bind(msg).bind(room).bind(source).bind(datetime).execute(&mut *tx).await?;
            let existing = sqlx::query(
                "SELECT user_id,message,room,source,datetime_sent FROM chat_log WHERE id=$1",
            )
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
            ensure!(
                existing.try_get::<i32, _>("user_id")? == entry.user
                    && existing.try_get::<String, _>("message")? == msg
                    && existing.try_get::<String, _>("room")? == room
                    && existing.try_get::<String, _>("source")? == source
                    && existing.try_get::<DateTime<Utc>, _>("datetime_sent")? == datetime,
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
        sqlx::query("SELECT id FROM games WHERE id=$1 FOR UPDATE")
            .bind(edit.game_id)
            .fetch_one(&mut *tx)
            .await?;
        self.check_state()?;
        match edit.operation.as_str() {
            "tag" => {
                sqlx::query("INSERT INTO game_tags(game_id,user_id,tag) SELECT $1,$2,$3 WHERE NOT EXISTS(SELECT 1 FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3)").bind(edit.game_id).bind(edit.user_id).bind(&edit.tag).execute(&mut *tx).await?;
            }
            "tagDelete" => {
                sqlx::query("DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2 AND tag=$3")
                    .bind(edit.game_id)
                    .bind(edit.user_id)
                    .bind(&edit.tag)
                    .execute(&mut *tx)
                    .await?;
            }
            "tagsDeleteAll" => {
                sqlx::query("DELETE FROM game_tags WHERE game_id=$1 AND user_id=$2")
                    .bind(edit.game_id)
                    .bind(edit.user_id)
                    .execute(&mut *tx)
                    .await?;
            }
            _ => anyhow::bail!("Invalid durable tag operation"),
        }
        let mut tags = vec![];
        for row in
            sqlx::query("SELECT user_id,tag FROM game_tags WHERE game_id=$1 ORDER BY user_id,tag")
                .bind(edit.game_id)
                .fetch_all(&mut *tx)
                .await?
        {
            tags.push(Tag {
                user: row.try_get("user_id")?,
                tag: row.try_get("tag")?,
            });
        }
        tx.commit().await?;
        self.check_state()?;
        Ok(tags)
    }
    pub async fn tags_for_game(&self, id: i32) -> Result<Option<Vec<Tag>>> {
        let rows=sqlx::query("SELECT t.user_id,t.tag FROM games g LEFT JOIN game_tags t ON t.game_id=g.id WHERE g.id=$1 ORDER BY t.user_id,t.tag").bind(id).fetch_all(&self.primary).await?;
        if rows.is_empty() {
            return Ok(None);
        }
        let mut tags = vec![];
        for row in rows {
            if let Some(tag) = row.try_get::<Option<String>, _>("tag")? {
                tags.push(Tag {
                    user: row.try_get::<i32, _>("user_id")?,
                    tag,
                });
            }
        }
        Ok(Some(tags))
    }
    pub async fn player(&self, id: i32, name: String) -> Result<Player> {
        self.player_for_variant(id, name, 0).await
    }
    pub async fn player_for_variant(&self, id: i32, name: String, variant: u32) -> Result<Player> {
        let count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM game_participants WHERE user_id=$1")
                .bind(id)
                .fetch_one(&self.primary)
                .await?;
        let row = sqlx::query("SELECT * FROM user_stats WHERE user_id=$1 AND variant_id=$2")
            .bind(id)
            .bind(variant as i16)
            .fetch_optional(&self.primary)
            .await?;
        let mut stats = zero_stats();
        stats["numGames"] = json!(count);
        if let Some(row) = row {
            stats["variant"]["numGames"] = json!(row.try_get::<i32, _>("num_games")?);
            stats["variant"]["averageScore"] = json!(row.try_get::<f64, _>("average_score")?);
            stats["variant"]["numStrikeouts"] = json!(row.try_get::<i32, _>("num_strikeouts")?);
            for count in 2..=6 {
                stats["variant"]["bestScores"][count - 2]["score"] =
                    json!(row.try_get::<i16, _>(format!("best_score{count}").as_str())?);
            }
        }
        Ok(Player { id, name, stats })
    }
    pub async fn seed_count(&self, seed: &str) -> Result<i64> {
        Ok(
            sqlx::query_scalar("SELECT count(*) FROM games WHERE seed=$1")
                .bind(seed)
                .fetch_one(&self.primary)
                .await?,
        )
    }
    pub async fn next_seed(
        &self,
        players: &[Player],
        variant: u32,
        count: usize,
        suffix: &str,
    ) -> Result<String> {
        let prefix = format!("p{count}v{variant}s");
        if !suffix.is_empty() {
            return Ok(prefix + suffix);
        }
        let ids = players.iter().map(|p| p.id).collect::<Vec<_>>();
        let seeds:Vec<String>=sqlx::query_scalar("SELECT DISTINCT g.seed FROM games g JOIN game_participants p ON p.game_id=g.id WHERE p.user_id=ANY($1) OR p.user_id IN (SELECT linked_id FROM user_linkages WHERE user_id=ANY($1))").bind(ids).fetch_all(&self.primary).await?;
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
    async fn refresh(&self, s: &Snapshot) -> Result<()> {
        let variant = hanabi_engine::get_variant(&s.game.options.variant_name)?;
        let v = variant.id as i16;
        let n = s.players.len();
        let mut tx = self.archive.begin().await?;
        sqlx::query("SELECT pg_advisory_xact_lock(17483,$1)")
            .bind(i32::from(v))
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO seeds(seed,num_games) VALUES($1,(SELECT count(*) FROM games WHERE seed=$1)) ON CONFLICT(seed) DO UPDATE SET num_games=excluded.num_games").bind(&s.seed).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO variant_stats(variant_id) VALUES($1) ON CONFLICT DO NOTHING")
            .bind(v)
            .execute(&mut *tx)
            .await?;
        let modifier = i16::from(s.game.options.deck_plays)
            + 2 * i16::from(s.game.options.empty_clues)
            + 4 * i16::from(s.game.options.one_extra_card)
            + 8 * i16::from(s.game.options.one_less_card)
            + 16 * i16::from(s.game.options.all_or_nothing);
        for p in &s.players {
            sqlx::query(
                "INSERT INTO user_stats(user_id,variant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            )
            .bind(p.id)
            .bind(v)
            .execute(&mut *tx)
            .await?;
            let q = format!(
                "UPDATE user_stats SET best_score{n}=GREATEST(best_score{n},$3),best_score{n}_mod=CASE WHEN $3>best_score{n} OR ($3=best_score{n} AND $4<best_score{n}_mod) THEN $4 ELSE best_score{n}_mod END,num_games=s.n,average_score=s.avg,num_strikeouts=s.strikes FROM (SELECT count(*)::integer n,COALESCE(avg(g.score) FILTER(WHERE g.score<>0),0)::float8 avg,(count(*) FILTER(WHERE g.score=0))::integer strikes FROM games g JOIN game_participants p ON p.game_id=g.id WHERE p.user_id=$1 AND g.variant_id=$2 AND NOT g.speedrun) s WHERE user_id=$1 AND variant_id=$2"
            );
            sqlx::query(&q)
                .bind(p.id)
                .bind(v)
                .bind(s.game.score as i16)
                .bind(modifier)
                .execute(&mut *tx)
                .await?;
        }
        let q = format!(
            "UPDATE variant_stats SET best_score{n}=CASE WHEN $4::smallint=0 THEN GREATEST(best_score{n},$2) ELSE best_score{n} END,num_games=s.n,num_max_scores=s.maximum,average_score=s.avg,num_strikeouts=s.strikes FROM (SELECT count(*)::integer n,(count(*) FILTER(WHERE score=$3))::integer maximum,COALESCE(avg(score) FILTER(WHERE score<>0),0)::float8 avg,(count(*) FILTER(WHERE score=0))::integer strikes FROM games WHERE variant_id=$1 AND NOT speedrun) s WHERE variant_id=$1"
        );
        sqlx::query(&q)
            .bind(v)
            .bind(s.game.score as i16)
            .bind(variant.max_score as i16)
            .bind(modifier)
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
        self.primary.close().await;
        result
    }
}
pub fn zero_stats() -> Value {
    json!({"numGames":0,"variant":{"numGames":0,"averageScore":0,"numStrikeouts":0,"bestScores":(2..=6).map(|n|json!({"numPlayers":n,"score":0,"modifier":0,"deckPlays":false,"emptyClues":false,"oneExtraCard":false,"oneLessCard":false,"allOrNothing":false})).collect::<Vec<_>>()}})
}
pub fn options_from_record(row: &sqlx::postgres::PgRow) -> Result<Options> {
    let variant =
        hanabi_engine::get_variant_by_id(u32::try_from(row.try_get::<i16, _>("variant_id")?)?)?;
    Ok(Options {
        num_players: usize::try_from(row.try_get::<i16, _>("num_players")?)?,
        starting_player: usize::try_from(row.try_get::<i16, _>("starting_player")?)?,
        variant_name: variant.name.clone(),
        variant_id: Some(variant.id),
        timed: row.try_get("timed")?,
        time_base: f64::from(row.try_get::<i32, _>("time_base")?),
        time_per_turn: i64::from(row.try_get::<i32, _>("time_per_turn")?),
        speedrun: row.try_get("speedrun")?,
        card_cycle: row.try_get("card_cycle")?,
        deck_plays: row.try_get("deck_plays")?,
        empty_clues: row.try_get("empty_clues")?,
        one_extra_card: row.try_get("one_extra_card")?,
        one_less_card: row.try_get("one_less_card")?,
        all_or_nothing: row.try_get("all_or_nothing")?,
        detrimental_characters: row.try_get("detrimental_characters")?,
        table_name: None,
        max_players: None,
    })
}
pub fn validate_standard_record(row: &sqlx::postgres::PgRow) -> Result<()> {
    options_from_record(row)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        actors::{Hub, HubCommand, TableCommand},
        model::ExtraOptions,
        test_redis::RedisFixture,
        transport::Session,
    };
    use std::{str::FromStr, sync::Arc};
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
            receipts: vec![],
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
                receipts: vec![],
                idle_remaining: 1_800_000,
                pause_player_index: -1,
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
    async fn database() -> Result<Option<(PgPool, PgPool, String)>> {
        let Ok(url) = std::env::var("HANABI_TEST_DATABASE_URL") else {
            eprintln!("PostgreSQL integration requires HANABI_TEST_DATABASE_URL");
            return Ok(None);
        };
        let options = PgConnectOptions::from_str(&url)?;
        ensure!(
            matches!(options.get_host(), "localhost" | "127.0.0.1")
                || options.get_host().starts_with('/'),
            "Disposable local PostgreSQL required"
        );
        let admin = PgPoolOptions::new()
            .max_connections(1)
            .connect_with(options.clone())
            .await?;
        let name = format!("ts_slice_{:032x}", rand::random::<u128>());
        sqlx::query(&format!("CREATE DATABASE {name}"))
            .execute(&admin)
            .await?;
        let pool = PgPoolOptions::new()
            .max_connections(6)
            .connect_with(options.database(&name))
            .await?;
        sqlx::raw_sql(include_str!("../../../install/database_schema.sql"))
            .execute(&pool)
            .await?;
        sqlx::query("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES(1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1'),(3,'Cathy','cathy','test','127.0.0.1')").execute(&pool).await?;
        Ok(Some((admin, pool, name)))
    }
    async fn cleanup(admin: PgPool, name: String) -> Result<()> {
        sqlx::query(&format!("DROP DATABASE {name} WITH (FORCE)"))
            .execute(&admin)
            .await?;
        admin.close().await;
        Ok(())
    }
    #[tokio::test]
    async fn redis_is_sole_authority_and_terminal_archive_is_atomic_and_retryable() -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
            return Ok(());
        };
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
            let old: i64 = sqlx::query_scalar("SELECT count(*) FROM active_games")
                .fetch_one(&store.primary)
                .await?;
            ensure!(old == 0, "PG active mirror exists");
            terminal(&mut table)?;
            let revision = store.save(&table, 2).await?;
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
            let games: i64 = sqlx::query_scalar("SELECT count(*) FROM games")
                .fetch_one(&store.primary)
                .await?;
            ensure!(games == 0, "Partial PG transaction escaped");
            ensure!(
                store
                    .state()?
                    .get(StateId::Table(id))
                    .await?
                    .unwrap()
                    .revision
                    == revision,
                "Terminal Redis state lost"
            );
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
            let actions: i64 = sqlx::query_scalar("SELECT count(*) FROM game_actions")
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
            sqlx::query("ALTER TABLE game_tags ADD CONSTRAINT reject_native_tag CHECK(tag <> 'recovered-tag')").execute(&store.primary).await?;
            ensure!(store.load().await.is_err(),"Rejected replay tag was not surfaced");
            sqlx::query("ALTER TABLE game_tags DROP CONSTRAINT reject_native_tag").execute(&store.primary).await?;
            let recovered=store.load().await?;
            ensure!(recovered[0].0.pending_tag.is_none()&&recovered[0].0.game().unwrap().tags.iter().any(|t|t.tag=="recovered-tag"),"Replay tag intent was not recovered");
            store.load().await?;
            let tags:i64=sqlx::query_scalar("SELECT count(*) FROM game_tags WHERE tag='recovered-tag'").fetch_one(&store.primary).await?;
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
        cleanup(admin, name).await?;
        result
    }

    #[tokio::test]
    async fn interrupted_split_recovers_reserved_destination_without_duplicate_membership()
    -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
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
        cleanup(admin, name).await?;
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
            command: command.into(),
            data,
            reply,
        })
        .await?;
        tokio::time::timeout(Duration::from_secs(10), received).await???;
        Ok(())
    }
    #[tokio::test]
    async fn reserved_chat_ids_survive_failure_and_concurrent_retries_without_conflating_messages()
    -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
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
            ensure!(table.chat[0].message["datetime"]=="2026-11-02T20:00:00.123456Z","Timestamp was not canonicalized before durability");
            store.save(&table,0).await?;
            sqlx::query(&format!("ALTER TABLE chat_log ADD CONSTRAINT reject_reserved_chat CHECK(id <> {})",ids[2])).execute(&store.primary).await?;
            ensure!(store.archive_chat(&table.chat).await.is_err(),"Partial archive failure was not surfaced");
            let rows:i64=sqlx::query_scalar("SELECT count(*) FROM chat_log WHERE id=ANY($1)").bind(&ids).fetch_one(&store.primary).await?;
            ensure!(rows==0,"Failed chat batch escaped rollback");
            sqlx::query("ALTER TABLE chat_log DROP CONSTRAINT reject_reserved_chat").execute(&store.primary).await?;
            let (left,right)=tokio::join!(store.archive_chat(&table.chat),store.archive_chat(&table.chat));
            left?;right?;
            let rows:i64=sqlx::query_scalar("SELECT count(*) FROM chat_log WHERE id=ANY($1)").bind(&ids).fetch_one(&store.primary).await?;
            ensure!(rows==3,"Concurrent retries duplicated or conflated legitimate chat");
            let mut conflicting=table.chat[0].clone();conflicting.message["msg"]=json!("conflicting payload");
            ensure!(store.archive_chat(&[conflicting]).await.is_err(),"Conflicting content reused a durable chat identity");
            let recovered=store.load().await?;
            ensure!(recovered[0].0.chat_archived==3&&recovered[0].0.chat.iter().map(|c|c.id.unwrap()).collect::<Vec<_>>()==ids,"Recovery changed reserved chat identities");
            store.remove(id,recovered[0].1).await?;
            Ok::<(),anyhow::Error>(())
        }.await;
        store.close().await?;
        cleanup(admin, name).await?;
        result
    }

    #[tokio::test]
    async fn expired_owner_waiting_on_pg_locks_cannot_reapply_chat_or_tag_mutations() -> Result<()>
    {
        let Some((admin, pool, name)) = database().await? else {
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
        sqlx::query("SELECT id FROM games WHERE id=1 FOR UPDATE")
            .execute(&mut *blocker)
            .await?;
        sqlx::query("SELECT pg_advisory_xact_lock(17484,$1)")
            .bind(chat_id)
            .execute(&mut *blocker)
            .await?;
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
                let waiting:i64=sqlx::query_scalar("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'").fetch_one(&store.primary).await?;
                if waiting>=2{return Ok::<(),anyhow::Error>(());}
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        }).await??;
        state.close().await?;
        let replacement = RedisState::connect(&redis.url, "native-postgres-fence").await?;
        let current = Store::fixture(store.primary.clone(), replacement);
        sqlx::query("INSERT INTO game_tags(game_id,user_id,tag) VALUES(1,1,'new-owner')")
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
            sqlx::query_scalar("SELECT tag FROM game_tags WHERE game_id=1 ORDER BY tag")
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
        let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM chat_log WHERE id=$1")
            .bind(chat_id)
            .fetch_one(&current.primary)
            .await?;
        ensure!(rows == 1, "Replacement did not archive exactly once");
        current.remove(id, revision).await?;
        current.close().await?;
        cleanup(admin, name).await?;
        Ok(())
    }

    #[tokio::test]
    async fn auto_start_archives_chat_and_last_replay_departure_retires_table() -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-auto-chat-retire").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            tasks.clone(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) = Session::new(index as i32 + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                welcome: json!({}),
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
            send(&hub,users[0].clone(),"chat",json!({"tableID":id,"room":format!("table{id}"),"msg":"/s2"})).await?;
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
            send(&hub,users[0].clone(),"chat",json!({"tableID":id,"room":format!("table{id}"),"msg":"retained authored chat"})).await?;
            send(&hub,users[0].clone(),"tableTerminate",json!({"tableID":id})).await?;
            let rows:i64=sqlx::query_scalar("SELECT count(*) FROM chat_log WHERE user_id=1 AND source='user' AND room=$1 AND message='retained authored chat'").bind(format!("table{id}")).fetch_one(&store.primary).await?;
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
        cleanup(admin, name).await?;
        result
    }

    #[tokio::test]
    async fn actual_actor_split_replay_hypothetical_and_restart_are_durable() -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-split-replay").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            tasks.clone(),
        )
        .await?;
        let mut users = vec![];
        let mut outgoing = vec![];
        for (index, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, frames) = Session::new(index as i32 + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                welcome: json!({}),
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
                json!({"tableID":id,"room":format!("table{id}"),"msg":"/split Bob"}),
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
                json!({"tableID":id,"type":3}),
            )
            .await?;
            let raw = " { \"type\": \"turn\", \"num\": 7 } ";
            send(
                &hub,
                users[0].clone(),
                "replayAction",
                json!({"tableID":id,"type":5,"actionJSON":raw}),
            )
            .await?;
            let tables = store.load().await?;
            let source = tables.iter().find(|(t, _)| t.id == id).unwrap();
            let Phase::Replay { replay, .. } = &source.0.phase else {
                anyhow::bail!("Not a replay");
            };
            ensure!(
                replay.hypothetical.is_some() && replay.hypothetical_actions == vec![raw],
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
        cleanup(admin, name).await?;
        result
    }

    #[tokio::test]
    async fn actors_run_multiplayer_variants_and_recover_all_runtime_mutations() -> Result<()> {
        let Some((admin, pool, name)) = database().await? else {
            return Ok(());
        };
        let redis = RedisFixture::start(true).await?;
        let state = RedisState::connect(&redis.url, "native-actors-integration").await?;
        let store = Store::fixture(pool, state);
        let tasks = TaskTracker::new();
        let hub = Hub::start(
            store.clone(),
            Arc::new(vec!["alpha".into(), "beta".into(), "gamma".into()]),
            tasks.clone(),
        )
        .await?;
        let mut users = vec![];
        let mut frames = vec![];
        for (i, name) in ["Alice", "Bob", "Cathy"].iter().enumerate() {
            let (session, outgoing) = Session::new(i as i32 + 1, (*name).into(), 1, false);
            let (reply, received) = oneshot::channel();
            hub.send(HubCommand::Register {
                session: session.clone(),
                welcome: json!({}),
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
            send(&hub,users[0].clone(),"tableStart",json!({"tableID":id,"requestID":"start"})).await?;
            let loaded=store.load().await?;let s=loaded[0].0.game().unwrap();ensure!(s.players.len()==3&&s.game.stacks.len()==6&&s.game.clue_tokens==16,"Native variant ignored");
            let active=s.game.active_player_index;let actor=s.players[active].id as usize-1;
            send(&hub,users[actor].clone(),"loaded",json!({"tableID":id})).await?;
            send(&hub,users[actor].clone(),"pause",json!({"tableID":id,"setting":"pause","requestID":"pause"})).await?;
            send(&hub,users[actor].clone(),"pause",json!({"tableID":id,"setting":"pause","requestID":"pause"})).await?;
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
        cleanup(admin, name).await?;
        result
    }
}
