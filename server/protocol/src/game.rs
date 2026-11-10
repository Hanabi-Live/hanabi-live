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
    #[schemars(inner(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER)))]
    pub times: Vec<i64>,
    /// -1 when the game has no active player.
    #[schemars(with = "PlayerIndexOrNone")]
    pub active_player_index: i64,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub time_taken: i64,
}

/// Whether each player has loaded the game, in seat order.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Connected {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub list: Vec<bool>,
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
    pub active: bool,
    /// The seat that paused, or -1.
    #[schemars(with = "PlayerIndexOrNone")]
    pub player_index: i64,
}

/// The recipient's own vote to end the game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoteChange {
    pub vote: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentity {
    #[schemars(with = "SuitIndexOrUnknown")]
    pub suit_index: i64,
    #[schemars(with = "RankOrUnknown")]
    pub rank: i64,
}

/// Every card's identity, by card order, once a game ends.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardIdentities {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub card_identities: Vec<CardIdentity>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FinishOngoingGame {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// 0 when the game was not saved.
    #[serde(rename = "databaseID")]
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub database_id: i64,
    pub shared_replay_leader: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStarted {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub replay: bool,
    /// Whether the game started just now, rather than the recipient joining a game in progress.
    pub just_started: bool,
}

/// One author's notes on every card.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerNotes {
    pub name: String,
    pub notes: Vec<String>,
    pub is_spectator: bool,
}

/// One author's note on a single card.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardNote {
    /// The username of the person setting the note.
    pub name: String,
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
    #[schemars(with = "CardOrder")]
    pub order: i64,
    pub notes: Vec<CardNote>,
}

/// A clue's type and value, as the server relays them. `ReceivedClue` describes the values it holds.
#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clue {
    #[serde(rename = "type")]
    pub clue_type: i32,
    pub value: i32,
}

/// A clue as its recipient sees it: a color clue names a suit's color, a rank clue names a rank,
/// and a clue the recipient may not see hides both its type and value.
#[derive(JsonSchema)]
#[serde(untagged, deny_unknown_fields)]
pub enum ReceivedClue {
    Color {
        #[serde(rename = "type")]
        #[schemars(extend("enum" = [ClueType::Color as i32], "x-enum" = "ClueType"))]
        clue_type: i32,
        #[schemars(range(min = 0, max = MAX_SEAT), extend("enum" = seats()))]
        value: i32,
    },
    Rank {
        #[serde(rename = "type")]
        #[schemars(extend("enum" = [ClueType::Rank as i32], "x-enum" = "ClueType"))]
        clue_type: i32,
        #[schemars(range(min = MIN_RANK, max = MAX_RANK), extend("enum" = ranks()))]
        value: i32,
    },
    Hidden {
        #[serde(rename = "type")]
        #[schemars(extend("const" = NO_VALUE))]
        clue_type: i32,
        #[schemars(extend("const" = NO_VALUE))]
        value: i32,
    },
}

/// One game event as a particular recipient sees it. Unknown card identities are -1.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GameEvent {
    Draw {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        #[schemars(with = "SuitIndexOrUnknown")]
        suit_index: i64,
        #[schemars(with = "RankOrUnknown")]
        rank: i64,
    },
    Play {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        #[schemars(with = "SuitIndexOrUnknown")]
        suit_index: i64,
        #[schemars(with = "RankOrUnknown")]
        rank: i64,
    },
    CardIdentity {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        #[schemars(with = "SuitIndexOrUnknown")]
        suit_index: i64,
        #[schemars(with = "RankOrUnknown")]
        rank: i64,
    },
    Discard {
        #[schemars(with = "PlayerIndex")]
        player_index: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
        #[schemars(with = "SuitIndexOrUnknown")]
        suit_index: i64,
        #[schemars(with = "RankOrUnknown")]
        rank: i64,
        failed: bool,
    },
    Clue {
        #[schemars(with = "ReceivedClue")]
        clue: Clue,
        #[schemars(with = "PlayerIndex")]
        giver: i64,
        #[schemars(with = "PlayerIndex")]
        target: i64,
        /// The orders of the cards the clue touched.
        #[schemars(with = "Vec<CardOrder>", extend("x-readonly" = true))]
        list: Vec<SafeInteger>,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        turn: i64,
    },
    Turn {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        num: i64,
        #[schemars(with = "PlayerIndexOrNone")]
        current_player_index: i64,
    },
    GameOver {
        end_condition: EndCondition,
        #[schemars(with = "PlayerIndexOrNone")]
        player_index: i64,
        /// The players who voted to end the game, or null.
        #[schemars(
            with = "Option<Vec<PlayerIndex>>",
            required,
            extend("type" = ["array", "null"], "x-readonly" = true)
        )]
        votes: Option<Vec<SafeInteger>>,
    },
    PlayerTimes {
        /// Each player's time, in seat order.
        #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS), extend("x-readonly" = true))]
        player_times: Vec<SafeInteger>,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        duration: i64,
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
    pub list: Vec<GameEvent>,
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
    #[schemars(with = "PlayerIndex")]
    pub our_player_index: i64,
    pub spectating: bool,
    pub shadowing: bool,
    pub replay: bool,
    /// The game's database ID in a replay, or -1.
    #[serde(rename = "databaseID")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub database_id: i64,
    pub has_custom_seed: bool,
    pub seed: String,
    #[schemars(with = "Timestamp")]
    pub datetime_started: String,
    #[schemars(with = "Timestamp")]
    pub datetime_finished: String,
    pub options: GameOptions,
    /// Each player's character ID, when detrimental characters are on.
    pub character_assignments: Vec<SafeInteger>,
    pub character_metadata: Vec<SafeInteger>,
    pub shared_replay: bool,
    pub shared_replay_leader: String,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shared_replay_segment: i64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shared_replay_eff_mod: i64,
    /// Whether the shared replay hides what happens later in the game.
    pub spoiler_free: bool,
    /// The players in a shared replay who will not play again if the leader restarts.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    #[schemars(length(max = MAX_PLAYERS))]
    pub restart_declined: Vec<String>,
    /// When the shared replay began, present only in shared replays.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Timestamp")]
    pub datetime_shared_replay_started: Option<String>,
    pub paused: bool,
    /// The seat that paused, or -1.
    #[schemars(with = "PlayerIndexOrNone")]
    pub pause_player_index: i64,
    pub pause_queued: bool,
}
