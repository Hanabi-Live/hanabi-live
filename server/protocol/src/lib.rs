//! Public wire contracts only: no database, actor, engine, or transport dependencies.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod registry;
pub use registry::{
    client_contracts, decode, decode_client, decode_server, server_contracts, validate,
};

pub const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Empty {}

/// Sent before a graceful restart or stop closes the connection.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Restart {
    /// HTML explaining the downtime, present only when an administrator gave a reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "state",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LobbyStatus {
    Loading {
        total_games: (),
    },
    Error {
        total_games: (),
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schemars(with = "String")]
        message: Option<String>,
    },
    Ready {
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        total_games: i64,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "TableID"))]
pub struct TableId(#[schemars(range(min = 0, max = MAX_SAFE_INTEGER))] pub u64);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatRequest {
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub room: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatPmRequest {
    #[schemars(length(min = 1))]
    pub msg: String,
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
    #[serde(default, rename = "beforeID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub before_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub username: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
#[schemars(extend("x-undefined-default" = ChatUserRequest::default()))]
pub struct ChatUserRequest {
    pub name: String,
    pub room: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
#[schemars(extend("x-undefined-default" = ChatLinkedRequest::default()))]
pub struct ChatLinkedRequest {
    pub room: String,
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
    pub name: String,
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
pub struct TableCommand {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub intended_variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(max = 6))]
    pub intended_players: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRestartRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub hide_pregame: bool,
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

fn negative_one() -> i64 {
    -1
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSpectateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default = "negative_one")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shadowing_player_index: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SettingRequest {
    pub name: String,
    /// The value as text; the server parses it according to the setting.
    pub setting: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InactiveRequest {
    pub inactive: bool,
}

/// A page of the player's own game history. Negative values get a friendly warning.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryRequest {
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub offset: i64,
    /// 0 requests every game.
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub amount: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistorySeedRequest {
    pub seed: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagSearchRequest {
    #[serde(default)]
    pub msg: String,
    #[serde(default)]
    pub room: String,
}

fn two() -> u8 {
    2
}

fn no_variant() -> String {
    "No Variant".into()
}

fn five() -> i64 {
    5
}

/// Game options for a new or updated table. Unset values take their defaults.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableOptions {
    #[serde(default = "two")]
    #[schemars(range(min = 2, max = 6))]
    pub num_players: u8,
    /// Only games from before April 2020 used another starting seat.
    #[serde(default)]
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub starting_player: i64,
    #[serde(default = "no_variant")]
    pub variant_name: String,
    #[serde(default, rename = "variantID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(min = 0, max = u32::MAX))]
    pub variant_id: Option<u32>,
    #[serde(default)]
    pub timed: bool,
    /// Minutes.
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_base: i64,
    /// Seconds.
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: i64,
    #[serde(default)]
    pub speedrun: bool,
    #[serde(default)]
    pub card_cycle: bool,
    #[serde(default)]
    pub deck_plays: bool,
    #[serde(default)]
    pub empty_clues: bool,
    #[serde(default)]
    pub one_extra_card: bool,
    #[serde(default)]
    pub one_less_card: bool,
    #[serde(default)]
    pub all_or_nothing: bool,
    #[serde(default)]
    pub detrimental_characters: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub table_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u8", range(min = 2, max = 6))]
    pub max_players: Option<u8>,
}

impl Default for TableOptions {
    fn default() -> Self {
        serde_json::from_value(serde_json::json!({})).expect("every option has a default")
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableCreateRequest {
    /// Blank uses the owner's name.
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub options: TableOptions,
    #[serde(default)]
    pub password: String,
    #[serde(default = "five")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub max_players: i64,
    #[serde(default)]
    pub hide_pregame: bool,
    /// A game to play from a custom deck, in the replay import format.
    #[serde(default, rename = "gameJSON", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "serde_json::Value")]
    pub game_json: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableUpdateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub options: TableOptions,
    #[serde(default)]
    pub password: String,
    #[serde(default = "five")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub max_players: i64,
    #[serde(default)]
    pub hide_pregame: bool,
    #[serde(default, rename = "gameJSON", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "serde_json::Value")]
    pub game_json: Option<serde_json::Value>,
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
    #[schemars(with = "serde_json::Value")]
    pub game_json: Option<serde_json::Value>,
    /// Replays cannot have a password; anything else is rejected.
    #[serde(default)]
    pub password: String,
    #[serde(default = "negative_one")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shadowing_player_index: i64,
}

/// Every player's remaining time, in milliseconds.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Clock {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(inner(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER)))]
    pub times: Vec<i64>,
    /// -1 when the game has no active player.
    #[schemars(range(min = -1, max = 5))]
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

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pause {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub active: bool,
    /// The seat that paused, or -1.
    #[schemars(range(min = -1, max = 5))]
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
    #[schemars(range(min = -1, max = MAX_SAFE_INTEGER))]
    pub suit_index: i64,
    #[schemars(range(min = -1, max = MAX_SAFE_INTEGER))]
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
pub struct ReplaySegment {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
}

/// The card the leader points at; negative values clear the arrow.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayIndicator {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub order: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplaySound {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub sound: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayLeader {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub name: String,
}

/// A spectator suggesting a turn to the shared replay's leader.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Suggestion {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub user_name: String,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub segment: i64,
}

/// The active hypothetical, sent to someone joining a shared replay.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Hypothetical {
    pub show_drawn_cards: bool,
    /// Client game actions, as JSON text, in order.
    pub actions: Vec<String>,
}

/// One client game action in a hypothetical, as JSON text.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct HypoAction(pub String);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HypoShowDrawnCards {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub show_drawn_cards: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayEfficiencyMod {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub r#mod: i32,
}

/// A turn in an ongoing game.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// 0 plays, 1 discards, 2 gives a color clue, and 3 gives a rank clue.
    #[serde(rename = "type")]
    #[schemars(extend("enum" = [0, 1, 2, 3]))]
    pub kind: u8,
    /// The card order for a play or discard; the player index for a clue.
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub target: i32,
    /// The clue's color index or rank.
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PauseRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// "pause", "unpause", or "pause-queue".
    pub setting: String,
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
    pub msg: String,
    #[serde(default)]
    pub room: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TagsDeleteAllRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default)]
    pub room: String,
}

