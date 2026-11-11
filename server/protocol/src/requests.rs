//! The requests that clients send.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatRequest {
    #[schemars(length(min = 1))]
    pub text: String,
    /// The table whose chat the message is for. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmRequest {
    #[schemars(length(min = 1))]
    pub text: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistoryRequest {
    #[schemars(range(min = 1, max = MAX_PRIVATE_HISTORY_MESSAGES))]
    pub amount: i64,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
    /// The other user in the conversation. Absent shows the messages with everyone.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub username: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatUserRequest {
    pub username: String,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatRoomRequest {
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRef {
    pub table_id: TableId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableJoinRequest {
    pub table_id: TableId,
    /// Absent when the user gives no password.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub password: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSetLeaderRequest {
    pub table_id: TableId,
    pub username: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSetVariantRequest {
    pub table_id: TableId,
    #[schemars(length(min = 1))]
    pub variant_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStartRequest {
    pub table_id: TableId,
    /// The players that the owner saw seated. The server ignores a start from an outdated view.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(max = MAX_PLAYERS), inner(length(min = 1)))]
    pub intended_player_names: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartRequest {
    pub table_id: TableId,
    #[serde(default)]
    pub hide_pregame: bool,
}

/// A player in a shared replay saying whether they will play again if the leader restarts.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartDeclineRequest {
    pub table_id: TableId,
    pub declined: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSuggestRequest {
    pub table_id: TableId,
    pub turn: Turn,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSpectateRequest {
    pub table_id: TableId,
    /// The seat to shadow, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadowing_player_index: Option<PlayerIndex>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingRequest {
    /// The settings to change, each with the type that `Settings` gives it.
    #[schemars(with = "Settings")]
    pub settings: serde_json::Map<String, serde_json::Value>,
    /// The settings to leave unset.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cleared: Vec<OptionalSetting>,
}

/// A setting that a user can leave unset.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum OptionalSetting {
    HGroupLevel,
}

impl OptionalSetting {
    /// The setting's name in `Settings`.
    pub const fn name(self) -> &'static str {
        match self {
            Self::HGroupLevel => "hGroupLevel",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InactiveRequest {
    pub inactive: bool,
}

/// A page of the player's own game history, newest first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameHistoryRequest {
    pub offset: Count,
    #[schemars(range(min = 1, max = MAX_PAGE_SIZE))]
    pub amount: i64,
}

/// A page of the games on a seed, best scores first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameHistoryOtherScoresRequest {
    pub seed: String,
    pub offset: Count,
    #[schemars(range(min = 1, max = MAX_PAGE_SIZE))]
    pub amount: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagSearchRequest {
    pub tag: String,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableCreateRequest {
    pub settings: TableSettings,
    /// Absent for a table without a password.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub password: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableUpdateRequest {
    pub table_id: TableId,
    pub settings: TableSettings,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReplayVisibility {
    Solo,
    Shared,
}

/// A request to watch a finished game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayCreateRequest {
    pub source: ReplaySource,
    pub visibility: ReplayVisibility,
    /// The seat to shadow, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadowing_player_index: Option<PlayerIndex>,
    /// For a shared replay of a saved game, spectate an existing shared replay of the same game
    /// instead of creating another one, if there is one.
    #[serde(default)]
    pub join_existing: bool,
    /// For a shared replay, hide what happens later in the game: the turn slider, jumping to the
    /// end, and future strikes.
    #[serde(default)]
    pub spoiler_free: bool,
}

/// The finished game that a replay shows: one from the database, or one imported in the replay
/// format.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplaySource {
    Saved { game_id: GameId },
    Imported { game: Box<ReplayGame> },
}

/// A turn in an ongoing game.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerActionRequest {
    pub table_id: TableId,
    pub action: PlayerAction,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PauseRequest {
    pub table_id: TableId,
    pub setting: PauseSetting,
}

/// `pauseQueue` pauses when the player's turn comes, or immediately if it is already their turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum PauseSetting {
    Pause,
    Unpause,
    PauseQueue,
    PauseUnqueue,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteRequest {
    pub table_id: TableId,
    pub order: CardOrder,
    pub text: String,
}

/// Adds or removes one tag on the table's game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagRequest {
    pub table_id: TableId,
    pub tag: String,
}

/// A shared-replay leader's action. The leader sends it, and the server applies it and relays it to
/// everyone watching.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayAction {
    pub table_id: TableId,
    pub action: ReplayLeaderAction,
}

/// What a shared-replay leader does.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplayLeaderAction {
    /// Moves everyone to a turn.
    Turn {
        turn: Turn,
    },
    /// Points at a card or a part of the board.
    Arrow {
        /// Absent to clear the arrow.
        #[serde(skip_serializing_if = "Option::is_none")]
        target: Option<ReplayArrowTarget>,
    },
    Sound {
        sound: ReplaySoundEffect,
    },
    HypoStart {},
    HypoEnd {},
    HypoAction {
        action: HypotheticalEvent,
    },
    /// Undoes the hypothetical's last turn.
    HypoBack {},
    /// Shows or hides the identities of cards drawn during the hypothetical.
    HypoShowDrawnCards {
        show_drawn_cards: bool,
    },
    EfficiencyModifier {
        #[schemars(range(min = i32::MIN, max = i32::MAX))]
        efficiency_modifier: i32,
    },
}
