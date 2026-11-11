//! A game in progress: its clocks, events, notes, and the data that loads it.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

/// Every player's clock.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clock {
    pub table_id: TableId,
    /// Each player's clock in milliseconds, in seat order: the time left in a timed game, or the
    /// time taken in an untimed one.
    #[schemars(with = "Vec<SafeInteger>", length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_times_ms: Vec<i64>,
    /// Absent when the game has no active player.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_player_index: Option<PlayerIndex>,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub time_taken_ms: i64,
}

/// Whether each player has loaded the game, in seat order.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connected {
    pub table_id: TableId,
    #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub connected: Vec<bool>,
}

/// Sent when an ongoing game is about to end because nobody has taken a turn for too long.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdleWarning {
    pub table_id: TableId,
    /// How long until the game ends, unless someone takes a turn or keeps it going.
    #[schemars(range(min = 0, max = IDLE_TIMEOUT_MS))]
    pub remaining_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pause {
    pub table_id: TableId,
    /// The seat that paused the game. Absent when the game is not paused.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause_player_index: Option<PlayerIndex>,
}

/// The votes to end the game, as one player sees them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoteChange {
    pub table_id: TableId,
    /// Whether the recipient voted.
    pub voted: bool,
    #[schemars(range(min = 0, max = MAX_PLAYERS))]
    pub num_votes: u8,
    /// How many votes end the game.
    #[schemars(range(min = 1, max = MAX_PLAYERS))]
    pub num_votes_needed: u8,
}

/// A card's suit and rank.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentity {
    pub suit_index: SuitIndex,
    pub rank: CardRank,
}

/// Every card's identity, by card order, once a game ends.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentities {
    pub table_id: TableId,
    #[schemars(length(max = MAX_DECK_SIZE))]
    pub deck: Vec<CardIdentity>,
}

/// Sent when a game ends: its players and spectators now watch its shared replay.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameFinished {
    pub table_id: TableId,
    /// Absent when the game was not saved.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<GameId>,
    pub shared_replay: SharedReplayInit,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStarted {
    pub table_id: TableId,
    pub stage: GameStage,
}

/// How far along a game is when the recipient enters it: it started just now, it is in progress,
/// or it is over and the recipient watches a replay.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum GameStage {
    JustStarted,
    InProgress,
    Replay,
}

/// One author's notes on every card.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerNotes {
    pub username: Username,
    #[schemars(with = "Notes")]
    pub notes: Vec<String>,
    pub is_spectator: bool,
}

/// One author's note on a single card.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardNote {
    /// The person setting the note.
    pub username: Username,
    pub text: String,
    pub is_spectator: bool,
}

/// Everyone's notes that the recipient may see, sent to spectators and replay viewers.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteList {
    pub table_id: TableId,
    pub notes: Vec<PlayerNotes>,
}

/// A player's own notes.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteListPlayer {
    pub table_id: TableId,
    #[schemars(with = "Notes")]
    pub notes: Vec<String>,
}

/// The notes on one card after someone changes theirs, sent to spectators.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    pub table_id: TableId,
    pub order: CardOrder,
    pub notes: Vec<CardNote>,
}

/// A clue's type and value: a color clue names one of the variant's clue colors, and a rank clue
/// names a rank.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Clue {
    Color { value: ColorIndex },
    Rank { value: RankClueNumber },
}

/// A card that a player draws, plays, or learns.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardEvent {
    pub player_index: PlayerIndex,
    pub order: CardOrder,
    /// Absent when the recipient may not see the card.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<CardIdentity>,
}

/// A card that a player discards, or fails to play.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiscardEvent {
    pub player_index: PlayerIndex,
    pub order: CardOrder,
    /// Absent when the recipient may not see the card.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity: Option<CardIdentity>,
    /// Whether the card was a failed play.
    pub failed: bool,
}

/// The start of a turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TurnEvent {
    pub turn: Turn,
    /// Absent once the game has ended.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_player_index: Option<PlayerIndex>,
}

/// A clue that a player gives.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClueEvent {
    /// Absent when the recipient may not see the clue's type and value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clue: Option<Clue>,
    /// The player who gives the clue.
    pub player_index: PlayerIndex,
    pub target: PlayerIndex,
    /// The orders of the cards the clue touched.
    pub orders: Vec<CardOrder>,
    /// Whether the cards that the clue does not touch learn nothing from it. Only a hypothetical's
    /// clue can set it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub ignore_negative: bool,
}

/// The end of a game.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameOverEvent {
    pub end_condition: EndCondition,
    /// The player whom the ending names, such as the one who timed out, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub player_index: Option<PlayerIndex>,
    /// The players who voted to end the game, when a vote ended it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub votes: Option<Vec<PlayerIndex>>,
}

