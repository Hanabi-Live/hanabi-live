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
#[schemars(extend("x-readonly" = true))]
pub struct ChatRequest {
    #[schemars(length(min = 1))]
    pub text: String,
    /// The table whose chat the message is for. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatPmRequest {
    #[schemars(length(min = 1))]
    pub text: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistoryRequest {
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub amount: i64,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub username: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatUserRequest {
    pub username: String,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatLinkedRequest {
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableJoinRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub password: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableLeaderRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub username: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct VariantChoice {
    pub variant_name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableVariantRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub options: VariantChoice,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(max = MAX_PLAYERS))]
    pub intended_player_names: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub hide_pregame: bool,
}

/// A player in a shared replay saying whether they will play again if the leader restarts.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartDeclineRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub declined: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSuggestRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSpectateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// The seat to shadow, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PlayerIndex")]
    pub shadowing_player_index: Option<u8>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingRequest {
    /// The settings to change, each with the type that `Settings` gives it.
    #[schemars(with = "Settings")]
    pub settings: serde_json::Map<String, serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InactiveRequest {
    pub inactive: bool,
}

/// A page of the player's own game history. Values out of range get a friendly warning.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryRequest {
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub offset: i64,
    /// The games on the page, from 1 to `MAX_PAGE_SIZE`.
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub amount: i64,
}

/// A page of the games on a seed, best scores first. Values out of range get a friendly warning.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistorySeedRequest {
    pub seed: String,
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub offset: i64,
    /// The games on the page, from 1 to `MAX_PAGE_SIZE`.
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub amount: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagSearchRequest {
    #[serde(default)]
    pub tag: String,
    /// The table whose chat the command was typed in. Absent means the lobby.
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
}

fn default_max_players() -> i64 {
    i64::from(DEFAULT_MAX_PLAYERS)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableCreateRequest {
    /// Blank uses the owner's name.
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub options: GameOptions,
    #[serde(default)]
    pub password: String,
    #[serde(default = "default_max_players")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub max_players: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableUpdateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub options: GameOptions,
    #[serde(default)]
    pub password: String,
    #[serde(default = "default_max_players")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub max_players: i64,
}

/// `id` replays a finished game from the database; `json` imports a game in the replay format.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReplaySource {
    Id,
    Json,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReplayVisibility {
    Solo,
    Shared,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayCreateRequest {
    pub source: ReplaySource,
    pub visibility: ReplayVisibility,
    #[serde(
        default,
        rename = "databaseID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "i32", range(min = 1, max = i32::MAX))]
    pub database_id: Option<i32>,
    #[serde(default, rename = "gameJSON", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ReplayImport")]
    pub game_json: Option<ReplayImport>,
    /// Replays cannot have a password; anything else is rejected.
    #[serde(default)]
    pub password: String,
    /// The seat to shadow, if any.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "PlayerIndex")]
    pub shadowing_player_index: Option<u8>,
    /// For a shared replay of a database game, spectate an existing shared replay of that game
    /// instead of creating another one, if there is one.
    #[serde(default)]
    pub join_existing: bool,
    /// For a shared replay, hide what happens later in the game: the turn slider, jumping to the
    /// end, and future strikes.
    #[serde(default)]
    pub spoiler_free: bool,
}

/// A turn in an ongoing game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ActionRequest {
    Play {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(with = "CardOrder")]
        order: i32,
    },
    Discard {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(with = "CardOrder")]
        order: i32,
    },
    ColorClue {
        #[serde(rename = "tableID")]
        table_id: TableId,
        /// The player who receives the clue.
        #[schemars(with = "PlayerIndex")]
        target: i32,
        /// The index of the color in the variant's clue colors.
        #[schemars(range(min = 0, max = MAX_SUIT_INDEX), extend("enum" = suits()))]
        color_index: i32,
    },
    RankClue {
        #[serde(rename = "tableID")]
        table_id: TableId,
        /// The player who receives the clue.
        #[schemars(with = "PlayerIndex")]
        target: i32,
        #[schemars(range(min = MIN_RANK, max = MAX_RANK), extend("enum" = ranks()))]
        rank: i32,
    },
}

impl ActionRequest {
    pub const fn table_id(&self) -> TableId {
        match self {
            Self::Play { table_id, .. }
            | Self::Discard { table_id, .. }
            | Self::ColorClue { table_id, .. }
            | Self::RankClue { table_id, .. } => *table_id,
        }
    }

    /// The turn's type, target, and value, as a game's record stores them.
    pub const fn recorded(&self) -> (RecordedActionType, i32, i32) {
        match *self {
            Self::Play { order, .. } => (RecordedActionType::Play, order, 0),
            Self::Discard { order, .. } => (RecordedActionType::Discard, order, 0),
            Self::ColorClue {
                target,
                color_index,
                ..
            } => (RecordedActionType::ColorClue, target, color_index),
            Self::RankClue { target, rank, .. } => (RecordedActionType::RankClue, target, rank),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PauseRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub setting: PauseSetting,
}

/// `pause-queue` pauses when the player's turn comes, or immediately if it is already their turn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum PauseSetting {
    Pause,
    Unpause,
    PauseQueue,
    PauseUnqueue,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub order: u64,
    pub note: String,
}

/// Adds or removes one tag on the table's game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub tag: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagsDeleteAllRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
}

/// A shared-replay leader's action, which the server applies and relays to everyone watching.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ReplayActionRequest {
    /// Moves everyone to a segment.
    Segment {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(range(min = 0, max = i32::MAX))]
        segment: i32,
    },
    /// Points at a card or a part of the board, or clears the arrow.
    Arrow {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(with = "ReplayArrowTarget")]
        target: i64,
    },
    Sound {
        #[serde(rename = "tableID")]
        table_id: TableId,
        sound: ReplaySoundEffect,
    },
    HypoStart {
        #[serde(rename = "tableID")]
        table_id: TableId,
    },
    HypoEnd {
        #[serde(rename = "tableID")]
        table_id: TableId,
    },
    HypoAction {
        #[serde(rename = "tableID")]
        table_id: TableId,
        action: HypotheticalAction,
    },
    /// Undoes the hypothetical's last turn.
    HypoBack {
        #[serde(rename = "tableID")]
        table_id: TableId,
    },
    /// Shows or hides the identities of cards drawn during the hypothetical.
    HypoShowDrawnCards {
        #[serde(rename = "tableID")]
        table_id: TableId,
        show_drawn_cards: bool,
    },
    EfficiencyModifier {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(range(min = i32::MIN, max = i32::MAX))]
        efficiency_modifier: i32,
    },
}

impl ReplayActionRequest {
    pub const fn table_id(&self) -> TableId {
        match self {
            Self::Segment { table_id, .. }
            | Self::Arrow { table_id, .. }
            | Self::Sound { table_id, .. }
            | Self::HypoStart { table_id }
            | Self::HypoEnd { table_id }
            | Self::HypoAction { table_id, .. }
            | Self::HypoBack { table_id }
            | Self::HypoShowDrawnCards { table_id, .. }
            | Self::EfficiencyModifier { table_id, .. } => *table_id,
        }
    }
}