/// A shared-replay leader's action. Which fields matter depends on `type`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayActionRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// 0 segment, 1 arrow, 2 sound, 3 start hypothetical, 4 end hypothetical,
    /// 5 hypothetical action, 6 hypothetical back, 7 toggle drawn cards, 8 efficiency modifier.
    #[serde(rename = "type")]
    #[schemars(range(min = 0, max = 8))]
    pub kind: u8,
    #[serde(default)]
    #[schemars(range(min = 0, max = i32::MAX))]
    pub segment: i32,
    #[serde(default)]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub order: i64,
    #[serde(default)]
    pub sound: String,
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
    /// A client game action, as JSON text, for a hypothetical action.
    #[serde(default, rename = "actionJSON")]
    #[schemars(length(max = 65_536))]
    pub action_json: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChatSource {
    User,
    Server,
    Discord,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub msg: String,
    pub source: ChatSource,
    #[schemars(length(min = 1))]
    pub datetime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub who: Option<String>,
    #[serde(default, rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    #[serde(default, rename = "pmID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub pm_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub recipient: Option<String>,
}

impl Chat {
    pub fn new(msg: impl Into<String>, source: ChatSource, datetime: impl Into<String>) -> Self {
        Self {
            msg: msg.into(),
            source,
            datetime: datetime.into(),
            who: None,
            chat_id: None,
            pm_id: None,
            room: None,
            recipient: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatDelete {
    #[serde(rename = "chatID")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: i64,
    pub room: LobbyRoom,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LobbyRoom {
    Lobby,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatList {
    #[schemars(extend("x-readonly" = true))]
    pub list: Vec<Chat>,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub unread: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistoryMessage {
    #[serde(rename = "pmID")]
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub pm_id: i64,
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub who: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
    #[schemars(length(min = 1))]
    pub datetime: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistory {
    #[schemars(extend("x-readonly" = true))]
    pub list: Vec<ChatHistoryMessage>,
    pub has_more: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub room: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatTyping {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub name: String,
    pub typing: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableStarted {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub replay: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "UserID"))]
pub struct UserId(#[schemars(range(min = 0, max = 2_147_483_647))] pub i32);

/// A user's presence in the lobby's user list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct User {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(length(min = 1))]
    pub name: String,
    /// The `Status` enum: lobby, pregame, playing, spectating, replay, or shared replay.
    #[schemars(
        range(min = 0, max = 5),
        extend("enum" = [0, 1, 2, 3, 4, 5], "x-enum" = "Status")
    )]
    pub status: u8,
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
    pub hyphenated: bool,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-readonly" = true))]
pub struct UserList(pub Vec<User>);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct UserLeft {
    #[serde(rename = "userID")]
    pub user_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct UserInactive {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Friends {
    #[schemars(extend("x-readonly" = true))]
    pub friends: Vec<String>,
}

/// A problem the client shows in a modal. The text may contain HTML.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ErrorNotice {
    #[schemars(length(min = 1))]
    pub error: String,
}

/// A recoverable problem the client shows in a modal. The text may contain HTML.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Warning {
    #[schemars(length(min = 1))]
    pub warning: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct SoundLobby {
    #[schemars(length(min = 1))]
    pub file: String,
}

/// A user's preferences. Missing fields take their default, so stored settings only need the values
/// a user changed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Settings {
    pub desktop_notification: bool,
    /// The `SoundMove` enum: all moves, only your own, or none.
    #[schemars(range(min = 0, max = 2), extend("enum" = [0, 1, 2], "x-enum" = "SoundMove"))]
    pub sound_move: u8,
    pub sound_timer: bool,
    pub keldon_mode: bool,
    pub colorblind_mode: bool,
    pub real_life_mode: bool,
    pub reverse_hands: bool,
    pub style_numbers: bool,
    pub show_timer_in_untimed: bool,
    #[schemars(range(min = 0, max = 100))]
    pub volume: u8,
    pub speedrun_preplay: bool,
    pub speedrun_mode: bool,
    pub hyphenated_conventions: bool,
    #[schemars(length(min = 1))]
    pub create_table_variant: String,
    pub create_table_timed: bool,
    #[schemars(range(min = 0, max = 86_400))]
    pub create_table_time_base_minutes: f64,
    #[schemars(range(min = 0, max = 604_800))]
    pub create_table_time_per_turn_seconds: i32,
    pub create_table_speedrun: bool,
    pub create_table_card_cycle: bool,
    pub create_table_deck_plays: bool,
    pub create_table_empty_clues: bool,
    pub create_table_one_extra_card: bool,
    pub create_table_one_less_card: bool,
    pub create_table_all_or_nothing: bool,
    pub create_table_detrimental_characters: bool,
    #[schemars(range(min = 2, max = 6), extend("enum" = [2, 3, 4, 5, 6]))]
    pub create_table_max_players: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            desktop_notification: false,
            sound_move: 0,
            sound_timer: true,
            keldon_mode: false,
            colorblind_mode: false,
            real_life_mode: false,
            reverse_hands: false,
            style_numbers: false,
            show_timer_in_untimed: false,
            volume: 50,
            speedrun_preplay: false,
            speedrun_mode: false,
            hyphenated_conventions: false,
            create_table_variant: "No Variant".into(),
            create_table_timed: false,
            create_table_time_base_minutes: 2.0,
            create_table_time_per_turn_seconds: 20,
            create_table_speedrun: false,
            create_table_card_cycle: false,
            create_table_deck_plays: false,
            create_table_empty_clues: false,
            create_table_one_extra_card: false,
            create_table_one_less_card: false,
            create_table_all_or_nothing: false,
            create_table_detrimental_characters: false,
            create_table_max_players: 5,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionMode {
    Initial,
    Reconnect,
}

/// The first message after connecting.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Welcome {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(length(min = 1))]
    pub username: String,
    /// Always null here; `lobbyStatus` reports the total once statistics load.
    #[schemars(
        required,
        range(min = 0, max = MAX_SAFE_INTEGER),
        extend("type" = ["integer", "null"])
    )]
    pub total_games: Option<i64>,
    pub muted: bool,
    pub first_time_user: bool,
    pub settings: Settings,
    pub connection_mode: ConnectionMode,
    #[schemars(extend("x-readonly" = true))]
    pub friends: Vec<String>,
    /// Ongoing games the user is a player in.
    #[schemars(extend("x-readonly" = true))]
    pub playing_at_tables: Vec<TableId>,
    /// A table the user was spectating when they disconnected.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub discon_spectating_table: Option<TableId>,
    /// The seat the user was shadowing at that table, or -1 for none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i8", range(min = -1, max = 5))]
    pub discon_shadowing_seat: Option<i8>,
}

/// A table's game options. Missing fields take the same defaults as the client's options.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct GameOptions {
    #[schemars(range(min = 2, max = 6), extend("enum" = [2, 3, 4, 5, 6]))]
    pub num_players: u8,
    #[schemars(range(min = 0, max = 5), extend("enum" = [0, 1, 2, 3, 4, 5]))]
    pub starting_player: u8,
    #[schemars(length(min = 1))]
    pub variant_name: String,
    #[serde(rename = "variantID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(min = 0, max = 4_294_967_295_u32))]
    pub variant_id: Option<u32>,
    pub timed: bool,
    pub time_base: f64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: i64,
    pub speedrun: bool,
    pub card_cycle: bool,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
    pub detrimental_characters: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub table_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u8", range(min = 2, max = 6), extend("enum" = [2, 3, 4, 5, 6]))]
    pub max_players: Option<u8>,
}

impl Default for GameOptions {
    fn default() -> Self {
        Self {
            num_players: 2,
            starting_player: 0,
            variant_name: "No Variant".into(),
            variant_id: None,
            timed: false,
            time_base: 0.0,
            time_per_turn: 0,
            speedrun: false,
            card_cycle: false,
            deck_plays: false,
            empty_clues: false,
            one_extra_card: false,
            one_less_card: false,
            all_or_nothing: false,
            detrimental_characters: false,
            table_name: None,
            max_players: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Spectator {
    #[schemars(length(min = 1))]
    pub name: String,
    /// The seat being shadowed, or -1 for none.
    #[schemars(range(min = -1, max = 5), extend("enum" = [-1, 0, 1, 2, 3, 4, 5]))]
    pub shadowing_player_index: i8,
    /// Present only while shadowing a seat.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub shadowing_player_username: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Spectators {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub spectators: Vec<Spectator>,
}

/// A table in the lobby's table list.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Table {
    pub id: TableId,
    /// Whether the recipient is one of the players.
    pub joined: bool,
    #[schemars(range(min = 2, max = 6), extend("enum" = [2, 3, 4, 5, 6]))]
    pub max_players: u8,
    #[schemars(length(min = 1))]
    pub name: String,
    /// The current number of players, which can be below the minimum during a pregame.
    #[schemars(range(min = 0, max = 6))]
    pub num_players: u8,
    pub options: GameOptions,
    #[serde(rename = "ownerID")]
    pub owner_id: UserId,
    pub password_protected: bool,
    pub players: Vec<String>,
    /// The percentage of the maximum score reached, or of a replay watched.
    #[schemars(range(min = 0, max = 100))]
    pub progress: u8,
    pub running: bool,
    pub shared_replay: bool,
    #[schemars(extend("x-readonly" = true))]
    pub spectators: Vec<Spectator>,
    pub time_base: f64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: i64,
    pub timed: bool,
    #[schemars(length(min = 1))]
    pub variant: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-readonly" = true))]
pub struct TableList(pub Vec<Table>);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "GameID"))]
pub struct GameId(#[schemars(range(min = 0, max = 2_147_483_647))] pub i32);

/// A completed game in a player's history.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct GameHistory {
    pub id: GameId,
    pub options: GameOptions,
    pub seed: String,
    #[schemars(range(min = 0, max = 2_147_483_647))]
    pub score: i32,
    #[schemars(range(min = 0, max = 2_147_483_647))]
    pub num_turns: i32,
    /// The `EndCondition` enum.
    #[schemars(
        range(min = 0, max = 10),
        extend("enum" = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "x-enum" = "EndCondition")
    )]
    pub end_condition: u8,
    #[schemars(extend("x-date" = true))]
    pub datetime_started: String,
    #[schemars(extend("x-date" = true))]
    pub datetime_finished: String,
    #[schemars(range(min = 0, max = 2_147_483_647))]
    pub num_games_on_this_seed: i64,
    #[schemars(extend("x-readonly" = true))]
    pub player_names: Vec<String>,
    /// Whether this game should be added to the recipient's total.
    pub increment_num_games: bool,
    /// The game's tags, separated by commas.
    pub tags: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-readonly" = true))]
pub struct GameHistoryList(pub Vec<GameHistory>);

/// The other games played on a seed.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct GameHistoryOtherScores {
    #[schemars(extend("x-readonly" = true))]
    pub games: Vec<GameHistory>,
    #[schemars(length(min = 1))]
    pub variant_name: String,
    #[schemars(length(min = 1))]
    pub seed: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameBestScore {
    #[schemars(range(min = 2, max = 6))]
    pub num_players: u8,
    #[schemars(range(min = 0, max = 2_147_483_647))]
    pub score: i32,
    #[schemars(range(min = 0, max = 2_147_483_647))]
    pub modifier: i32,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameVariantStats {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub num_games: i64,
    /// The best score for each player count.
    pub best_scores: Vec<PregameBestScore>,
}

/// A pregame player's statistics: all of their games, and their games on the table's variant.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameStats {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub num_games: i64,
    pub variant: PregameVariantStats,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregamePlayer {
    #[schemars(range(min = 0, max = 5))]
    pub index: u8,
    pub name: String,
    /// Whether this player is the recipient.
    pub you: bool,
    /// Whether this player is connected and at the table.
    pub present: bool,
    pub stats: PregameStats,
}

/// A pregame's state, sent to the people at the table.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pregame {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub name: String,
    pub owner: UserId,
    pub players: Vec<PregamePlayer>,
    pub options: GameOptions,
    pub password_protected: bool,
    #[schemars(range(min = 2, max = 6))]
    pub max_players: u8,
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
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub order: i64,
    pub notes: Vec<CardNote>,
}

/// An integer that JavaScript represents exactly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct SafeInteger(#[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))] pub i64);

/// A clue as its recipient sees it. A clue the recipient may not see hides both its type and value.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(untagged, deny_unknown_fields)]
pub enum ReceivedClue {
    Visible {
        /// 0 for a color clue, 1 for a rank clue.
        #[serde(rename = "type")]
        #[schemars(range(min = 0, max = 1), extend("enum" = [0, 1]))]
        clue_type: i32,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        value: i32,
    },
    Hidden {
        #[serde(rename = "type")]
        #[schemars(extend("const" = -1))]
        clue_type: i32,
        #[schemars(extend("const" = -1))]
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
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        player_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        order: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        suit_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        rank: i64,
    },
    Play {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        player_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        order: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        suit_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        rank: i64,
    },
    CardIdentity {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        player_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        order: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        suit_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        rank: i64,
    },
    Discard {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        player_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        order: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        suit_index: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        rank: i64,
        failed: bool,
    },
    Clue {
        clue: ReceivedClue,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        giver: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        target: i64,
        /// The orders of the cards the clue touched.
        #[schemars(extend("x-readonly" = true))]
        list: Vec<SafeInteger>,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        turn: i64,
    },
    Strike {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        num: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        turn: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        order: i64,
    },
    Status {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        clues: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        score: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        max_score: i64,
    },
    Turn {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        num: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        current_player_index: i64,
    },
    GameOver {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        end_condition: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        player_index: i64,
        /// The players who voted to end the game, or null.
        #[schemars(
            required,
            extend("type" = ["array", "null"], "x-readonly" = true)
        )]
        votes: Option<Vec<SafeInteger>>,
    },
    PlayerTimes {
        #[schemars(extend("x-readonly" = true))]
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
    pub player_names: Vec<String>,
    /// The seat the recipient views the game from.
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
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
    pub datetime_started: String,
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
    pub paused: bool,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub pause_player_index: i64,
    pub pause_queued: bool,
}

pub fn schemas() -> std::collections::BTreeMap<String, serde_json::Value> {
    let mut schemas = std::collections::BTreeMap::new();
    macro_rules! register {
        ($($ty:ty),+ $(,)?) => {$(
            schemas.insert(stringify!($ty).into(), serde_json::to_value(schemars::schema_for!($ty)).unwrap());
        )+};
    }
    register!(
        ChatRequest,
        ChatPmRequest,
        ChatHistoryRequest,
        ChatUserRequest,
        ChatLinkedRequest,
        TableId,
        TableRequest,
        TableJoinRequest,
        TableLeaderRequest,
        TableVariantRequest,
        TableCommand,
        TableStartRequest,
        TableRestartRequest,
        TableSuggestRequest,
        TableSpectateRequest,
        SettingRequest,
        InactiveRequest,
        HistoryRequest,
        HistorySeedRequest,
        TagSearchRequest,
        TableOptions,
        TableCreateRequest,
        TableUpdateRequest,
        ReplayCreateRequest,
        Clock,
        Connected,
        Pause,
        VoteChange,
        CardIdentity,
        CardIdentities,
        FinishOngoingGame,
        ReplaySegment,
        ReplayIndicator,
        ReplaySound,
        ReplayLeader,
        Suggestion,
        Hypothetical,
        HypoAction,
        HypoShowDrawnCards,
        ReplayEfficiencyMod,
        ActionRequest,
        PauseRequest,
        NoteRequest,
        TagRequest,
        TagsDeleteAllRequest,
        ReplayActionRequest,
        Chat,
        ChatDelete,
        ChatList,
        ChatHistoryMessage,
        ChatHistory,
        ChatTyping,
        TableStarted,
        Empty,
        Restart,
        LobbyStatus,
        UserId,
        User,
        UserList,
        UserLeft,
        UserInactive,
        Friends,
        ErrorNotice,
        Warning,
        SoundLobby,
        Settings,
        ConnectionMode,
        Welcome,
        GameOptions,
        Spectator,
        Spectators,
        Table,
        TableList,
        GameId,
        GameHistory,
        GameHistoryList,
        GameHistoryOtherScores,
        PregameBestScore,
        PregameVariantStats,
        PregameStats,
        PregamePlayer,
        Pregame,
        PlayerNotes,
        CardNote,
        NoteList,
        NoteListPlayer,
        Note,
        ReceivedClue,
        GameEvent,
        GameAction,
        GameActionList,
        Init,
        SafeInteger,
    );
    schemas
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn cross_language_fixtures_preserve_acceptance_and_normalization() {
        let cases: Vec<Value> =
            serde_json::from_str(include_str!("../fixtures/compatibility.json")).unwrap();
        for case in cases {
            let command = case["command"].as_str().unwrap();
            let result = if case["direction"] == "client" {
                decode_client(command, &case["input"])
            } else {
                decode_server(command, &case["input"])
            };
            let valid = case["nativeValid"]
                .as_bool()
                .unwrap_or(case["valid"].as_bool().unwrap());
            assert_eq!(result.is_ok(), valid, "{}", case["name"]);
            if let Ok(data) = result {
                let data = data.expect("Fixture must exercise a registered wire contract");
                assert_eq!(
                    data,
                    case.get("normalized").unwrap_or(&case["input"]).clone(),
                    "{}",
                    case["name"]
                );
            }
        }
    }

    #[test]
    fn optional_values_are_omitted_not_null() {
        let error = decode::<ChatRequest>(&json!({
            "msg": "private text", "room": null
        }))
        .unwrap_err();
        assert!(!format!("{error:#}").contains("private text"));
        let data = decode::<ChatRequest>(&json!({"msg":"hello","room":"lobby"})).unwrap();
        assert_eq!(
            serde_json::to_value(data).unwrap(),
            json!({"msg":"hello","room":"lobby"})
        );
    }
}
