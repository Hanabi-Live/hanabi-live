use crate::game::{Action, AssignedCharacter, Card, Game, Options};
use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::EndCondition;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const FORMAT: &str = "hanabi-live-1";
pub const IDLE_TIMEOUT_MS: i64 = 1_800_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Player {
    pub id: i32,
    pub name: String,
    pub stats: Value,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraOptions {
    pub custom_seed: Option<String>,
    pub custom_deck: Option<Vec<Card>>,
    pub custom_deck_is_shuffled: bool,
    pub custom_actions: Vec<Action>,
    pub custom_characters: Option<Vec<AssignedCharacter>>,
    pub custom_num_players: Option<usize>,
    pub no_write_to_database: bool,
    pub set_seed_suffix: String,
    pub set_replay: bool,
    pub set_replay_turn: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub format: String,
    pub table_id: u64,
    pub game_id: i32,
    pub owner: i32,
    pub name: String,
    pub players: Vec<Player>,
    pub seed: String,
    pub created: DateTime<Utc>,
    pub started: DateTime<Utc>,
    pub finished: Option<DateTime<Utc>>,
    pub game: Game,
    pub clocks: Vec<i64>,
    pub duration: i64,
    pub turn_elapsed: i64,
    pub timer_started: bool,
    pub idle_remaining: i64,
    pub pause_player_index: i32,
    pub queued_pauses: Vec<bool>,
    pub notes: Vec<Vec<String>>,
    #[serde(deserialize_with = "deserialize_note_owners")]
    pub spectator_notes: BTreeMap<i32, NoteOwner>,
    pub tags: Vec<Tag>,
    pub votes: Vec<bool>,
    pub maintenance_applied: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NoteOwner {
    pub name: String,
    pub notes: Vec<String>,
}

fn deserialize_note_owners<'de, D>(
    deserializer: D,
) -> std::result::Result<BTreeMap<i32, NoteOwner>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    // Tagged phases buffer object keys as strings; restore JSON's integer-key decoding.
    let value = Value::deserialize(deserializer)?;
    serde_json::from_value(value).map_err(serde::de::Error::custom)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Tag {
    pub user: i32,
    pub tag: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PendingTag {
    pub game_id: i32,
    pub user_id: i32,
    pub operation: String,
    pub tag: String,
}
/// State saved before this flag replaced it holds a copy of the game, or null, instead of a
/// boolean. Remove once no saved state contains that copy.
fn hypothetical_active<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<bool, D::Error> {
    Ok(match Value::deserialize(deserializer)? {
        Value::Bool(active) => active,
        Value::Null => false,
        _ => true,
    })
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayState {
    pub leader: i32,
    pub segment: i32,
    pub efficiency_modifier: i32,
    /// Whether the leader is exploring a hypothetical.
    #[serde(deserialize_with = "hypothetical_active")]
    pub hypothetical: bool,
    pub hypothetical_actions: Vec<String>,
    pub show_drawn_cards: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase", deny_unknown_fields)]
pub enum Phase {
    Pregame {
        players: Vec<Player>,
        automatic_start: Option<usize>,
        countdown: Option<DateTime<Utc>>,
        kicked: Vec<i32>,
    },
    Live {
        snapshot: Box<Snapshot>,
    },
    Replay {
        snapshot: Box<Snapshot>,
        replay: ReplayState,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TableSnapshot {
    pub format: String,
    pub id: u64,
    pub name: String,
    pub owner: i32,
    pub visible: bool,
    pub options: Options,
    pub max_players: usize,
    pub password_hash: Option<String>,
    pub extra: ExtraOptions,
    pub created: DateTime<Utc>,
    pub phase: Phase,
    pub chat: Vec<TableChat>,
    #[serde(default)]
    pub chat_archived: usize,
    pub shadows: BTreeMap<i32, Option<i32>>,
    pub pending_spawn: Option<Box<TableSnapshot>>,
    pub retire_after_spawn: bool,
    pub pending_tag: Option<PendingTag>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TableChat {
    #[serde(default)]
    pub id: Option<i32>,
    pub user: i32,
    pub message: Value,
}
impl TableSnapshot {
    pub fn decode(payload: &str) -> Result<Self> {
        ensure!(payload.len() <= 4 * 1024 * 1024, "Oversized checkpoint");
        let value: Value = serde_json::from_str(payload)?;
        ensure!(
            value["chat"].as_array().is_some_and(|v| v.len() <= 4096),
            "Missing or oversized checkpoint chat"
        );
        let options = value["options"]
            .as_object()
            .ok_or_else(|| anyhow::anyhow!("Missing checkpoint options"))?;
        for key in [
            "numPlayers",
            "startingPlayer",
            "variantName",
            "timed",
            "timeBase",
            "timePerTurn",
            "speedrun",
            "cardCycle",
            "deckPlays",
            "emptyClues",
            "oneExtraCard",
            "oneLessCard",
            "allOrNothing",
            "detrimentalCharacters",
        ] {
            ensure!(options.contains_key(key), "Missing checkpoint option {key}");
        }
        if let Some(game) = value.pointer("/phase/snapshot/game") {
            hanabi_engine::parse_engine_state(game.clone())?;
        }
        let table: Self = serde_json::from_value(value)?;
        table.validate()?;
        ensure!(
            table.chat[table.chat_archived..]
                .iter()
                .all(|chat| chat.id.is_some()),
            "Legacy pending chat archive lacks reserved numeric identities; explicit migration is required."
        );
        Ok(table)
    }
    pub fn players(&self) -> &[Player] {
        match &self.phase {
            Phase::Pregame { players, .. } => players,
            Phase::Live { snapshot } | Phase::Replay { snapshot, .. } => &snapshot.players,
        }
    }
    pub fn game(&self) -> Option<&Snapshot> {
        match &self.phase {
            Phase::Pregame { .. } => None,
            Phase::Live { snapshot } | Phase::Replay { snapshot, .. } => Some(snapshot),
        }
    }
    pub fn game_mut(&mut self) -> Option<&mut Snapshot> {
        match &mut self.phase {
            Phase::Pregame { .. } => None,
            Phase::Live { snapshot } | Phase::Replay { snapshot, .. } => Some(snapshot),
        }
    }
    pub fn convert_to_replay(&mut self) -> Result<()> {
        let Phase::Live { snapshot } = &self.phase else {
            anyhow::bail!("Only a completed live game can become a review");
        };
        ensure!(
            snapshot.game.end_condition != EndCondition::InProgress,
            "Game is not finished"
        );
        let mut snapshot = snapshot.clone();
        // An idle-ended game must still expire rather than gain another idle window.
        if snapshot.game.end_condition != EndCondition::IdleTimeout {
            snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let segment = snapshot.game.turn;
        self.phase = Phase::Replay {
            snapshot,
            replay: ReplayState {
                leader: self.owner,
                segment,
                efficiency_modifier: 0,
                hypothetical: false,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
            },
        };
        Ok(())
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == FORMAT && self.id > 0 && self.id <= 9_007_199_254_740_991,
            "Incompatible table checkpoint"
        );
        ensure!(
            !self.name.is_empty() && self.name.len() <= 200 && (2..=6).contains(&self.max_players),
            "Invalid table metadata"
        );
        hanabi_engine::get_variant(&self.options.variant_name)?;
        ensure!(
            self.owner > 0
                && (2..=6).contains(&self.options.num_players)
                && self.options.starting_player < self.options.num_players
                && self.options.time_base.is_finite(),
            "Invalid table options"
        );
        ensure!(
            self.shadows.len() <= 4096
                && self.shadows.iter().all(|(id, seat)| *id > 0
                    && seat.is_none_or(|seat| seat >= 0 && (seat as usize) < self.players().len())),
            "Invalid persisted spectator"
        );
        ensure!(
            self.players().len() <= self.max_players
                && self.players().iter().enumerate().all(|(index, p)| (p.id > 0
                    || (matches!(self.phase, Phase::Replay { .. })
                        && self.extra.no_write_to_database
                        && p.id == -1 - index as i32))
                    && !p.name.is_empty()
                    && p.name.len() <= 100),
            "Invalid players"
        );
        ensure!(
            self.players()
                .iter()
                .map(|p| p.id)
                .collect::<HashSet<_>>()
                .len()
                == self.players().len(),
            "Duplicate players"
        );
        ensure!(self.chat.len() <= 4096, "Oversized table history");
        ensure!(
            self.chat_archived <= self.chat.len(),
            "Invalid archived chat cursor"
        );
        let ids = self
            .chat
            .iter()
            .filter_map(|chat| chat.id)
            .collect::<HashSet<_>>();
        ensure!(
            ids.len() == self.chat.iter().filter(|chat| chat.id.is_some()).count()
                && ids.iter().all(|id| *id > 0),
            "Invalid or duplicate chat identity"
        );
        match &self.phase {
            Phase::Pregame {
                players,
                automatic_start,
                kicked,
                ..
            } => {
                ensure!(
                    (!players.is_empty() && players.iter().any(|p| p.id == self.owner))
                        || (self.retire_after_spawn && self.pending_spawn.is_some()),
                    "Invalid pregame owner"
                );
                ensure!(
                    automatic_start.is_none_or(|n| (2..=6).contains(&n)) && kicked.len() <= 4096,
                    "Invalid pregame controls"
                );
            }
            Phase::Live { snapshot } | Phase::Replay { snapshot, .. } => {
                snapshot.validate()?;
                ensure!(
                    snapshot.table_id == self.id && snapshot.game.options == self.options,
                    "Checkpoint envelope mismatch"
                );
            }
        }
        if let Phase::Replay { replay, .. } = &self.phase {
            ensure!(
                replay.segment >= 0
                    && replay.hypothetical_actions.len() <= 4096
                    && replay
                        .hypothetical_actions
                        .iter()
                        .map(String::len)
                        .sum::<usize>()
                        <= 4_194_304
                    && replay
                        .hypothetical_actions
                        .iter()
                        .all(|raw| serde_json::from_str::<Value>(raw).is_ok()),
                "Invalid replay controls"
            );
        }
        if let Some(spawn) = &self.pending_spawn {
            ensure!(
                spawn.id != self.id && spawn.pending_spawn.is_none() && !spawn.retire_after_spawn,
                "Invalid table transfer"
            );
            spawn.validate()?;
        } else {
            ensure!(!self.retire_after_spawn, "Missing table transfer");
        }
        if let Some(edit) = &self.pending_tag {
            ensure!(
                edit.game_id > 0
                    && edit.user_id > 0
                    && matches!(
                        edit.operation.as_str(),
                        "tag" | "tagDelete" | "tagsDeleteAll"
                    )
                    && edit.tag.len() <= 100,
                "Invalid durable tag edit"
            );
            ensure!(
                matches!(self.phase, Phase::Replay { .. })
                    && self.game().is_some_and(|s| s.game_id == edit.game_id),
                "Tag edit does not match replay"
            );
        }
        Ok(())
    }
}
impl Snapshot {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == FORMAT && self.table_id > 0 && self.game_id >= 0,
            "Incompatible game checkpoint"
        );
        self.game.validate_recovery()?;
        let n = self.players.len();
        ensure!(
            n == self.game.players.len()
                && self
                    .players
                    .iter()
                    .zip(&self.game.players)
                    .all(|(p, g)| p.name == g.name),
            "Game roster mismatch"
        );
        ensure!(
            self.finished.is_some() == (self.game.end_condition != EndCondition::InProgress),
            "Invalid completion timestamp"
        );
        ensure!(
            self.clocks.len() == n
                && self.queued_pauses.len() == n
                && self.notes.len() == n
                && self.votes.len() == n,
            "Invalid runtime vectors"
        );
        let size = self.game.deck.len() + self.game.stacks.len();
        ensure!(
            self.notes
                .iter()
                .all(|n| n.len() == size && n.iter().all(|t| t.len() <= 65536)),
            "Invalid player notes"
        );
        ensure!(
            self.spectator_notes
                .values()
                .all(|n| n.notes.len() == size && n.notes.iter().all(|t| t.len() <= 1200)),
            "Invalid spectator notes"
        );
        ensure!(
            (0..=9_007_199_254_740_991).contains(&self.duration)
                && (0..=9_007_199_254_740_991).contains(&self.turn_elapsed)
                && self
                    .clocks
                    .iter()
                    .all(|clock| (-9_007_199_254_740_991..=9_007_199_254_740_991).contains(clock))
                && (0..=IDLE_TIMEOUT_MS).contains(&self.idle_remaining),
            "Invalid runtime timing"
        );
        ensure!(
            (-1..n as i32).contains(&self.pause_player_index)
                && self.game.paused == (self.pause_player_index >= 0),
            "Invalid pause state"
        );
        Ok(())
    }
    pub fn history(&self, count: i64, increment: bool) -> hanabi_protocol::GameHistory {
        let mut names = self
            .players
            .iter()
            .map(|p| p.name.clone())
            .collect::<Vec<_>>();
        names.sort_by_key(|s| s.to_lowercase());
        let time = |time: DateTime<Utc>| time.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true);
        hanabi_protocol::GameHistory {
            id: hanabi_protocol::GameId(self.game_id),
            options: wire_options(&self.game.options),
            seed: self.seed.clone(),
            score: self.game.score,
            num_turns: self.game.turn,
            end_condition: u8::try_from(i32::from(self.game.end_condition)).unwrap_or(0),
            datetime_started: time(self.started),
            datetime_finished: time(self.finished.unwrap_or(self.started)),
            num_games_on_this_seed: count,
            player_names: names,
            increment_num_games: increment,
            tags: self
                .tags
                .iter()
                .map(|t| t.tag.as_str())
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}

/// Table sizes and seats are validated to be at most six, so they fit in a byte.
pub(crate) fn small(value: usize) -> u8 {
    u8::try_from(value).unwrap_or(u8::MAX)
}

pub(crate) fn wire_options(options: &Options) -> hanabi_protocol::GameOptions {
    hanabi_protocol::GameOptions {
        num_players: small(options.num_players),
        starting_player: small(options.starting_player),
        variant_name: options.variant_name.clone(),
        variant_id: options.variant_id,
        timed: options.timed,
        time_base: options.time_base,
        time_per_turn: options.time_per_turn,
        speedrun: options.speedrun,
        card_cycle: options.card_cycle,
        deck_plays: options.deck_plays,
        empty_clues: options.empty_clues,
        one_extra_card: options.one_extra_card,
        one_less_card: options.one_less_card,
        all_or_nothing: options.all_or_nothing,
        detrimental_characters: options.detrimental_characters,
        table_name: options.table_name.clone(),
        max_players: options.max_players.map(small),
    }
}
