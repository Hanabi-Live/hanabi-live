//! TEMPORARY Go-to-Rust cutover bridge. Delete this module, its CLI/Store hooks,
//! state::go_cutover helpers, and Go's cutover endpoint/marker after the permanent switch.
use crate::{
    game::{Game, Options},
    model::{
        ExtraOptions, FORMAT, Phase, Player, Receipt, Snapshot, TableChat, TableSnapshot, Tag,
    },
    state::{StateId, StoredState},
    store::Store,
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::{EndCondition, EngineState};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::{BTreeMap, HashSet};

const STAGE_FORMAT: &str = "hanabi-go-cutover-1";
const MAX_TABLES: usize = 256;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Stage {
    format: String,
    game_id: i32,
    source_revision: i64,
    source_hash: String,
    table: TableSnapshot,
}

fn known_fields(value: &Value, allowed: &[&str]) -> Result<()> {
    let object = value.as_object().context("Expected Go snapshot object")?;
    ensure!(
        object.keys().all(|key| allowed.contains(&key.as_str())),
        "Go snapshot contains unsupported fields; update the temporary bridge before importing"
    );
    Ok(())
}

fn field<T: DeserializeOwned>(value: &Value, key: &str) -> Result<T> {
    serde_json::from_value(
        value
            .get(key)
            .with_context(|| format!("Missing Go field {key}"))?
            .clone(),
    )
    .with_context(|| format!("Invalid Go field {key}"))
}

fn array<'a>(value: &'a Value, key: &str, max: usize) -> Result<&'a Vec<Value>> {
    let values = value
        .get(key)
        .and_then(Value::as_array)
        .with_context(|| format!("Missing Go array {key}"))?;
    ensure!(values.len() <= max, "Oversized Go array {key}");
    Ok(values)
}

fn time(value: &Value, key: &str) -> Result<DateTime<Utc>> {
    let result: DateTime<Utc> = field(value, key)?;
    ensure!(result.timestamp() > 0, "Missing Go timestamp {key}");
    Ok(result)
}

fn camel(value: &Value) -> Result<Value> {
    let object = value.as_object().context("Expected Go object")?;
    let mut result = serde_json::Map::new();
    for (key, value) in object {
        let mut chars = key.chars();
        let first = chars.next().context("Empty Go field")?;
        let name = first.to_ascii_lowercase().to_string() + chars.as_str();
        result.insert(name, value.clone());
    }
    Ok(Value::Object(result))
}

fn optional_array<T: DeserializeOwned>(value: &Value, key: &str) -> Result<Option<Vec<T>>> {
    let result: Option<Vec<T>> = field(value, key)?;
    Ok(result.filter(|items| !items.is_empty()))
}