/// Every player's time when a game ends.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerTimesEvent {
    /// Each player's clock in milliseconds, in seat order: the time left in a timed game, or the
    /// time taken in an untimed one.
    #[schemars(with = "Vec<SafeInteger>", length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_times_ms: Vec<i64>,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub duration_ms: i64,
}

/// One game event as a particular recipient sees it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GameEvent {
    Draw(CardEvent),
    Play(CardEvent),
    CardIdentity(CardEvent),
    Discard(DiscardEvent),
    Clue(ClueEvent),
    Turn(TurnEvent),
    GameOver(GameOverEvent),
    PlayerTimes(PlayerTimesEvent),
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameEventMessage {
    pub table_id: TableId,
    pub event: GameEvent,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameEventList {
    pub table_id: TableId,
    pub events: Vec<GameEvent>,
}

/// A player's detrimental character, in a game and in the replay format, with the value that some
/// characters are assigned.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CharacterAssignment {
    /// A player without a character.
    None {},
    /// A character without an assigned value.
    Plain { character_id: CharacterId },
    /// A character that is assigned a clue color, such as Fuming. The color is an index into the
    /// variant's clue colors.
    Color {
        character_id: CharacterId,
        color: ColorIndex,
    },
    /// A character that is assigned a rank, such as Awkward.
    Rank {
        character_id: CharacterId,
        rank: RankClueNumber,
    },
}

impl CharacterAssignment {
    /// The character, if the player has one.
    pub const fn character_id(self) -> Option<CharacterId> {
        match self {
            Self::None {} => None,
            Self::Plain { character_id }
            | Self::Color { character_id, .. }
            | Self::Rank { character_id, .. } => Some(character_id),
        }
    }
}

/// How the recipient takes part in a game, and what that needs. `ourPlayerIndex` is the seat that
/// the recipient sees the game from.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ViewMode {
    /// A player of a game in progress.
    Playing { our_player_index: PlayerIndex },
    /// A spectator of a game in progress who does not view it from a seat.
    Spectating {},
    /// A spectator of a game in progress who views it from a player's seat.
    Shadowing { our_player_index: PlayerIndex },
    /// A viewer of a finished game, alone.
    Replay {
        /// Absent when the game is not saved, such as an imported one.
        #[serde(skip_serializing_if = "Option::is_none")]
        game_id: Option<GameId>,
        /// The seat that the recipient played in or shadows, if any.
        #[serde(skip_serializing_if = "Option::is_none")]
        our_player_index: Option<PlayerIndex>,
    },
    /// A viewer of a finished game, with others.
    SharedReplay {
        /// Absent when the game is not saved, such as an imported one.
        #[serde(skip_serializing_if = "Option::is_none")]
        game_id: Option<GameId>,
        /// The seat that the recipient played in or shadows, if any.
        #[serde(skip_serializing_if = "Option::is_none")]
        our_player_index: Option<PlayerIndex>,
        shared_replay: SharedReplayInit,
    },
}

impl ViewMode {
    /// The seat that the recipient sees the game from, if any.
    pub const fn our_player_index(&self) -> Option<PlayerIndex> {
        match self {
            Self::Playing { our_player_index } | Self::Shadowing { our_player_index } => {
                Some(*our_player_index)
            }
            Self::Replay {
                our_player_index, ..
            }
            | Self::SharedReplay {
                our_player_index, ..
            } => *our_player_index,
            Self::Spectating {} => None,
        }
    }
}

/// Everything a client needs to draw a game, before its events arrive.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Init {
    pub table_id: TableId,
    #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_names: Vec<Username>,
    pub mode: ViewMode,
    pub has_custom_seed: bool,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    pub started_at: Timestamp,
    /// Absent while the game is in progress.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<Timestamp>,
    pub options: GameOptions,
    /// Each player's character, in seat order, when detrimental characters are on.
    #[schemars(length(max = MAX_PLAYERS))]
    pub characters: Vec<CharacterAssignment>,
    /// The seat that paused the game. Absent when the game is not paused.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pause_player_index: Option<PlayerIndex>,
    /// Whether the recipient asked to pause the game at their next turn.
    pub pause_queued: bool,
}

/// The state of a shared replay that a client joins.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SharedReplayInit {
    /// The table's owner, who leads the replay.
    pub owner_id: UserId,
    pub turn: Turn,
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub efficiency_modifier: i32,
    /// Whether the shared replay hides what happens later in the game.
    pub spoiler_free: bool,
    /// The players who will not play again if the leader restarts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_PLAYERS))]
    pub restart_declined: Vec<Username>,
    /// Whether the recipient played the game of this shared replay at this table, so that they can
    /// play it again: the leader by restarting, and the other players by saying if they are ready.
    pub can_play_again: bool,
    pub started_at: Timestamp,
}
