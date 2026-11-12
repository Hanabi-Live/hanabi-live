use crate::game::{AssignedCharacter, Game, Options};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::EndCondition;
use hanabi_engine::RecordedAction;
use hanabi_protocol::GameId;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{
    CLOCK_UNITS_PER_MINUTE, Chat, HypotheticalEvent, MAX_NOTE_LENGTH, MAX_TAG_LENGTH, PlayerIndex,
    PregameStats,
};
pub use hanabi_protocol::{CLOCK_UNITS_PER_SECOND, IDLE_TIMEOUT_MS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    time::Instant,
};

pub const FORMAT: &str = "hanabi-live-15";
/// How long before an idle game ends to warn its table.
pub const IDLE_WARNING_MS: i64 = 5 * CLOCK_UNITS_PER_MINUTE;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Player {
    /// The user in the seat. `None` in a replay that is not saved, whose seats need not be users.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<UserId>,
    pub name: String,
    /// Whether the player joined as a bot. Bots can play at several tables at once.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub bot: bool,
    pub stats: PregameStats,
}
impl Player {
    /// Whether `user` sits in this seat.
    pub fn is(&self, user: UserId) -> bool {
        self.id == Some(user)
    }
    /// The user in the seat. Every seat of a pregame or a live game has one.
    pub fn user(&self) -> Result<UserId> {
        self.id.context("A seat has no user")
    }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtraOptions {
    pub custom_seed: Option<String>,
    pub custom_actions: Vec<RecordedAction>,
    pub custom_characters: Option<Vec<AssignedCharacter>>,
    pub custom_num_players: Option<usize>,
    pub no_write_to_database: bool,
    /// The seed that the table requested, without the player count and variant that prefix it.
    /// Absent deals the next seed that none of the players have played.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_seed_suffix: Option<String>,
    /// The finished game that the table replays.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub replay: Option<TableReplay>,
}

/// A finished game that a table replays.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableReplay {
    pub game_id: GameId,
    /// How many of the game's actions the table plays before its players take over.
    pub turns: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub format: String,
    pub table_id: TableId,
    /// The game's ID in the database. Absent for a game that is not saved there, such as a replay
    /// of uploaded JSON.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub game_id: Option<GameId>,
    pub owner: UserId,
    pub name: String,
    pub players: Vec<Player>,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    pub created: DateTime<Utc>,
    pub started: DateTime<Utc>,
    pub finished: Option<DateTime<Utc>>,
    pub game: Game,
    /// Each player's clock in milliseconds: the time left in a timed game, or the time taken in an
    /// untimed one.
    pub clocks: Vec<i64>,
    pub duration: i64,
    pub turn_elapsed: i64,
    /// Whether the active player's clock has started: an action was taken, or the active player
    /// loaded the game.
    pub timer_started: bool,
    pub idle_remaining: i64,
    /// The player who paused the game. A paused game takes no actions.
    #[serde(
        rename = "pause_player_index",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub paused_by: Option<PlayerIndex>,
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
/// A change to the tags of a replay's database game, which the database applies with the table's
/// next save.
#[derive(Clone, Debug)]
pub struct PendingTag {
    pub game_id: GameId,
    pub user_id: UserId,
    pub edit: TagEdit,
}
/// A change to a game's tags by one user.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TagEdit {
    Add(String),
    Delete(String),
    /// Deletes every tag of the user.
    DeleteAll,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayState {
    pub leader: UserId,
    pub segment: hanabi_protocol::Turn,
    pub efficiency_modifier: hanabi_protocol::EfficiencyModifier,
    /// Whether the leader is exploring a hypothetical.
    pub hypothetical: bool,
    pub hypothetical_actions: Vec<HypotheticalEvent>,
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
        kicked: Vec<UserId>,
        #[serde(skip)]
        runtime: PregameRuntime,
    },
    Live {
        snapshot: Box<Snapshot>,
        #[serde(skip)]
        runtime: LiveRuntime,
    },
    Replay {
        snapshot: Box<Snapshot>,
        replay: ReplayState,
        #[serde(skip)]
        runtime: ReplayRuntime,
    },
}
// What a table keeps in memory for its phase. Checkpoints leave it out, so a restart forgets it:
// reconnection grace starts again, and warnings and notices can be sent again. A new phase starts
// with none.
#[derive(Clone, Debug, Default)]
pub struct PregameRuntime {
    /// When each absent player loses their seat.
    pub absent_until: HashMap<UserId, Instant>,
    /// Who the table was told tried to join it while it was full.
    pub full_join_notices: HashSet<UserId>,
    /// When a player last joined the table, so that a burst of joins plays the join sound once.
    /// Before the first join, the table's creation counts as the last join.
    pub last_join: Option<Instant>,
}
#[derive(Clone, Debug, Default)]
pub struct LiveRuntime {
    /// Whether the table was warned that the game is about to end for inactivity.
    pub idle_warned: bool,
}
#[derive(Clone, Debug, Default)]
pub struct ReplayRuntime {
    /// When the replay closes if no viewer returns.
    pub absent_until: Option<Instant>,
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
    pub shadows: BTreeMap<UserId, Option<PlayerIndex>>,
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
    pub id: Option<i32>,
    /// The user who wrote the message. `None` for a message that the server wrote.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user: Option<UserId>,
    pub message: Chat,
}
impl TableChat {
    /// When the message was sent.
    pub fn sent(&self) -> Result<DateTime<Utc>> {
        Ok(DateTime::parse_from_rfc3339(self.message.sent_at.as_str())
            .map_err(|_| anyhow::anyhow!("Invalid checkpoint chat timestamp"))?
            .with_timezone(&Utc))
    }
    /// The message as the wire carries it. Checkpoints keep each message's timestamp as it was
    /// archived, which messages from before timestamps had one form may write with microseconds.
    pub fn wire_message(&self) -> Result<Chat> {
        Ok(Chat {
            sent_at: hanabi_protocol::Timestamp::from(self.sent()?),
            ..self.message.clone()
        })
    }
}
/// The serialized size of a hypothetical's actions, which checkpoints store as JSON text.
pub fn hypothetical_bytes(actions: &[HypotheticalEvent]) -> Result<usize> {
    actions.iter().try_fold(0, |total, action| {
        Ok(total + serde_json::to_string(action)?.len())
    })
}
impl TableSnapshot {
    /// Updates the cached game totals of the pregame players in `users`, whose totals `counts`
    /// holds (a missing user has none). Returns whether any total changed.
    pub fn set_game_counts(&mut self, users: &[UserId], counts: &BTreeMap<UserId, i64>) -> bool {
        let Phase::Pregame { players, .. } = &mut self.phase else {
            return false;
        };
        let mut changed = false;
        for player in players.iter_mut() {
            let Some(id) = player.id.filter(|id| users.contains(id)) else {
                continue;
            };
            let count = counts.get(&id).copied().unwrap_or(0);
            if player.stats.num_games != hanabi_protocol::Count(count) {
                player.stats.num_games = hanabi_protocol::Count(count);
                changed = true;
            }
        }
        changed
    }
    pub fn players(&self) -> &[Player] {
        match &self.phase {
            Phase::Pregame { players, .. } => players,
            Phase::Live { snapshot, .. } | Phase::Replay { snapshot, .. } => &snapshot.players,
        }
    }
    /// The users in the seats.
    pub fn seated_users(&self) -> impl Iterator<Item = UserId> + '_ {
        self.players().iter().filter_map(|p| p.id)
    }
    pub fn game(&self) -> Option<&Snapshot> {
        match &self.phase {
            Phase::Pregame { .. } => None,
            Phase::Live { snapshot, .. } | Phase::Replay { snapshot, .. } => Some(snapshot),
        }
    }
    pub fn game_mut(&mut self) -> Option<&mut Snapshot> {
        match &mut self.phase {
            Phase::Pregame { .. } => None,
            Phase::Live { snapshot, .. } | Phase::Replay { snapshot, .. } => Some(snapshot),
        }
    }
    pub fn convert_to_replay(&mut self) -> Result<()> {
        let Phase::Live { snapshot, .. } = &self.phase else {
            anyhow::bail!("Only a completed live game can become a review");
        };
        ensure!(snapshot.game.end.is_some(), "Game is not finished");
        let mut snapshot = snapshot.clone();
        // An idle-ended game must still expire rather than gain another idle window.
        if snapshot.game.end.map(|end| end.condition) != Some(EndCondition::IdleTimeout) {
            snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let segment =
            hanabi_protocol::Turn::new(snapshot.game.turn).context("Invalid turn count")?;
        self.phase = Phase::Replay {
            snapshot,
            replay: ReplayState {
                leader: self.owner,
                segment,
                efficiency_modifier: hanabi_protocol::EfficiencyModifier::default(),
                hypothetical: false,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
                spoiler_free: false,
                restart_declined: vec![],
            },
            runtime: ReplayRuntime::default(),
        };
        Ok(())
    }
    /// Applies the rules that follow from changing a table from `before` to `self`, at `now`:
    ///
    /// - New chat from a user gives a shared replay another idle window.
    /// - A spectator who shadowed a player keeps shadowing that player when the seats change.
    /// - A game that ended gets its finish time and becomes a replay. Its `audience` stays to watch
    ///   it, without shadowing anyone.
    ///
    /// Returns whether a game finished.
    pub fn settle(
        &mut self,
        before: &Self,
        audience: impl IntoIterator<Item = UserId>,
        now: DateTime<Utc>,
    ) -> Result<bool> {
        if self.visible
            && self
                .chat
                .iter()
                .skip(before.chat.len())
                .any(|chat| chat.user.is_some())
            && let Phase::Replay { snapshot, .. } = &mut self.phase
        {
            snapshot.idle_remaining = IDLE_TIMEOUT_MS;
        }
        let old_ids = before.players().iter().map(|p| p.id).collect::<Vec<_>>();
        let new_ids = self.players().iter().map(|p| p.id).collect::<Vec<_>>();
        if old_ids != new_ids {
            for shadow in self.shadows.values_mut() {
                *shadow = shadow
                    .and_then(|seat| old_ids.get(seat.index()).copied().flatten())
                    .and_then(|id| new_ids.iter().position(|new| *new == Some(id)))
                    .and_then(PlayerIndex::new);
            }
        }
        if let Some(s) = self.game_mut()
            && s.game.end.is_some()
            && s.finished.is_none()
        {
            s.finished = Some(now);
        }
        let finished = matches!(&self.phase, Phase::Live { snapshot, .. }
            if snapshot.game.end.is_some());
        if finished {
            self.convert_to_replay()?;
            for user in audience {
                self.shadows.insert(user, None);
            }
        }
        Ok(finished)
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
            self.owner > UserId(0) && hanabi_protocol::is_player_count(self.options.num_players),
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
                && self.players().iter().all(|p| p.id.map_or(
                    matches!(self.phase, Phase::Replay { .. }) && self.extra.no_write_to_database,
                    |id| id > UserId(0)
                ) && !p.name.is_empty()
                    && p.name.len() <= crate::accounts::MAX_USERNAME_LENGTH),
            "Invalid players"
        );
        ensure!(
            self.seated_users().collect::<HashSet<_>>().len() == self.seated_users().count(),
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
                players, kicked, ..
            } => {
                ensure!(
                    !players.is_empty() && players.iter().any(|p| p.is(self.owner)),
                    "Invalid pregame owner"
                );
                ensure!(
                    kicked.len() <= MAX_KICKED_PLAYERS,
                    "Invalid pregame controls"
                );
            }
            Phase::Live { snapshot, .. } | Phase::Replay { snapshot, .. } => {
                snapshot.validate()?;
                // A game becomes a replay in the same commit that ends it.
                ensure!(
                    matches!(self.phase, Phase::Replay { .. }) || snapshot.game.end.is_none(),
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
                replay.hypothetical_actions.len() <= MAX_HYPOTHETICAL_ACTIONS
                    && hypothetical_bytes(&replay.hypothetical_actions)? <= MAX_HYPOTHETICAL_BYTES,
                "Invalid replay controls"
            );
        }
        Ok(())
    }
}
impl Snapshot {
    /// A game at table `table_id` that starts now: its clocks are at zero, and it has no notes,
    /// tags, votes, or pause.
    pub fn new(
        table_id: TableId,
        game_id: Option<GameId>,
        owner: UserId,
        name: String,
        players: Vec<Player>,
        game: Game,
    ) -> Self {
        let now = Utc::now();
        let n = players.len();
        let size = game.deck.len() + game.stacks.len();
        Self {
            format: FORMAT.into(),
            table_id,
            game_id,
            owner,
            name,
            players,
            seed: game.seed.clone(),
            created: now,
            started: now,
            finished: (game.end.is_some()).then_some(now),
            game,
            clocks: vec![0; n],
            duration: 0,
            turn_elapsed: 0,
            timer_started: false,
            idle_remaining: IDLE_TIMEOUT_MS,
            paused_by: None,
            queued_pauses: vec![false; n],
            notes: vec![vec![String::new(); size]; n],
            spectator_notes: BTreeMap::new(),
            tags: vec![],
            votes: vec![false; n],
            maintenance_applied: false,
        }
    }
    /// Whether the game is paused.
    pub fn paused(&self) -> bool {
        self.paused_by.is_some()
    }
    pub fn validate(&self) -> Result<()> {
        ensure!(
            self.format == FORMAT && self.table_id.0 > 0 && self.game_id.is_none_or(|id| id.0 > 0),
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
            self.finished.is_some() == (self.game.end.is_some()),
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
            self.paused_by.is_none_or(|seat| seat.index() < n),
            "Invalid pause state"
        );
        Ok(())
    }
    /// The game as a player's history lists it, or `None` for a game that is not in the database.
    /// `count` is how many saved games use its seed.
    pub fn history(&self, count: Option<i64>) -> Option<hanabi_protocol::GameHistoryEntry> {
        let mut names = self
            .players
            .iter()
            .map(|p| p.name.clone())
            .collect::<Vec<_>>();
        names.sort_by_key(|s| s.to_lowercase());
        let time = hanabi_protocol::Timestamp::from;
        Some(hanabi_protocol::GameHistoryEntry {
            game_id: self.game_id?,
            options: wire_options(&self.game.options),
            seed: self.seed.clone()?,
            score: hanabi_protocol::Score(self.game.score),
            num_turns: u16::try_from(self.game.turn).ok()?,
            end_condition: self.game.end?.condition,
            started_at: time(self.started),
            finished_at: time(self.finished.unwrap_or(self.started)),
            num_games_on_seed: hanabi_protocol::Count(count?),
            player_names: names.into_iter().map(Into::into).collect(),
            tags: self
                .tags
                .iter()
                .map(|t| t.tag.clone())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect(),
        })
    }
}

