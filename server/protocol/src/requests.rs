//! The requests that clients send.
//!
//! Text that a person types has no length bounds here: the server trims it, checks it, and answers
//! a bad value with a warning that states the limit. The schemas bound only the structure, such as
//! an optional text that cannot be empty, since only its absence means that there is none.

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
    pub text: String,
    /// The table whose chat the message is for. Absent means the lobby.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmRequest {
    pub text: String,
    pub recipient: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChatPmHistoryRequest {
    pub limit: PageLimit,
    /// The other user in the conversation. Absent shows the messages with everyone.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub recipient: Option<String>,
}

/// Adds a user to, or removes them from, the sender's friends, links, or blocked users.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RelationshipRequest {
    pub username: String,
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

/// The owner handing the table, and the lead of its shared replay, to another user at it.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSetOwnerRequest {
    pub table_id: TableId,
    pub user_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStartRequest {
    pub table_id: TableId,
    /// The players that the owner saw seated. The server ignores a start from an outdated view.
    #[schemars(length(max = MAX_PLAYERS))]
    pub intended_player_ids: Vec<UserId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartRequest {
    pub table_id: TableId,
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
pub struct SettingsRequest {
    pub settings: SettingsChange,
    /// The optional settings to leave unset.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cleared: Vec<OptionalSetting>,
}

named_enum! {
    /// A setting that a user can leave unset, by its name in `Settings`.
    pub enum OptionalSetting {
        HGroupLevel => "hGroupLevel",
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserInactiveRequest {
    pub inactive: bool,
}

/// A page of a list of games: in `gameHistory`, the player's own games, newest first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PageRequest {
    pub offset: Count,
    pub limit: PageLimit,
}

/// A page of the games on a seed, best scores first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeedGamesRequest {
    pub seed: Seed,
    #[serde(flatten)]
    pub page: PageRequest,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagSearchRequest {
    /// At most `MAX_TAG_LENGTH` characters. The server answers a longer or blank tag with a
    /// warning.
    pub tag: String,
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

/// Who watches a replay: its creator alone, or anyone who joins it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplayVisibility {
    Solo {},
    Shared {
        /// For a saved game, spectate an existing shared replay of the same game instead of
        /// creating another one, if there is one.
        join_existing: bool,
        /// Hide what happens later in the game: the turn slider, jumping to the end, and future
        /// strikes.
        spoiler_free: bool,
    },
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
    /// The server keeps at most `MAX_NOTE_LENGTH` characters of it.
    pub text: String,
}

/// Adds or removes one tag on the table's game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagRequest {
    pub table_id: TableId,
    /// At most `MAX_TAG_LENGTH` characters. The server answers a longer or blank tag with a
    /// warning.
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
    /// Moves the count of cards that the efficiency uses.
    Efficiency {
        modifier: EfficiencyModifier,
    },
    Hypothetical {
        control: HypotheticalControl,
    },
}

/// How a shared-replay leader changes the hypothetical.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HypotheticalControl {
    Start {},
    End {},
    /// Adds an event to the hypothetical.
    Event {
        event: HypotheticalEvent,
    },
    /// Undoes the hypothetical's last turn.
    Back {},
    /// Shows or hides the identities of cards drawn during the hypothetical.
    ShowDrawnCards {
        show: bool,
    },
}