pub(crate) fn convert(raw: &str, game_id: i32) -> Result<TableSnapshot> {
    ensure!(raw.len() <= 4 * 1024 * 1024, "Oversized Go checkpoint");
    let source: Value = serde_json::from_str(raw)?;
    known_fields(
        &source,
        &[
            "SnapshotVersion",
            "SavedAt",
            "ID",
            "Name",
            "InitialName",
            "Players",
            "MaxPlayers",
            "OwnerID",
            "OwnerUsername",
            "Visible",
            "PasswordHash",
            "Running",
            "Replay",
            "AutomaticStart",
            "Progress",
            "DatetimeCreated",
            "DatetimeLastJoined",
            "DatetimePlannedStart",
            "DatetimeLastAction",
            "Game",
            "Options",
            "ExtraOptions",
            "Chat",
            "ChatRead",
            "ProcessedRequests",
        ],
    )?;
    ensure!(
        field::<i32>(&source, "SnapshotVersion")? == 2,
        "Only Go snapshot version 2 is supported"
    );
    ensure!(
        field::<bool>(&source, "Running")? && !field::<bool>(&source, "Replay")?,
        "Go checkpoint is not a live game"
    );
    let saved = time(&source, "SavedAt")?;
    let id: u64 = field(&source, "ID")?;
    let owner: i32 = field(&source, "OwnerID")?;
    let name: String = field(&source, "Name")?;
    let created = time(&source, "DatetimeCreated")?;
    let game = source.get("Game").context("Missing Go game")?;
    known_fields(
        game,
        &[
            "DatabaseID",
            "DatetimeStarted",
            "DatetimeFinished",
            "Players",
            "Seed",
            "Variant",
            "Deck",
            "CardIdentities",
            "DeckIndex",
            "Stacks",
            "StackStarts",
            "PlayStackDirections",
            "Turn",
            "DatetimeTurnBegin",
            "TurnsInverted",
            "ActivePlayerIndex",
            "ClueTokens",
            "Score",
            "MaxScore",
            "Strikes",
            "LastClueTypeGiven",
            "Actions",
            "Actions2",
            "InvalidActionOccurred",
            "EndCondition",
            "EndPlayer",
            "EndTurn",
            "StartedTimer",
            "Paused",
            "PausePlayerIndex",
            "PauseCount",
            "EfficiencyMod",
            "Hypothetical",
            "HypoActions",
            "HypoShowDrawnCards",
            "Tags",
        ],
    )?;
    ensure!(
        game_id > 0 && field::<i32>(game, "DatabaseID")? == game_id,
        "Go game identity mismatch"
    );
    ensure!(
        !field::<bool>(game, "Hypothetical")?,
        "Unsupported Go hypothetical state"
    );
    let extra = source
        .get("ExtraOptions")
        .context("Missing Go extra options")?;
    known_fields(
        extra,
        &[
            "DatabaseID",
            "NoWriteToDatabase",
            "JSONReplay",
            "CustomNumPlayers",
            "CustomCharacterAssignments",
            "CustomSeed",
            "CustomDeck",
            "CustomDeckIsShuffled",
            "CustomActions",
            "Restarted",
            "SetSeedSuffix",
            "SetReplay",
            "SetReplayTurn",
            "PrecomputedSeed",
        ],
    )?;
    ensure!(
        !field::<bool>(extra, "NoWriteToDatabase")? && !field::<bool>(extra, "JSONReplay")?,
        "Non-durable Go game cannot be imported"
    );
    let mut options: Options = field(&source, "Options")?;
    let variant = hanabi_engine::get_variant(&options.variant_name)?;
    let serialized_variant = game.get("Variant").context("Missing Go variant")?;
    ensure!(
        field::<String>(serialized_variant, "Name")? == variant.name
            && field::<u32>(serialized_variant, "ID")? == variant.id,
        "Go variant does not match the catalog"
    );
    options.variant_id = Some(variant.id);
    let go_players = array(&source, "Players", 6)?;
    let game_players = array(game, "Players", 6)?;
    ensure!(
        (2..=6).contains(&go_players.len()) && game_players.len() == go_players.len(),
        "Invalid Go roster"
    );
    let mut deck = array(game, "Deck", 60)?
        .iter()
        .map(camel)
        .collect::<Result<Vec<_>>>()?;
    let identities = array(game, "CardIdentities", 60)?;
    ensure!(identities.len() == deck.len(), "Go identity count mismatch");
    for (index, (card, identity)) in deck.iter().zip(identities).enumerate() {
        ensure!(
            card["order"] == index
                && card["suitIndex"] == identity["suitIndex"]
                && card["rank"] == identity["rank"],
            "Go deck identity mismatch"
        );
    }
    let mut players = vec![];
    let mut engine_players = vec![];
    let mut clocks_ns = vec![];
    let mut notes = vec![];
    let mut queued = vec![];
    let mut votes = vec![];
    let mut held = HashSet::new();
    for (index, (player, gp)) in go_players.iter().zip(game_players).enumerate() {
        known_fields(
            player,
            &[
                "UserID",
                "Name",
                "Present",
                "Stats",
                "Typing",
                "LastTyped",
                "VoteToKill",
            ],
        )?;
        known_fields(
            gp,
            &[
                "Name",
                "Index",
                "Hand",
                "Time",
                "Notes",
                "RequestedPause",
                "Character",
                "CharacterMetadata",
            ],
        )?;
        let user_id: i32 = field(player, "UserID")?;
        let player_name: String = field(player, "Name")?;
        ensure!(
            field::<usize>(gp, "Index")? == index && field::<String>(gp, "Name")? == player_name,
            "Go player identity mismatch"
        );
        players.push(Player {
            id: user_id,
            name: player_name.clone(),
            stats: field(player, "Stats")?,
        });
        let mut hand = vec![];
        for card in array(gp, "Hand", 6)? {
            let order: usize = field(card, "Order")?;
            ensure!(
                order < deck.len() && held.insert(order),
                "Invalid Go hand identity"
            );
            let current = camel(card)?;
            ensure!(
                current["suitIndex"] == deck[order]["suitIndex"]
                    && current["rank"] == deck[order]["rank"],
                "Go hand/deck mismatch"
            );
            deck[order] = current;
            hand.push(order);
        }
        engine_players.push(json!({"name":player_name,"index":index,"hand":hand,
            "character":field::<String>(gp,"Character")?,"characterMetadata":field::<i32>(gp,"CharacterMetadata")?}));
        clocks_ns.push(field::<i64>(gp, "Time")?);
        notes.push(field(gp, "Notes")?);
        queued.push(field(gp, "RequestedPause")?);
        votes.push(field(player, "VoteToKill")?);
    }
    let mut engine =
        json!({"options":options,"interpretation":"live","players":engine_players,"deck":deck});
    for key in [
        "Seed",
        "DeckIndex",
        "Stacks",
        "StackStarts",
        "PlayStackDirections",
        "Turn",
        "TurnsInverted",
        "ActivePlayerIndex",
        "ClueTokens",
        "Score",
        "MaxScore",
        "Strikes",
        "LastClueTypeGiven",
        "EndCondition",
        "EndPlayer",
        "EndTurn",
        "StartedTimer",
        "Paused",
    ] {
        let mut chars = key.chars();
        let target = chars
            .next()
            .expect("nonempty")
            .to_ascii_lowercase()
            .to_string()
            + chars.as_str();
        engine[&target] = game
            .get(key)
            .with_context(|| format!("Missing Go engine field {key}"))?
            .clone();
    }
    array(game, "Actions", 4096)?;
    engine["events"] = field(game, "Actions")?;
    // Go nil slices are legitimate when no player has acted yet.
    engine["actions"] = json!(
        optional_array::<hanabi_engine::RecordedAction>(game, "Actions2")?.unwrap_or_default()
    );
    let engine: EngineState = hanabi_engine::parse_engine_state(engine)?;
    let started = time(game, "DatetimeStarted")?;
    let finished = if engine.end_condition == EndCondition::InProgress {
        None
    } else {
        Some(time(game, "DatetimeFinished")?)
    };
    let duration = (finished.unwrap_or(saved) - started).num_milliseconds();
    let mut turn_elapsed = 0;
    if engine.end_condition == EndCondition::InProgress && engine.started_timer && !engine.paused {
        let elapsed = (saved - time(game, "DatetimeTurnBegin")?)
            .num_nanoseconds()
            .context("Go clock interval overflow")?
            .max(0);
        let clock = &mut clocks_ns[engine.active_player_index];
        *clock = clock.checked_sub(elapsed).context("Go clock overflow")?;
        turn_elapsed = elapsed / 1_000_000;
    }
    let last_action: DateTime<Utc> = field(&source, "DatetimeLastAction")?;
    let idle = if last_action.timestamp() <= 0 {
        1_800_000
    } else {
        (1_800_000 - (saved - last_action).num_milliseconds().max(0)).max(0)
    };
    let mut receipts = vec![];
    if let Some(requests) = source.get("ProcessedRequests") {
        let requests: BTreeMap<String, bool> = serde_json::from_value(requests.clone())?;
        for (key, accepted) in requests {
            ensure!(accepted, "Invalid Go request receipt");
            let (user, request) = key.split_once(':').context("Invalid Go receipt key")?;
            receipts.push(Receipt {
                user: user.parse()?,
                id: request.into(),
            });
        }
    }
    let tags: Option<BTreeMap<String, i32>> = field(game, "Tags")?;
    let snapshot = Snapshot {
        format: FORMAT.into(),
        table_id: id,
        game_id,
        owner,
        name: name.clone(),
        players,
        seed: engine.seed.clone(),
        created,
        started,
        finished,
        game: Game(engine),
        clocks: clocks_ns.iter().map(|value| value / 1_000_000).collect(),
        duration,
        turn_elapsed,
        timer_started: field(game, "StartedTimer")?,
        receipts: receipts.clone(),
        idle_remaining: idle,
        pause_player_index: field(game, "PausePlayerIndex")?,
        queued_pauses: queued,
        notes,
        spectator_notes: BTreeMap::new(),
        tags: tags
            .unwrap_or_default()
            .into_iter()
            .map(|(tag, user)| Tag { user, tag })
            .collect(),
        votes,
        maintenance_applied: false,
    };
    let mut chat = vec![];
    let go_chat: Option<Vec<Value>> = field(&source, "Chat")?;
    for message in go_chat.unwrap_or_default() {
        known_fields(
            &message,
            &["UserID", "Username", "Msg", "Datetime", "Server"],
        )?;
        chat.push(TableChat {
            id: None, user: field(&message, "UserID")?,
            message: json!({"who":field::<String>(&message,"Username")?, "msg":field::<String>(&message,"Msg")?,
                "datetime":time(&message,"Datetime")?, "room":format!("table{id}"),
                "source":if field::<bool>(&message,"Server")? {"server"} else {"user"}}),
        });
    }
    let custom_seed: String = field(extra, "CustomSeed")?;
    let password: String = field(&source, "PasswordHash")?;
    let table = TableSnapshot {
        format: FORMAT.into(),
        id,
        name,
        owner,
        visible: field(&source, "Visible")?,
        options,
        max_players: field(&source, "MaxPlayers")?,
        password_hash: (!password.is_empty()).then_some(password),
        extra: ExtraOptions {
            custom_seed: (!custom_seed.is_empty()).then_some(custom_seed),
            custom_deck: optional_array(extra, "CustomDeck")?,
            custom_deck_is_shuffled: field(extra, "CustomDeckIsShuffled")?,
            custom_actions: optional_array(extra, "CustomActions")?.unwrap_or_default(),
            custom_characters: optional_array(extra, "CustomCharacterAssignments")?,
            custom_num_players: match field::<usize>(extra, "CustomNumPlayers")? {
                0 => None,
                n => Some(n),
            },
            no_write_to_database: false,
            set_seed_suffix: field(extra, "SetSeedSuffix")?,
            set_replay: field(extra, "SetReplay")?,
            set_replay_turn: field(extra, "SetReplayTurn")?,
        },
        created,
        phase: Phase::Live {
            snapshot: Box::new(snapshot),
        },
        chat,
        chat_archived: 0,
        receipts,
        shadows: BTreeMap::new(),
        pending_spawn: None,
        retire_after_spawn: false,
        pending_tag: None,
    };
    table.validate()?;
    Ok(table)
}

