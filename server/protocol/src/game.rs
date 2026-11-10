//! A game in progress: its clocks, events, notes, and the data that loads it.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

/// Every player's remaining time, in milliseconds.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clock {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(with = "Vec<SafeInteger>")]
    pub player_times_ms: Vec<i64>,
    /// Absent when the game has no active player.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PlayerIndex")]
    pub active_player_index: Option<PlayerIndex>,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub time_taken_ms: i64,
}

/// Whether each player has loaded the game, in seat order.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connected {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub connected: Vec<bool>,
}

/// Sent when an ongoing game is about to end because nobody has taken a turn for too long.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdleWarning {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// How long until the game ends, unless someone takes a turn or keeps it going.
    #[schemars(range(min = 0, max = IDLE_TIMEOUT_MS))]
    pub remaining_ms: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pause {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// The seat that paused the game. Absent when the game is not paused.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PlayerIndex")]
    pub player_index: Option<PlayerIndex>,
}

/// The votes to end the game, as one player sees them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoteChange {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// Whether the recipient voted.
    pub vote: bool,
    /// How many players voted.
    #[schemars(range(min = 0, max = MAX_PLAYERS))]
    pub votes: u8,
    /// How many votes end the game.
    #[schemars(range(min = 1, max = MAX_PLAYERS))]
    pub votes_needed: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentity {
    /// Absent when the recipient may not see the card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "SuitIndex")]
    pub suit_index: Option<SuitIndex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "CardRank")]
    pub rank: Option<CardRank>,
}

/// Every card's identity, by card order, once a game ends.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentities {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub identities: Vec<CardIdentity>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FinishOngoingGame {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// Absent when the game was not saved.
    #[serde(
        default,
        rename = "databaseID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "GameId")]
    pub database_id: Option<GameId>,
    pub shared_replay: SharedReplayInit,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStarted {
    #[serde(rename = "tableID")]
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
    pub username: String,
    pub notes: Vec<String>,
    pub is_spectator: bool,
}

/// One author's note on a single card.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardNote {
    /// The person setting the note.
    pub username: String,
    pub text: String,
    pub is_spectator: bool,
}

/// Everyone's notes that the recipient may see, sent to spectators and replay viewers.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteList {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub notes: Vec<PlayerNotes>,
}

/// A player's own notes, by card order.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteListPlayer {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub notes: Vec<String>,
}

/// The notes on one card after someone changes theirs, sent to spectators.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Note {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub order: CardOrder,
    pub notes: Vec<CardNote>,
}

/// A clue's type and value. `ReceivedClue` describes the values it holds.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clue {
    #[serde(rename = "type")]
    pub clue_type: ClueType,
    pub value: i32,
}

/// A clue's type and value: a color clue names a suit's color, and a rank clue names a rank.
#[derive(JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum ReceivedClue {
    Color {
        /// The index of the color in the variant's clue colors.
        value: ColorIndex,
    },
    Rank {
        value: RankClueNumber,
    },
}

/// One game event as a particular recipient sees it. A card identity that the recipient may not see
/// is absent.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GameEvent {
    Draw {
        player_index: PlayerIndex,
        order: CardOrder,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<SuitIndex>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<CardRank>,
    },
    Play {
        player_index: PlayerIndex,
        order: CardOrder,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<SuitIndex>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<CardRank>,
    },
    CardIdentity {
        player_index: PlayerIndex,
        order: CardOrder,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<SuitIndex>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<CardRank>,
    },
    Discard {
        player_index: PlayerIndex,
        order: CardOrder,
        /// Absent when the recipient may not see the card.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "SuitIndex")]
        suit_index: Option<SuitIndex>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "CardRank")]
        rank: Option<CardRank>,
        failed: bool,
    },
    Clue {
        /// Absent when the recipient may not see the clue's type and value.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "ReceivedClue")]
        clue: Option<Clue>,
        giver: PlayerIndex,
        target: PlayerIndex,
        /// The orders of the cards the clue touched.
        #[schemars(extend("x-readonly" = true))]
        orders: Vec<CardOrder>,
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        turn: i64,
    },
    Turn {
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        num: i64,
        /// Absent once the game has ended.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "PlayerIndex")]
        current_player_index: Option<PlayerIndex>,
    },
    GameOver {
        end_condition: EndCondition,
        /// The player whom the ending names, such as the one who timed out, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "PlayerIndex")]
        player_index: Option<PlayerIndex>,
        /// The players who voted to end the game, when a vote ended it.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "Vec<PlayerIndex>", extend("x-readonly" = true))]
        votes: Option<Vec<PlayerIndex>>,
    },
    PlayerTimes {
        /// Each player's time, in seat order.
        #[schemars(
            with = "Vec<SafeInteger>",
            length(min = MIN_PLAYERS, max = MAX_PLAYERS),
            extend("x-readonly" = true)
        )]
        player_times_ms: Vec<i64>,
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        duration_ms: i64,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameAction {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub action: GameEvent,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameActionList {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub actions: Vec<GameEvent>,
}

/// A player's detrimental character.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CharacterAssignment {
    /// Absent when the player has no character.
    #[serde(
        default,
        rename = "characterID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "u32", range(min = 0, max = i32::MAX))]
    pub character_id: Option<u32>,
    /// A value that some characters use, such as the rank or suit they may not clue. Absent for
    /// other characters.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub metadata: Option<i32>,
}

/// How the recipient takes part in a game: as a player or a spectator of a game in progress, as a
/// spectator who views it from a player's seat (shadowing), or as a viewer of a finished game, alone
/// (replay) or with others (shared replay).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ViewMode {
    Playing,
    Spectating,
    Shadowing,
    Replay,
    SharedReplay,
}

/// Everything a client needs to draw a game, before its events arrive.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Init {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_names: Vec<String>,
    /// The seat the recipient views the game from.
    pub our_player_index: PlayerIndex,
    pub mode: ViewMode,
    /// The game's database ID, present only in a replay of a saved game.
    #[serde(
        default,
        rename = "databaseID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "GameId")]
    pub database_id: Option<GameId>,
    pub has_custom_seed: bool,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub seed: Option<String>,
    #[schemars(with = "Timestamp")]
    pub datetime_started: String,
    /// Absent while the game is in progress.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Timestamp")]
    pub datetime_finished: Option<String>,
    pub options: GameOptions,
    /// Each player's character, in seat order, when detrimental characters are on.
    #[schemars(length(max = MAX_PLAYERS))]
    pub characters: Vec<CharacterAssignment>,
    /// Present only when `mode` is `sharedReplay`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "SharedReplayInit")]
    pub shared_replay: Option<SharedReplayInit>,
    /// The seat that paused the game. Absent when the game is not paused.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PlayerIndex")]
    pub pause_player_index: Option<PlayerIndex>,
    /// Whether the recipient asked to pause the game at their next turn.
    pub pause_queued: bool,
}

/// The state of a shared replay that a client joins.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SharedReplayInit {
    pub leader: String,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub efficiency_modifier: i64,
    /// Whether the shared replay hides what happens later in the game.
    pub spoiler_free: bool,
    /// The players who will not play again if the leader restarts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_PLAYERS))]
    pub restart_declined: Vec<String>,
    /// Whether the recipient played the game of this shared replay at this table, so that they can
    /// play it again: the leader by restarting, and the other players by saying if they are ready.
    pub can_play_again: bool,
    #[schemars(with = "Timestamp")]
    pub datetime_started: String,
}
