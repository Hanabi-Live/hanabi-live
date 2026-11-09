use crate::game::{AssignedCharacter, Game, Options};
use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::EndCondition;
use hanabi_protocol::GameId;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{
    CLOCK_UNITS_PER_MINUTE, Chat, HypotheticalAction, MAX_PLAYERS, NO_VALUE, PregameStats,
    ReplayAction,
};
pub use hanabi_protocol::{CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

pub const FORMAT: &str = "hanabi-live-1";
/// The author of chat that the server wrote, as `chat_log` stores it. Real users have positive IDs.
pub const SERVER_AUTHOR: UserId = UserId(0);
/// The game ID of a game that is not in the database, such as a replay of uploaded JSON. Games in
/// the database have positive IDs.
pub const UNSAVED_GAME: GameId = GameId(0);
/// How long before an idle game ends to warn its table.
pub const IDLE_WARNING_MS: i64 = 5 * CLOCK_UNITS_PER_MINUTE;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Player {
    pub id: UserId,
    pub name: String,
    pub stats: PregameStats,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraOptions {
    pub custom_seed: Option<String>,
    pub custom_actions: Vec<ReplayAction>,
    pub custom_characters: Option<Vec<AssignedCharacter>>,
    pub custom_num_players: Option<usize>,
    pub no_write_to_database: bool,
    /// The seed that the table requested, without the player count and variant that prefix it.
    /// Blank deals the next seed that none of the players have played.
    pub set_seed_suffix: String,
    /// Whether the table replays a finished game, which plays its first `set_replay_turn` actions.
    pub set_replay: bool,
    pub set_replay_turn: usize,
    /// The finished game that the table replays.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay_game_id: Option<GameId>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub format: String,
    pub table_id: TableId,
    pub game_id: GameId,
    pub owner: UserId,
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
    pub spectator_notes: BTreeMap<UserId, NoteOwner>,
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
) -> std::result::Result<BTreeMap<UserId, NoteOwner>, D::Error>
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
    pub user: UserId,
    pub tag: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PendingTag {
    pub game_id: GameId,
    pub user_id: UserId,
    pub operation: TagOperation,
    pub tag: String,
}
/// A change to a replay's tags that a checkpoint records until the database applies it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TagOperation {
    Tag,
    TagDelete,
    TagsDeleteAll,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayState {
    pub leader: UserId,
    pub segment: i32,
    pub efficiency_modifier: i32,
    /// Whether the leader is exploring a hypothetical.
    pub hypothetical: bool,
    /// Stored as JSON text, the format table checkpoints have always used.
    #[serde(with = "json_text")]
    pub hypothetical_actions: Vec<HypotheticalAction>,
    pub show_drawn_cards: bool,
    /// Whether the shared replay hides what happens later in the game.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub spoiler_free: bool,
    /// The players who will not play again if the leader restarts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub restart_declined: Vec<UserId>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase", deny_unknown_fields)]
pub enum Phase {
    Pregame {
        players: Vec<Player>,
        automatic_start: Option<usize>,
        countdown: Option<DateTime<Utc>>,
        kicked: Vec<UserId>,
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
    pub id: TableId,
    pub name: String,
    pub owner: UserId,
    pub visible: bool,
    #[serde(deserialize_with = "deserialize_stored_options")]
    pub options: Options,
    pub max_players: usize,
    pub password_hash: Option<String>,
    pub extra: ExtraOptions,
    pub created: DateTime<Utc>,
    pub phase: Phase,
    /// Messages without an ID are new: the next commit archives them.
    pub chat: Vec<TableChat>,
    pub shadows: BTreeMap<UserId, Option<Seat>>,
}
/// Reads a checkpoint's table options. `Options` fills in a missing option with its default, which
/// would silently change a stored table, so every option that checkpoints always write is required.
fn deserialize_stored_options<'de, D>(deserializer: D) -> std::result::Result<Options, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::Error;
    let stored = serde_json::Map::<String, Value>::deserialize(deserializer)?;
    let written = serde_json::to_value(Options::default()).map_err(D::Error::custom)?;
    if let Some(missing) = written
        .as_object()
        .into_iter()
        .flat_map(serde_json::Map::keys)
        .find(|key| !stored.contains_key(*key))
    {
        return Err(D::Error::custom(format!(
            "Missing checkpoint option {missing}"
        )));
    }
    serde_json::from_value(Value::Object(stored)).map_err(D::Error::custom)
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TableChat {
    #[serde(default)]
    pub id: Option<i32>,
    pub user: UserId,
    pub message: Chat,
}
impl TableChat {
    /// When the message was sent.
    pub fn sent(&self) -> Result<DateTime<Utc>> {
        Ok(DateTime::parse_from_rfc3339(&self.message.datetime)
            .map_err(|_| anyhow::anyhow!("Invalid checkpoint chat timestamp"))?
            .with_timezone(&Utc))
    }
    /// The message as the wire carries it. Checkpoints keep each message's timestamp as it was
    /// archived, which messages from before timestamps had one form may write with microseconds.
    pub fn wire_message(&self) -> Result<Chat> {
        Ok(Chat {
            datetime: timestamp(self.sent()?),
            ..self.message.clone()
        })
    }
}
/// The serialized size of a hypothetical's actions, which checkpoints store as JSON text.
pub fn hypothetical_bytes(actions: &[HypotheticalAction]) -> Result<usize> {
    actions.iter().try_fold(0, |total, action| {
        Ok(total + serde_json::to_string(action)?.len())
    })
}
/// Serializes a list as one JSON text per element.
mod json_text {
    use serde::{Deserialize, Deserializer, Serialize, Serializer, de::DeserializeOwned};

    pub fn serialize<S: Serializer, T: Serialize>(
        values: &[T],
        serializer: S,
    ) -> Result<S::Ok, S::Error> {
        values
            .iter()
            .map(serde_json::to_string)
            .collect::<Result<Vec<_>, _>>()
            .map_err(serde::ser::Error::custom)?
            .serialize(serializer)
    }

    pub fn deserialize<'de, D: Deserializer<'de>, T: DeserializeOwned>(
        deserializer: D,
    ) -> Result<Vec<T>, D::Error> {
        Vec::<String>::deserialize(deserializer)?
            .iter()
            .map(|text| serde_json::from_str(text))
            .collect::<Result<_, _>>()
            .map_err(serde::de::Error::custom)
    }
}
impl TableSnapshot {
    /// Updates the cached game totals of the pregame players in `users`, whose totals `counts`
    /// holds (a missing user has none). Returns whether any total changed.
    pub fn set_game_counts(&mut self, users: &[UserId], counts: &BTreeMap<UserId, i64>) -> bool {
        let Phase::Pregame { players, .. } = &mut self.phase else {
            return false;
        };
        let mut changed = false;
        for player in players
            .iter_mut()
            .filter(|player| users.contains(&player.id))
        {
            let count = counts.get(&player.id).copied().unwrap_or(0);
            if player.stats.num_games != count {
                player.stats.num_games = count;
                changed = true;
            }
        }
        changed
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
                spoiler_free: false,
                restart_declined: vec![],
            },
        };
        Ok(())
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == FORMAT
                && self.id.0 > 0
                && self.id.0 <= hanabi_protocol::MAX_SAFE_INTEGER.unsigned_abs(),
            "Incompatible table checkpoint"
        );
        ensure!(
            !self.name.is_empty()
                && self.name.len() <= MAX_STORED_TABLE_NAME_LENGTH
                && hanabi_protocol::is_player_count(self.max_players),
            "Invalid table metadata"
        );
        hanabi_engine::get_variant(&self.options.variant_name)?;
        ensure!(
            self.owner > UserId(0)
                && hanabi_protocol::is_player_count(self.options.num_players)
                && self.options.time_base.is_finite(),
            "Invalid table options"
        );
        ensure!(
            self.shadows.len() <= MAX_SHADOWS
                && self.shadows.iter().all(|(id, seat)| *id > UserId(0)
                    && seat.is_none_or(|seat| seat.index() < self.players().len())),
            "Invalid persisted spectator"
        );
        ensure!(
            self.players().len() <= self.max_players
                && self
                    .players()
                    .iter()
                    .enumerate()
                    .all(|(index, p)| (p.id > UserId(0)
                        || (matches!(self.phase, Phase::Replay { .. })
                            && self.extra.no_write_to_database
                            && p.id == placeholder_player_id(index)))
                        && !p.name.is_empty()
                        && p.name.len() <= crate::accounts::MAX_USERNAME_LENGTH),
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
        ensure!(self.chat.len() <= MAX_TABLE_CHAT, "Oversized table history");
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
                    !players.is_empty() && players.iter().any(|p| p.id == self.owner),
                    "Invalid pregame owner"
                );
                ensure!(
                    automatic_start.is_none_or(hanabi_protocol::is_player_count)
                        && kicked.len() <= MAX_KICKED_PLAYERS,
                    "Invalid pregame controls"
                );
            }
            Phase::Live { snapshot } | Phase::Replay { snapshot, .. } => {
                snapshot.validate()?;
                // A game becomes a replay in the same commit that ends it.
                ensure!(
                    matches!(self.phase, Phase::Replay { .. })
                        || snapshot.game.end_condition == EndCondition::InProgress,
                    "A finished game is stored as a live game"
                );
                ensure!(
                    snapshot.table_id == self.id && snapshot.game.options == self.options,
                    "Checkpoint envelope mismatch"
                );
            }
        }
        if let Phase::Replay { replay, .. } = &self.phase {
            ensure!(
                replay.segment >= 0
                    && replay.hypothetical_actions.len() <= MAX_HYPOTHETICAL_ACTIONS
                    && hypothetical_bytes(&replay.hypothetical_actions)? <= MAX_HYPOTHETICAL_BYTES,
                "Invalid replay controls"
            );
        }
        Ok(())
    }
}
impl Snapshot {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == FORMAT && self.table_id.0 > 0 && self.game_id >= UNSAVED_GAME,
            "Incompatible game checkpoint"
        );
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
            self.notes.iter().all(|n| n.len() == size
                && n.iter()
                    .all(|t| t.len() <= hanabi_protocol::MAX_IMPORTED_NOTE_LENGTH)),
            "Invalid player notes"
        );
        ensure!(
            self.spectator_notes.values().all(
                |n| n.notes.len() == size && n.notes.iter().all(|t| t.len() <= MAX_NOTE_LENGTH)
            ),
            "Invalid spectator notes"
        );
        ensure!(
            (0..=hanabi_protocol::MAX_SAFE_INTEGER).contains(&self.duration)
                && (0..=hanabi_protocol::MAX_SAFE_INTEGER).contains(&self.turn_elapsed)
                && self
                    .clocks
                    .iter()
                    .all(|clock| (-hanabi_protocol::MAX_SAFE_INTEGER
                        ..=hanabi_protocol::MAX_SAFE_INTEGER)
                        .contains(clock))
                && (0..=IDLE_TIMEOUT_MS).contains(&self.idle_remaining),
            "Invalid runtime timing"
        );
        ensure!(
            (NO_VALUE..hanabi_engine::int(n)).contains(&self.pause_player_index)
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
        let time = timestamp;
        hanabi_protocol::GameHistory {
            id: self.game_id,
            options: wire_options(&self.game.options),
            seed: self.seed.clone(),
            score: self.game.score,
            num_turns: self.game.turn,
            end_condition: self.game.end_condition,
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

/// Converts a player count, which validation keeps at most `MAX_PLAYERS`, to its wire form.
pub(crate) fn small(value: usize) -> u8 {
    u8::try_from(value).unwrap_or(u8::MAX)
}

/// `NO_VALUE` in the one-byte fields that name a seat.
#[expect(clippy::cast_possible_truncation, reason = "NO_VALUE fits in a byte")]
const NO_SEAT: i8 = NO_VALUE as i8;

/// A seat at a table: the index of one of its players. Seats are below `MAX_PLAYERS`, so a seat
/// fits in every integer type that the wire and the engine use. It is stored as a number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "i64", into = "i64")]
pub struct Seat(u8);

impl Seat {
    /// The seat at `index`, if a table can have it.
    pub fn new(index: usize) -> Option<Self> {
        u8::try_from(index)
            .ok()
            .filter(|seat| usize::from(*seat) < MAX_PLAYERS)
            .map(Self)
    }
    /// The seat that a client names, or `None` for `NO_VALUE` or a seat that no table has.
    pub fn from_wire(value: i64) -> Option<Self> {
        usize::try_from(value).ok().and_then(Self::new)
    }
    pub fn index(self) -> usize {
        usize::from(self.0)
    }
    /// An optional seat as the wire carries it: the seat, or `NO_VALUE`.
    pub fn wire<T: From<i8>>(seat: Option<Self>) -> T {
        T::from(seat.map_or(NO_SEAT, |seat| {
            i8::try_from(seat.0).expect("seats are below MAX_PLAYERS")
        }))
    }
    /// Each player with their seat.
    pub fn seated<T>(players: &[T]) -> impl Iterator<Item = (Self, &T)> {
        players
            .iter()
            .enumerate()
            .filter_map(|(index, player)| Some((Self::new(index)?, player)))
    }
}

impl TryFrom<i64> for Seat {
    type Error = String;
    fn try_from(value: i64) -> Result<Self, String> {
        Self::from_wire(value).ok_or_else(|| format!("Invalid seat {value}"))
    }
}

impl From<Seat> for i64 {
    fn from(seat: Seat) -> Self {
        Self::from(seat.0)
    }
}

impl From<Seat> for i32 {
    fn from(seat: Seat) -> Self {
        Self::from(seat.0)
    }
}

impl From<Seat> for u8 {
    fn from(seat: Seat) -> Self {
        seat.0
    }
}

/// The options that keep a score from counting as a normal one. The database stores them in
/// `user_stats` as one bit each.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ScoreModifier(i16);

impl ScoreModifier {
    const DECK_PLAYS: i16 = 1;
    const EMPTY_CLUES: i16 = 2;
    const ONE_EXTRA_CARD: i16 = 4;
    const ONE_LESS_CARD: i16 = 8;
    const ALL_OR_NOTHING: i16 = 16;

    /// Each option and its name on the score pages. The pages show only the first one that a score
    /// has, so the order ranks them.
    const OPTIONS: [(i16, &str); 5] = [
        (Self::ALL_OR_NOTHING, "allornothing"),
        (Self::ONE_EXTRA_CARD, "oneextracard"),
        (Self::ONE_LESS_CARD, "onelesscard"),
        (Self::EMPTY_CLUES, "emptyclues"),
        (Self::DECK_PLAYS, "deckplays"),
    ];

    pub fn of(options: &Options) -> Self {
        let mut bits = 0;
        for (flag, set) in [
            (Self::DECK_PLAYS, options.deck_plays),
            (Self::EMPTY_CLUES, options.empty_clues),
            (Self::ONE_EXTRA_CARD, options.one_extra_card),
            (Self::ONE_LESS_CARD, options.one_less_card),
            (Self::ALL_OR_NOTHING, options.all_or_nothing),
        ] {
            if set {
                bits |= flag;
            }
        }
        Self(bits)
    }

    pub const fn from_bits(bits: i16) -> Self {
        Self(bits)
    }

    pub const fn bits(self) -> i16 {
        self.0
    }

    /// The name of the option that the score pages show for this score, or `None` when the score
    /// is a normal one.
    pub fn shown(self) -> Option<&'static str> {
        Self::OPTIONS
            .iter()
            .find(|(flag, _)| self.0 & flag != 0)
            .map(|(_, name)| *name)
    }

    /// A best score with this modifier and one flag per option, as the wire carries it.
    pub fn best_score(self, num_players: u8, score: i32) -> hanabi_protocol::PregameBestScore {
        let has = |flag: i16| self.0 & flag != 0;
        hanabi_protocol::PregameBestScore {
            num_players,
            score,
            modifier: i32::from(self.0),
            deck_plays: has(Self::DECK_PLAYS),
            empty_clues: has(Self::EMPTY_CLUES),
            one_extra_card: has(Self::ONE_EXTRA_CARD),
            one_less_card: has(Self::ONE_LESS_CARD),
            all_or_nothing: has(Self::ALL_OR_NOTHING),
        }
    }
}

/// The most messages a table's chat keeps.
pub const MAX_TABLE_CHAT: usize = 4096;
/// The most moves a shared replay's hypothetical can hold.
pub const MAX_HYPOTHETICAL_ACTIONS: usize = 4096;
/// The most bytes that a shared replay's hypothetical moves can hold together. They are stored in
/// the table's checkpoint, so they can be no larger than it.
pub const MAX_HYPOTHETICAL_BYTES: usize = crate::state::MAX_CHECKPOINT_BYTES;
/// The longest game tag, in bytes.
pub const MAX_TAG_LENGTH: usize = 100;
/// The longest table name, in bytes.
pub const MAX_TABLE_NAME_LENGTH: usize = 45;
/// The longest table name that a checkpoint can hold, in bytes. Generated replay names can be
/// longer than a name that a player chooses.
const MAX_STORED_TABLE_NAME_LENGTH: usize = 200;
/// The longest note that a player or spectator writes during a game, in bytes.
pub const MAX_NOTE_LENGTH: usize = 300;
/// The most players that a pregame table remembers kicking.
const MAX_KICKED_PLAYERS: usize = 4096;
/// The most spectators that a table remembers, with the seat that each one shadows.
const MAX_SHADOWS: usize = 4096;

/// The ID of the player in a seat of a replay that is not written to the database. It is negative,
/// so it cannot match a user.
pub fn placeholder_player_id(seat: usize) -> UserId {
    UserId(-1 - hanabi_engine::int(seat))
}

pub fn tag_too_long() -> String {
    format!("Tags cannot be longer than {MAX_TAG_LENGTH} characters.")
}

/// A time as the wire carries it: RFC 3339 in UTC, with milliseconds, such as
/// "2026-01-01T12:00:00.000Z". The clients' schemas accept only this form.
pub fn timestamp(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Converts the engine's options to their wire form. Both destructure every field, so adding an
/// option to either type fails to compile until the conversions are updated.
pub(crate) fn wire_options(options: &Options) -> hanabi_protocol::GameOptions {
    let Options {
        num_players,
        variant_name,
        variant_id,
        timed,
        time_base,
        time_per_turn,
        speedrun,
        deck_plays,
        empty_clues,
        one_extra_card,
        one_less_card,
        all_or_nothing,
        detrimental_characters,
        table_name,
        max_players,
    } = options;
    hanabi_protocol::GameOptions {
        num_players: small(*num_players),
        variant_name: variant_name.clone(),
        variant_id: *variant_id,
        timed: *timed,
        time_base: *time_base,
        time_per_turn: *time_per_turn,
        speedrun: *speedrun,
        deck_plays: *deck_plays,
        empty_clues: *empty_clues,
        one_extra_card: *one_extra_card,
        one_less_card: *one_less_card,
        all_or_nothing: *all_or_nothing,
        detrimental_characters: *detrimental_characters,
        table_name: table_name.clone(),
        max_players: max_players.map(small),
        seed: None,
        replay_game_id: None,
        replay_turn: None,
    }
}

/// Converts wire options to the engine's.
pub(crate) fn engine_options(options: &hanabi_protocol::GameOptions) -> Options {
    let hanabi_protocol::GameOptions {
        num_players,
        variant_name,
        variant_id,
        timed,
        time_base,
        time_per_turn,
        speedrun,
        deck_plays,
        empty_clues,
        one_extra_card,
        one_less_card,
        all_or_nothing,
        detrimental_characters,
        table_name,
        max_players,
        // A table keeps its seed and replayed game apart from the game's rules, in `ExtraOptions`.
        seed: _,
        replay_game_id: _,
        replay_turn: _,
    } = options;
    Options {
        num_players: usize::from(*num_players),
        variant_name: variant_name.clone(),
        variant_id: *variant_id,
        timed: *timed,
        time_base: *time_base,
        time_per_turn: *time_per_turn,
        speedrun: *speedrun,
        deck_plays: *deck_plays,
        empty_clues: *empty_clues,
        one_extra_card: *one_extra_card,
        one_less_card: *one_less_card,
        all_or_nothing: *all_or_nothing,
        detrimental_characters: *detrimental_characters,
        table_name: table_name.clone(),
        max_players: max_players.map(usize::from),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn score_modifiers_keep_the_stored_bits_and_name_the_highest_ranked_option() {
        let options = Options {
            empty_clues: true,
            one_less_card: true,
            ..Options::default()
        };
        let modifier = ScoreModifier::of(&options);
        assert_eq!(modifier.bits(), 2 + 8);
        assert_eq!(modifier.shown(), Some("onelesscard"));
        assert_eq!(ScoreModifier::from_bits(0).shown(), None);
        assert_eq!(
            ScoreModifier::from_bits(16 + 1).shown(),
            Some("allornothing")
        );
        let best = modifier.best_score(3, 20);
        assert_eq!(best.modifier, 10);
        assert!(best.empty_clues && best.one_less_card);
        assert!(!best.deck_plays && !best.one_extra_card && !best.all_or_nothing);
    }

    #[test]
    fn timestamps_are_utc_with_milliseconds() {
        let time = DateTime::<Utc>::from_timestamp(1_767_268_800, 123_456_789).unwrap();
        assert_eq!(timestamp(time), "2026-01-01T12:00:00.123Z");
        let whole = DateTime::<Utc>::from_timestamp(1_767_268_800, 0).unwrap();
        assert_eq!(timestamp(whole), "2026-01-01T12:00:00.000Z");
    }

    #[test]
    fn checkpoints_keep_hypothetical_actions_as_json_text() {
        let text = r#"{"type":"unmorph","order":3}"#;
        let stored = serde_json::json!({
            "leader": 1, "segment": 0, "efficiencyModifier": 0, "hypothetical": true,
            "hypotheticalActions": [text], "showDrawnCards": false
        });
        let replay: ReplayState = serde_json::from_value(stored.clone()).unwrap();
        assert!(matches!(
            replay.hypothetical_actions[..],
            [HypotheticalAction::Unmorph { order: 3 }]
        ));
        assert_eq!(serde_json::to_value(&replay).unwrap(), stored);
    }

    #[test]
    fn checkpoint_chat_keeps_its_archived_timestamp_but_sends_the_wire_form() {
        let chat = TableChat {
            id: Some(1),
            user: UserId(1),
            message: serde_json::from_value(serde_json::json!(
                {"msg": "hi", "source": "user", "datetime": "2026-11-02T20:00:00.123456Z"}
            ))
            .unwrap(),
        };
        assert_eq!(
            chat.wire_message().unwrap().datetime,
            "2026-11-02T20:00:00.123Z"
        );
        assert_eq!(chat.message.datetime, "2026-11-02T20:00:00.123456Z");
    }

    #[test]
    fn wire_and_engine_option_defaults_agree() {
        let defaults = Options::default();
        let wire = hanabi_protocol::GameOptions::default();
        assert_eq!(wire_options(&defaults), wire);
        assert_eq!(engine_options(&wire), defaults);
    }
}