fn source_hash(payload: &str) -> String {
    hex::encode(Sha256::digest(payload.as_bytes()))
}

/// Offline only: the Go cutover endpoint must have drained/stopped the old server.
pub async fn import(store: &Store) -> Result<usize> {
    let state = store.state()?;
    let mut transaction = store.archive.begin().await?;
    sqlx::query("SET LOCAL idle_in_transaction_session_timeout=300000")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("SELECT pg_advisory_xact_lock(17482,0)")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("LOCK TABLE active_games IN SHARE ROW EXCLUSIVE MODE")
        .execute(&mut *transaction)
        .await?;
    store.require_offline_database().await?;
    let rows = sqlx::query(
        "SELECT game_id,revision,checkpoint FROM active_games ORDER BY game_id LIMIT 257",
    )
    .fetch_all(&mut *transaction)
    .await?;
    ensure!(
        rows.len() <= MAX_TABLES,
        "Too many Go tables for one cutover"
    );
    let records = state.load().await?;
    let mut stages = BTreeMap::<i32, (Stage, i64)>::new();
    let mut native = BTreeMap::<u64, StoredState>::new();
    for record in records {
        match record.id {
            StateId::Game(id) => {
                let stage: Stage = serde_json::from_str(&record.payload)?;
                ensure!(
                    stage.format == STAGE_FORMAT
                        && stage.game_id == id
                        && stage.source_revision > 0
                        && stage.source_hash.len() == 64,
                    "Invalid Go cutover journal"
                );
                stage.table.validate()?;
                ensure!(
                    stage.table.game().is_some_and(|game| game.game_id == id),
                    "Cutover journal identity mismatch"
                );
                stages.insert(id, (stage, record.revision));
            }
            StateId::Table(id) => {
                native.insert(id, record);
            }
        }
    }
    if rows.is_empty() && stages.is_empty() {
        transaction.commit().await?;
        return Ok(0);
    }
    ensure!(stages.len() <= MAX_TABLES, "Oversized Go cutover journal");
    if !rows.is_empty() {
        ensure!(
            native.is_empty(),
            "Go source and promoted Rust tables overlap; keep both servers stopped"
        );
        if stages.is_empty() {
            ensure!(
                state.go_cutover_counter().await? == 0,
                "Go cutover requires a fresh Redis namespace"
            );
        }
        let ids: HashSet<i32> = rows.iter().map(|row| row.get("game_id")).collect();
        ensure!(
            stages.keys().all(|id| ids.contains(id)),
            "Go source changed since staging; do not discard either recovery copy"
        );
        let mut converted = vec![];
        for row in &rows {
            let id: i32 = row.try_get("game_id")?;
            let revision: i64 = row.try_get("revision")?;
            let payload: String = row.try_get("checkpoint")?;
            ensure!(revision > 0, "Invalid Go checkpoint revision");
            if let Some((staged, _)) = stages.get(&id) {
                ensure!(
                    staged.source_revision == revision
                        && staged.source_hash == source_hash(&payload),
                    "Go source changed after staging"
                );
            } else {
                let table =
                    convert(&payload, id).with_context(|| format!("Cannot import Go game {id}"))?;
                converted.push((id, revision, payload, table));
            }
        }
        for (id, revision, payload, mut table) in converted {
            for player in table.players() {
                let exists: bool = sqlx::query_scalar(
                    "SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND username=$2)",
                )
                .bind(player.id)
                .bind(&player.name)
                .fetch_one(&mut *transaction)
                .await?;
                ensure!(exists, "Go player does not match the account database");
            }
            store.prepare_chat(&mut table).await?;
            let stage = Stage {
                format: STAGE_FORMAT.into(),
                game_id: id,
                source_revision: revision,
                source_hash: source_hash(&payload),
                table,
            };
            state.reserve(StateId::Game(id)).await?;
            let revision = state
                .save(StateId::Game(id), 0, &serde_json::to_string(&stage)?)
                .await?;
            stages.insert(id, (stage, revision));
        }
    }
    let table_ids: HashSet<u64> = stages.values().map(|(stage, _)| stage.table.id).collect();
    ensure!(
        table_ids.len() == stages.len() && native.keys().all(|id| table_ids.contains(id)),
        "Conflicting Go/Rust table identities"
    );
    for (id, (stage, _)) in &stages {
        let completed: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM games WHERE id=$1)")
            .bind(id)
            .fetch_one(&mut *transaction)
            .await?;
        ensure!(
            !completed,
            "A staged game was completed outside the cutover; refusing resurrection"
        );
        ensure!(stage.table.id > 0, "Invalid staged table ID");
    }
    let sequence: i64 = sqlx::query_scalar("SELECT last_value FROM games_id_seq")
        .fetch_one(&mut *transaction)
        .await?;
    ensure!(
        stages.keys().all(|id| i64::from(*id) <= sequence),
        "Go game sequence is behind reserved identities; repair it before cutover"
    );
    store.require_offline_database().await?;
    for row in &rows {
        let deleted = sqlx::query(
            "DELETE FROM active_games WHERE game_id=$1 AND revision=$2 AND checkpoint=$3",
        )
        .bind(row.try_get::<i32, _>("game_id")?)
        .bind(row.try_get::<i64, _>("revision")?)
        .bind(row.try_get::<String, _>("checkpoint")?)
        .execute(&mut *transaction)
        .await?;
        ensure!(
            deleted.rows_affected() == 1,
            "Go source changed during cutover"
        );
    }
    transaction.commit().await?;
    for (stage, _) in stages.values() {
        let encoded = serde_json::to_string(&stage.table)?;
        match native.get(&stage.table.id) {
            Some(record) => ensure!(
                record.payload == encoded && record.revision == 1,
                "Conflicting promoted Rust state"
            ),
            None => {
                state.reserve(StateId::Table(stage.table.id)).await?;
                state
                    .save(StateId::Table(stage.table.id), 0, &encoded)
                    .await?;
            }
        }
    }
    state
        .finish_go_cutover(
            &stages
                .iter()
                .map(|(id, (stage, revision))| (*id, *revision, stage.table.id))
                .collect::<Vec<_>>(),
        )
        .await?;
    Ok(stages.len())
}