/// Converts a player count, which validation keeps from `MIN_PLAYERS` to `MAX_PLAYERS`, to its wire
/// form.
pub(crate) fn num_players(value: usize) -> hanabi_protocol::NumPlayers {
    hanabi_protocol::NumPlayers::new(value).expect("player counts are valid")
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

    /// A best score with this modifier, as the wire carries it.
    pub fn best_score(self, score: i32) -> hanabi_protocol::BestScore {
        hanabi_protocol::BestScore {
            score: hanabi_protocol::Score(score),
            modified: self.0 != 0,
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
/// The longest table name that a checkpoint can hold, in bytes. Generated replay names can be
/// longer than a name that a player chooses.
const MAX_STORED_TABLE_NAME_LENGTH: usize = 200;
/// The most players that a pregame table remembers kicking.
const MAX_KICKED_PLAYERS: usize = 4096;
/// The most spectators that a table remembers, with the seat that each one shadows.
const MAX_SHADOWS: usize = 4096;

pub fn tag_too_long() -> String {
    format!("Tags cannot be longer than {MAX_TAG_LENGTH} characters.")
}

/// Converts the engine's options to their wire form. Both destructure every field, so adding an
/// option to either type fails to compile until the conversions are updated.
pub(crate) fn wire_options(options: &Options) -> hanabi_protocol::GameOptions {
    let Options {
        // The wire counts the players by their names.
        num_players: _,
        variant_name,
        // The variant name identifies the variant.
        variant_id: _,
        time_control,
        speedrun,
        deck_plays,
        empty_clues,
        one_extra_card,
        one_less_card,
        all_or_nothing,
        detrimental_characters,
        // Tables report their name and player limit apart from their options.
        table_name: _,
        max_players: _,
    } = options;
    hanabi_protocol::GameOptions {
        variant_name: variant_name.clone(),
        time_control: *time_control,
        speedrun: *speedrun,
        deck_plays: *deck_plays,
        empty_clues: *empty_clues,
        one_extra_card: *one_extra_card,
        one_less_card: *one_less_card,
        all_or_nothing: *all_or_nothing,
        detrimental_characters: *detrimental_characters,
    }
}

/// Converts wire options to the engine's.
pub(crate) fn engine_options(options: &hanabi_protocol::GameOptions) -> Options {
    let hanabi_protocol::GameOptions {
        variant_name,
        time_control,
        speedrun,
        deck_plays,
        empty_clues,
        one_extra_card,
        one_less_card,
        all_or_nothing,
        detrimental_characters,
    } = options;
    Options {
        // A table sets its player count when its game starts.
        num_players: hanabi_protocol::MIN_PLAYERS,
        variant_name: variant_name.clone(),
        variant_id: None,
        time_control: *time_control,
        speedrun: *speedrun,
        deck_plays: *deck_plays,
        empty_clues: *empty_clues,
        one_extra_card: *one_extra_card,
        one_less_card: *one_less_card,
        all_or_nothing: *all_or_nothing,
        detrimental_characters: *detrimental_characters,
        table_name: None,
        max_players: None,
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
        assert!(modifier.best_score(20).modified);
        assert!(!ScoreModifier::default().best_score(20).modified);
    }

    #[test]
    fn checkpoints_store_hypothetical_actions_as_objects() {
        let stored = serde_json::json!({
            "leader": 1, "segment": 0, "efficiencyModifier": 0, "hypothetical": true,
            "hypotheticalActions": [{"type": "unmorph", "order": 3}], "showDrawnCards": false
        });
        let replay: ReplayState = serde_json::from_value(stored.clone()).unwrap();
        assert!(matches!(
            replay.hypothetical_actions[..],
            [HypotheticalEvent::Unmorph(hanabi_protocol::TargetCard {
                order: hanabi_protocol::CardOrder(3)
            })]
        ));
        assert_eq!(serde_json::to_value(&replay).unwrap(), stored);
    }

    #[test]
    fn checkpoint_chat_keeps_its_archived_timestamp_but_sends_the_wire_form() {
        let chat = TableChat {
            id: Some(1),
            user: Some(UserId(1)),
            message: serde_json::from_value(serde_json::json!(
                {"text": "hi", "source": "user", "sentAt": "2026-11-02T20:00:00.123456Z"}
            ))
            .unwrap(),
        };
        assert_eq!(
            chat.wire_message().unwrap().sent_at.as_str(),
            "2026-11-02T20:00:00.123Z"
        );
        assert_eq!(chat.message.sent_at.as_str(), "2026-11-02T20:00:00.123456Z");
    }

    #[test]
    fn wire_and_engine_option_defaults_agree() {
        let defaults = Options::default();
        let wire = hanabi_protocol::GameOptions::default();
        assert_eq!(wire_options(&defaults), wire);
        assert_eq!(engine_options(&wire), defaults);
    }
}
