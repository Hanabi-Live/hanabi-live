//! Public wire contracts and the game catalog format only: no database, actor, engine, or
//! transport dependencies.

pub use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod enums;
pub use enums::{
    ActionType, ClueType, EndCondition, GameListColumn, RecordedActionType, ReplayArrowOrder,
    SoundMove, Status, WIRE_ENUMS, WireEnum, WireEnumMember,
};
mod registry;
pub use registry::{
    ClientMessage, ServerMessage, client_contracts, decode, decode_server, server,
    server_contracts, validate,
};

/// The largest integer that JavaScript numbers hold exactly (`Number.MAX_SAFE_INTEGER`).
pub const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

/// The fewest players a game can have.
pub const MIN_PLAYERS: usize = 2;
/// The most players a game can have, which also bounds every per-player list.
pub const MAX_PLAYERS: usize = 6;
/// The highest seat index.
pub const MAX_SEAT: usize = MAX_PLAYERS - 1;
/// The value that marks a missing number, such as no seat or turn, or a suit or rank that the
/// recipient may not see.
pub const NO_VALUE: i32 = -1;
/// The finish time of a game that has not finished: the start of year 1.
pub const UNFINISHED_DATETIME: &str = "0001-01-01T00:00:00.000Z";
/// The player limit of a table whose creator did not choose one.
pub const DEFAULT_MAX_PLAYERS: u8 = 5;
/// The variant of a game or table that does not choose one.
pub const DEFAULT_VARIANT_NAME: &str = "No Variant";
/// What follows the creator's name to name a table whose creator did not choose a name.
pub const DEFAULT_TABLE_NAME_SUFFIX: &str = "'s table";
/// The `code` of the login error for a client from a different release, which reloads the page.
pub const OUTDATED_CLIENT_CODE: &str = "outdated_client";
/// The most suits a variant can have.
pub const MAX_SUITS: usize = 6;
/// The lowest rank.
pub const MIN_RANK: i32 = 1;
/// The highest normal rank, which is also a suit's stack size unless the variant sets one.
pub const MAX_RANK: i32 = 5;
/// The rank of a stack's start card, which Up or Down variants add to each suit.
pub const START_CARD_RANK: i32 = 7;
/// The rank clue that touches the odd ranks in an Odds and Evens variant.
pub const ODD_RANK_CLUE: i32 = 1;
/// The rank clue that touches the even ranks in an Odds and Evens variant.
pub const EVEN_RANK_CLUE: i32 = 2;
/// Clue tokens in play at most, before a clue-starved variant doubles their count.
pub const MAX_CLUES: i32 = 8;
/// The strikes that end a game.
pub const MAX_STRIKES: i32 = 3;
/// The clues at or below which a Panicky player must discard twice, before a clue-starved variant
/// doubles their count.
pub const PANICKY_MAX_CLUES: i32 = 4;
/// The most cards a deck can have.
pub const MAX_DECK_SIZE: usize = 60;
/// The most actions a game can record.
pub const MAX_GAME_ACTIONS: usize = 512;
/// The longest seed that a table can request, in bytes. The full seed also names the player count
/// and variant, such as "p3v0s" before "123".
pub const MAX_SEED_LENGTH: usize = 32;
/// The longest note, in bytes, that an imported game can give a card.
pub const MAX_IMPORTED_NOTE_LENGTH: usize = 65536;
/// The number of seconds in a minute.
pub const SECONDS_PER_MINUTE: i32 = 60;
/// Player clocks and idle timers hold milliseconds; time options hold seconds.
pub const CLOCK_UNITS_PER_SECOND: i32 = 1000;
/// The clock units in a minute.
pub const CLOCK_UNITS_PER_MINUTE: i64 = (SECONDS_PER_MINUTE * CLOCK_UNITS_PER_SECOND) as i64;
/// How long a game can go without a move before it ends.
pub const IDLE_TIMEOUT_MS: i64 = 30 * CLOCK_UNITS_PER_MINUTE;
/// How long a typing indicator lasts without another keystroke, in milliseconds.
pub const TYPING_TIMEOUT_MS: u64 = 2000;
/// The number of minutes in an hour.
pub const MINUTES_PER_HOUR: i32 = 60;
/// The number of seconds in an hour.
pub const SECONDS_PER_HOUR: i32 = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
/// The number of hours in a day.
pub const HOURS_PER_DAY: i32 = 24;
/// The number of seconds in a day.
pub const SECONDS_PER_DAY: i32 = HOURS_PER_DAY * SECONDS_PER_HOUR;
/// The longest starting clock a timed game can have, in seconds (one week).
pub const MAX_TIME_BASE_SECONDS: i32 = 7 * SECONDS_PER_DAY;
/// The most time a timed game can add each turn, in seconds (one day).
pub const MAX_TIME_PER_TURN_SECONDS: i64 = SECONDS_PER_DAY as i64;
/// The loudest volume setting.
pub const MAX_VOLUME: u8 = 100;
/// The volume setting of a new user.
pub const DEFAULT_VOLUME: u8 = MAX_VOLUME / 2;
/// The starting clock that a new user's timed tables have, in minutes.
pub const DEFAULT_TIME_BASE_MINUTES: f64 = 2.0;
/// The time that a new user's timed tables add each turn, in seconds.
pub const DEFAULT_TIME_PER_TURN_SECONDS: i32 = 20;
/// The rows on a page of a public listing when the request does not name a size.
pub const DEFAULT_PAGE_SIZE: i64 = 10;
/// The most private messages that one history request can ask for.
pub const MAX_PRIVATE_HISTORY_MESSAGES: i64 = 100;
/// A table's progress, as a percentage, once its game reaches the maximum score or its replay
/// reaches the last turn.
pub const MAX_PROGRESS: u8 = 100;
/// The highest card order: stack bases follow the cards of the largest deck, one for each suit.
const MAX_CARD_ORDER: usize = MAX_DECK_SIZE + MAX_SUITS - 1;

/// Every seat index, for schemas that list them.
fn seats() -> Vec<i64> {
    (0..=MAX_SEAT)
        .filter_map(|seat| i64::try_from(seat).ok())
        .collect()
}

/// Every seat index after -1, which means no seat.
fn seats_or_none() -> Vec<i64> {
    std::iter::once(i64::from(NO_VALUE))
        .chain(seats())
        .collect()
}

/// Every normal rank, which are also the ranks that clues can name.
fn ranks() -> Vec<i32> {
    (MIN_RANK..=MAX_RANK).collect()
}

/// Every rank a card can have, after -1, which means an unknown rank.
fn ranks_or_unknown() -> Vec<i32> {
    std::iter::once(NO_VALUE).chain(catalog_ranks()).collect()
}

/// Every rank a catalog can name: the normal ranks and the start card's.
fn catalog_ranks() -> Vec<i32> {
    ranks().into_iter().chain([START_CARD_RANK]).collect()
}

/// Every stack size that a variant can set, all smaller than the default of `MAX_RANK`.
fn explicit_stack_sizes() -> Vec<i32> {
    (1..MAX_RANK).collect()
}

/// Every strike number, from the first to the one that ends the game.
fn strikes() -> Vec<i32> {
    (1..=MAX_STRIKES).collect()
}

/// Whether a game can have this many players.
pub fn is_player_count<T: TryInto<usize>>(count: T) -> bool {
    count
        .try_into()
        .is_ok_and(|count| (MIN_PLAYERS..=MAX_PLAYERS).contains(&count))
}

/// A number of players, as a schema whose type lists each count.
pub struct NumPlayers;

impl JsonSchema for NumPlayers {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> std::borrow::Cow<'static, str> {
        "NumPlayers".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "integer",
            "format": "uint8",
            "minimum": MIN_PLAYERS,
            "maximum": MAX_PLAYERS,
            "enum": (MIN_PLAYERS..=MAX_PLAYERS).collect::<Vec<_>>(),
        })
    }
}

/// A timestamp on the wire: RFC 3339 in UTC, with milliseconds, such as
/// "2026-01-01T12:00:00.000Z". Both the server's and the clients' schemas accept only this form.
pub struct Timestamp;

/// The digits of a wire timestamp's fractional second (milliseconds).
pub const TIMESTAMP_FRACTION_DIGITS: usize = 3;

impl JsonSchema for Timestamp {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> std::borrow::Cow<'static, str> {
        "Timestamp".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "string",
            "pattern": format!(
                r"^\d{{4}}-\d{{2}}-\d{{2}}T\d{{2}}:\d{{2}}:\d{{2}}\.\d{{{TIMESTAMP_FRACTION_DIGITS}}}Z$"
            ),
            "x-date": true,
        })
    }
}

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
    #[schemars(with = "Vec<String>", length(max = MAX_PLAYERS))]
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

fn no_value() -> i64 {
    i64::from(NO_VALUE)
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSpectateRequest {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(default = "no_value")]
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
    #[serde(default = "no_value")]
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub shadowing_player_index: i64,
    /// For a shared replay of a database game, spectate an existing shared replay of that game
    /// instead of creating another one, if there is one.
    #[serde(default)]
    pub join_existing: bool,
    /// For a shared replay, hide what happens later in the game: the turn slider, jumping to the
    /// end, and future strikes.
    #[serde(default)]
    pub spoiler_free: bool,
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

/// A game in the replay format: exported by the server and copied by the client. `ReplayImport`
/// reads it back.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayGame {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub id: i64,
    pub players: Vec<String>,
    pub deck: Vec<ReplayCard>,
    pub actions: Vec<ReplayAction>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ReplayOptions")]
    pub options: Option<ReplayOptions>,
    /// Each player's notes, indexed by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ReplayNoteRow>")]
    pub notes: Option<Vec<Vec<String>>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ReplayCharacter>")]
    pub characters: Option<Vec<ReplayCharacter>>,
    pub seed: String,
}

/// One player's notes, indexed by card order.
#[derive(JsonSchema)]
#[serde(transparent)]
#[expect(dead_code, reason = "Only describes the schema of a note row")]
struct ReplayNoteRow(Vec<String>);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayCard {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub suit_index: i64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub rank: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReplayAction {
    #[serde(rename = "type")]
    pub kind: RecordedActionType,
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub target: i32,
    #[serde(default)]
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub value: i32,
}

/// Only options that differ from their defaults are included.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub timed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_base: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub speedrun: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub deck_plays: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub empty_clues: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_extra_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_less_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub all_or_nothing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub detrimental_characters: Option<bool>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ReplayCharacter {
    /// Empty when the player has no character.
    pub name: String,
    #[schemars(range(min = i32::MIN, max = i32::MAX))]
    pub metadata: i32,
}

/// A game to import, in the format that `ReplayGame` exports. Every field is optional: a seed alone
/// determines the deck, and missing options take their defaults. The server checks the game itself,
/// such as whether the deck matches the seed.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayImport {
    /// The exported game's database ID. Importing does not use it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 0, max = MAX_SAFE_INTEGER))]
    pub id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(max = MAX_PLAYERS))]
    pub players: Option<Vec<String>>,
    /// The deck, by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportCard>", length(max = MAX_DECK_SIZE))]
    pub deck: Option<Vec<ImportCard>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportAction>", length(max = MAX_GAME_ACTIONS))]
    pub actions: Option<Vec<ImportAction>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "ImportOptions")]
    pub options: Option<ImportOptions>,
    /// Each player's notes, indexed by card order.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportNoteRow>", length(max = MAX_PLAYERS))]
    pub notes: Option<Vec<ImportNoteRow>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<ImportCharacter>", length(max = MAX_PLAYERS))]
    pub characters: Option<Vec<ImportCharacter>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub seed: Option<String>,
}

/// One player's imported notes, indexed by card order.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct ImportNoteRow(pub Vec<String>);

/// A card in an imported deck. A missing identity is 0.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportCard {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 0, max = MAX_SAFE_INTEGER))]
    pub suit_index: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub rank: Option<i32>,
}

/// An action in an imported game. Missing fields are 0.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportAction {
    #[serde(default, rename = "type", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "RecordedActionType")]
    pub kind: Option<RecordedActionType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub target: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub value: Option<i32>,
}

/// A player's character in an imported game. A missing name is no character.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ImportCharacter {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i32", range(min = i32::MIN, max = i32::MAX))]
    pub metadata: Option<i32>,
}

/// The options of an imported game. Missing options take their defaults.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub timed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_base: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub speedrun: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub deck_plays: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub empty_clues: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_extra_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub one_less_card: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub all_or_nothing: Option<bool>,
    /// When present, even as false, the game must assign every player a character.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "bool")]
    pub detrimental_characters: Option<bool>,
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

/// What the leader points at.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayIndicator {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(with = "ReplayArrowTarget")]
    pub order: i64,
}

/// What a shared-replay arrow points at: a card, or a part of the board.
#[derive(JsonSchema)]
#[serde(untagged)]
pub enum ReplayArrowTarget {
    Card(CardOrder),
    Board(ReplayArrowOrder),
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplaySound {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub sound: ReplaySoundEffect,
}

/// A sound effect that a shared-replay leader plays for everyone watching.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ReplaySoundEffect {
    Buzz,
    Clap,
    Holy,
    Nooo,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReplayLeader {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub name: String,
}

/// The players in a shared replay who will not play again if the leader restarts.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestartDeclined {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[schemars(length(max = MAX_PLAYERS))]
    pub names: Vec<String>,
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
    /// The hypothetical's actions so far, in order.
    pub actions: Vec<HypotheticalAction>,
}

/// One action in a hypothetical. The server relays these; each client applies them to its own copy
/// of the game. Unknown card identities are -1.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum HypotheticalAction {
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
        ignore_negative: bool,
    },
    Strike {
        #[schemars(range(min = 1, max = MAX_STRIKES), extend("enum" = strikes()))]
        num: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        turn: i64,
        #[schemars(with = "CardOrder")]
        order: i64,
    },
    Turn {
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        num: i64,
        #[schemars(with = "PlayerIndexOrNone")]
        current_player_index: i64,
    },
    /// Shows a card as another identity.
    Morph {
        #[schemars(with = "CardOrder")]
        order: i64,
        #[schemars(with = "SuitIndexOrUnknown")]
        suit_index: i64,
        #[schemars(with = "RankOrUnknown")]
        rank: i64,
    },
    /// Shows a morphed card as its original identity again.
    Unmorph {
        #[schemars(with = "CardOrder")]
        order: i64,
    },
}

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
    #[serde(rename = "type")]
    pub kind: ActionType,
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
        order: i64,
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
    HypoToggleRevealed {
        #[serde(rename = "tableID")]
        table_id: TableId,
    },
    EfficiencyMod {
        #[serde(rename = "tableID")]
        table_id: TableId,
        #[schemars(range(min = i32::MIN, max = i32::MAX))]
        r#mod: i32,
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
            | Self::HypoToggleRevealed { table_id }
            | Self::EfficiencyMod { table_id, .. } => *table_id,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChatSource {
    User,
    Server,
    Discord,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Chat {
    /// Pre-escaped HTML, not an instruction to escape or normalize again.
    #[schemars(length(min = 1))]
    pub msg: String,
    pub source: ChatSource,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub who: Option<String>,
    #[serde(default, rename = "chatID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "i64", range(min = 1, max = MAX_SAFE_INTEGER))]
    pub chat_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub room: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub recipient: Option<String>,
    /// Options that the message's button applies to the table, in a suggestion to its owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "GameOptions")]
    pub suggested_options: Option<GameOptions>,
}

impl Chat {
    pub fn new(msg: impl Into<String>, source: ChatSource, datetime: impl Into<String>) -> Self {
        Self {
            msg: msg.into(),
            source,
            datetime: datetime.into(),
            who: None,
            chat_id: None,
            room: None,
            recipient: None,
            suggested_options: None,
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
    #[schemars(length(min = 1))]
    pub msg: String,
    #[schemars(length(min = 1))]
    pub who: String,
    #[schemars(length(min = 1))]
    pub recipient: String,
    #[schemars(with = "Timestamp")]
    pub datetime: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct ChatHistory {
    #[schemars(extend("x-readonly" = true))]
    pub list: Vec<ChatHistoryMessage>,
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
pub struct UserId(#[schemars(range(min = 0, max = i32::MAX))] pub i32);

/// The `/login` form.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    /// Sets a new password after the current one is verified.
    pub new_password: String,
    pub version: String,
}

/// The body of a successful `/login` response.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LoginResponse {
    #[serde(rename = "userID")]
    pub user_id: UserId,
}

/// The body of a JSON HTTP error response. Server failures also name their typed cause and the
/// diagnostic ID that their log entry carries.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ApiError {
    pub error: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub code: Option<String>,
    #[serde(
        default,
        rename = "diagnosticID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "String")]
    pub diagnostic_id: Option<String>,
}

impl ApiError {
    /// An error without a typed cause, such as a refused request.
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            code: None,
            diagnostic_id: None,
        }
    }
}

/// The `/api/v1/identity` request.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityRequest {
    #[schemars(length(min = 1))]
    pub token: String,
}

/// The account that an identity token belongs to.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityResponse {
    pub username: String,
}

/// A newly issued identity token, from `/api/v1/identity/token`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityTokenResponse {
    pub username: String,
    pub token: String,
    #[schemars(with = "Timestamp")]
    pub expires_at: String,
}

/// The `/password-reset` request: a new password for an administrator to set.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordHashRequest {
    #[schemars(length(min = 1))]
    pub password: String,
}

/// The hash of a `/password-reset` request's password.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordHashResponse {
    pub hash: String,
}

/// A page of games from the public `/api/v1/history`, `/seed`, and `/variants/{id}` lists.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGamePage {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub total_rows: i64,
    /// The accepted parameters.
    pub info: String,
    pub rows: Vec<PublicGameRow>,
}

/// One game in a public game list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGameRow {
    pub id: GameId,
    #[schemars(range(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub num_players: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    /// The variant ID. Variant lists omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(max = u32::MAX))]
    pub variant: Option<u32>,
    /// How many games used this seed. Variant lists omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(max = u32::MAX))]
    pub other_scores: Option<u32>,
    /// The players' names, separated by commas.
    pub users: String,
    /// When the game finished.
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    pub seed: String,
}

/// The variant names in `/api/v1/variants`, keyed by variant ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct VariantNames(pub std::collections::BTreeMap<String, String>);

/// How many games with a seed reached a score, as the seed page's chart shows them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreFrequency {
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub num_times: i64,
}

/// A variant in `/api/v1/variants-full`, keyed by its ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicVariant {
    pub name: String,
    pub suits: Vec<String>,
    #[schemars(range(min = 1, max = MAX_RANK))]
    pub stack_size: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub max_score: u32,
}

/// A user's presence in the lobby's user list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct User {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(length(min = 1))]
    pub name: String,
    pub status: Status,
    #[serde(default, rename = "tableID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "TableId")]
    pub table_id: Option<TableId>,
    pub h_group: bool,
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
    pub file: LobbySound,
}

/// A sound that everyone in the lobby hears. The server plays "shutdown" when it is going down.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum LobbySound {
    Shutdown,
}

/// A user's preferences. Missing fields take their default, so stored settings only need the values
/// a user changed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct Settings {
    pub desktop_notification: bool,
    pub sound_move: SoundMove,
    pub sound_timer: bool,
    pub keldon_mode: bool,
    pub colorblind_mode: bool,
    pub real_life_mode: bool,
    pub reverse_hands: bool,
    pub style_numbers: bool,
    pub show_timer_in_untimed: bool,
    #[schemars(range(min = 0, max = MAX_VOLUME))]
    pub volume: u8,
    pub speedrun_preplay: bool,
    pub speedrun_mode: bool,
    pub h_group_conventions: bool,
    #[schemars(length(min = 1))]
    pub create_table_variant: String,
    pub create_table_timed: bool,
    #[schemars(range(min = 0, max = MAX_TIME_BASE_SECONDS / SECONDS_PER_MINUTE))]
    pub create_table_time_base_minutes: f64,
    #[schemars(range(min = 0, max = MAX_TIME_PER_TURN_SECONDS))]
    pub create_table_time_per_turn_seconds: i32,
    pub create_table_speedrun: bool,
    pub create_table_deck_plays: bool,
    pub create_table_empty_clues: bool,
    pub create_table_one_extra_card: bool,
    pub create_table_one_less_card: bool,
    pub create_table_all_or_nothing: bool,
    pub create_table_detrimental_characters: bool,
    #[schemars(with = "NumPlayers")]
    pub create_table_max_players: u8,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            desktop_notification: false,
            sound_move: SoundMove::All,
            sound_timer: true,
            keldon_mode: false,
            colorblind_mode: false,
            real_life_mode: false,
            reverse_hands: false,
            style_numbers: false,
            show_timer_in_untimed: false,
            volume: DEFAULT_VOLUME,
            speedrun_preplay: false,
            speedrun_mode: false,
            h_group_conventions: false,
            create_table_variant: DEFAULT_VARIANT_NAME.into(),
            create_table_timed: false,
            create_table_time_base_minutes: DEFAULT_TIME_BASE_MINUTES,
            create_table_time_per_turn_seconds: DEFAULT_TIME_PER_TURN_SECONDS,
            create_table_speedrun: false,
            create_table_deck_plays: false,
            create_table_empty_clues: false,
            create_table_one_extra_card: false,
            create_table_one_less_card: false,
            create_table_all_or_nothing: false,
            create_table_detrimental_characters: false,
            create_table_max_players: DEFAULT_MAX_PLAYERS,
        }
    }
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
    #[schemars(with = "i8", range(min = NO_VALUE, max = MAX_SEAT))]
    pub discon_shadowing_seat: Option<i8>,
}

/// A table's game options, as clients request them and as the server reports them. Missing fields
/// take their defaults.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct GameOptions {
    #[schemars(with = "NumPlayers")]
    pub num_players: u8,
    #[schemars(length(min = 1))]
    pub variant_name: String,
    #[serde(rename = "variantID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(min = 0, max = u32::MAX))]
    pub variant_id: Option<u32>,
    pub timed: bool,
    pub time_base: f64,
    #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
    pub time_per_turn: i64,
    pub speedrun: bool,
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
    #[schemars(with = "NumPlayers")]
    pub max_players: Option<u8>,
    /// The deal that a table requests, as the end of its full seed: "123" in a 3-player game of No
    /// Variant deals `p3v0s123`. Absent when the server deals the next seed that none of the
    /// players have played. Only tables report it; games report their full seed elsewhere.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1, max = MAX_SEED_LENGTH))]
    pub seed: Option<String>,
    /// A finished game that a table plays again with its deal, seats, characters, and options,
    /// which replace the others. Only tables report it.
    #[serde(rename = "replayGameID", skip_serializing_if = "Option::is_none")]
    #[schemars(with = "GameId")]
    pub replay_game_id: Option<GameId>,
    /// The turn of `replayGameID` that the game starts from, counting from 1. Absent starts from
    /// the first turn.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(min = 1, max = i32::MAX))]
    pub replay_turn: Option<u32>,
}

/// Must match `hanabi_engine::Options::default()`; a server test checks this.
impl Default for GameOptions {
    fn default() -> Self {
        Self {
            num_players: u8::try_from(MIN_PLAYERS).expect("the player limits fit in a byte"),
            variant_name: DEFAULT_VARIANT_NAME.into(),
            variant_id: None,
            timed: false,
            time_base: 0.0,
            time_per_turn: 0,
            speedrun: false,
            deck_plays: false,
            empty_clues: false,
            one_extra_card: false,
            one_less_card: false,
            all_or_nothing: false,
            detrimental_characters: false,
            table_name: None,
            max_players: None,
            seed: None,
            replay_game_id: None,
            replay_turn: None,
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
    #[schemars(range(min = NO_VALUE, max = MAX_SEAT), extend("enum" = seats_or_none()))]
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
    /// The game that a replay shows, if it is stored in the database.
    #[serde(
        default,
        rename = "databaseID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "GameId")]
    pub database_id: Option<GameId>,
    pub id: TableId,
    /// Whether the recipient is one of the players.
    pub joined: bool,
    #[schemars(with = "NumPlayers")]
    pub max_players: u8,
    #[schemars(length(min = 1))]
    pub name: String,
    /// The current number of players, which can be below the minimum during a pregame.
    #[schemars(range(min = 0, max = MAX_PLAYERS))]
    pub num_players: u8,
    pub options: GameOptions,
    #[serde(rename = "ownerID")]
    pub owner_id: UserId,
    pub password_protected: bool,
    pub players: Vec<String>,
    /// The percentage of the maximum score reached, or of a replay watched.
    #[schemars(range(min = 0, max = MAX_PROGRESS))]
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
pub struct GameId(#[schemars(range(min = 0, max = i32::MAX))] pub i32);

/// A completed game in a player's history.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[schemars(extend("x-readonly" = true))]
pub struct GameHistory {
    pub id: GameId,
    pub options: GameOptions,
    pub seed: String,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub num_turns: i32,
    pub end_condition: EndCondition,
    #[schemars(with = "Timestamp")]
    pub datetime_started: String,
    #[schemars(with = "Timestamp")]
    pub datetime_finished: String,
    #[schemars(range(min = 0, max = i32::MAX))]
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
    #[schemars(range(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub num_players: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    #[schemars(range(min = 0, max = i32::MAX))]
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
    #[schemars(range(min = 0, max = MAX_SEAT))]
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
    #[schemars(range(min = MIN_PLAYERS, max = MAX_PLAYERS))]
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

/// An integer that JavaScript represents exactly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct SafeInteger(#[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))] pub i64);

/// A seat in a game. The game library's `PlayerIndex` type.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct PlayerIndex(
    #[schemars(range(min = 0, max = MAX_SEAT), extend("enum" = seats()))] pub i64,
);

/// A seat, or -1 for no player.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct PlayerIndexOrNone(
    #[schemars(range(min = NO_VALUE, max = MAX_SEAT), extend("enum" = seats_or_none()))] pub i64,
);

/// A card's position in the initial deck, which identifies it. Stack bases follow the cards of the
/// largest deck.
#[derive(JsonSchema)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "CardOrder"))]
pub struct CardOrder(#[schemars(range(min = 0, max = MAX_CARD_ORDER))] pub i64);

/// A card's suit, or -1 when the recipient may not see it.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct SuitIndexOrUnknown(
    #[schemars(range(min = NO_VALUE, max = MAX_SEAT), extend("enum" = seats_or_none()))] pub i64,
);

/// A card's rank, or -1 when the recipient may not see it. 7 is the rank of a stack's start card.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct RankOrUnknown(
    #[schemars(range(min = NO_VALUE, max = START_CARD_RANK), extend("enum" = ranks_or_unknown()))]
    pub i64,
);

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
    Strike {
        #[schemars(range(min = 1, max = MAX_STRIKES), extend("enum" = strikes()))]
        num: i64,
        #[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))]
        turn: i64,
        #[schemars(with = "CardOrder")]
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

// The game catalog: the checked-in files in `packages/game/src/json`, which the client bundles and
// the server embeds. Each side derives its own variant model from these records.

/// Catalog flags are either set to true or omitted; an explicit false is rejected.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde passes skipped fields by reference"
)]
fn is_false(value: &bool) -> bool {
    !*value
}

/// A rank that clues can name.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct RankClueNumber(#[schemars(extend("enum" = ranks()))] pub u8);

/// A card rank. 7 is the rank of a stack's start card.
#[derive(JsonSchema)]
#[serde(transparent)]
pub struct CatalogRank(#[schemars(extend("enum" = catalog_ranks()))] pub u8);

/// An entry in `colors.json`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogColor {
    #[schemars(length(min = 1))]
    pub name: String,
    /// If not specified, assume that it is the first letter of the color.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1, max = 1))]
    pub abbreviation: Option<String>,
    #[schemars(length(min = 1))]
    pub fill: String,
    /// An alternate fill when "Colorblind Mode" is enabled. If not specified, assume that it is the
    /// same as the default fill.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub fill_colorblind: Option<String>,
}

/// An entry in `suits.json`. This is similar to `Suit`, but it only has primitive types.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogSuit {
    // --------------------
    // Mandatory properties
    // --------------------
    #[schemars(length(min = 1))]
    pub name: String,
    /// The suit ID is a two character string:
    /// - Normal suits have a single capital letter. (e.g. "R" for "Red")
    /// - Special suits have a two character ID with a lowercase letter. (e.g. "Bk" for "Black")
    /// - Combination suits have a four character ID. (e.g. `BrRa` for "Muddy Rainbow")
    /// - Dark suits have a capital D prefix. (e.g. `DRa` for "Dark Rainbow")
    /// - Ambiguous suits have a capital A prefix and a number suffix. (e.g. AR1 for "Tomato")
    /// - Very Ambiguous suits have a capital V prefix and a number suffix. (e.g. "VR1" for "Tomato
    ///   VA")
    /// - Extremely Ambiguous suits have a capital E prefix and a number suffix. (e.g. "EB1" for "Ice
    ///   EA")
    /// - Dual-Color suits have a capital D prefix. (e.g. "DRY" for "Tangerine D")
    #[schemars(length(min = 1))]
    pub id: String,
    /// The symbol that represents this suit: a pip name, "auto", or "none".
    #[schemars(length(min = 1))]
    pub pip: String,
    // -------------------
    // Optional properties
    // -------------------
    /// The one letter abbreviation to use when representing this suit as a card note. If not
    /// specified, use the abbreviation of the color with the same name, or else the first letter of
    /// the suit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1, max = 1))]
    pub abbreviation: Option<String>,
    /// Whether or not to create variant combinations based on this suit.
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub create_variants: bool,
    /// A simplified version of the suit name to show to end-users. If not specified, use the normal
    /// suit name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub display_name: Option<String>,
    /// The background color of cards of the suit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String", length(min = 1))]
    pub fill: Option<String>,
    /// Allows for a gradient of different colors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", length(min = 1), extend("x-readonly" = true))]
    pub fill_colors: Option<Vec<String>>,
    // -----------------------------------------
    // Optional gameplay modification properties
    // -----------------------------------------
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub one_of_each: bool,
    /// The colors that touch this suit. When omitted, the color with the suit's name does.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", extend("x-readonly" = true))]
    pub clue_colors: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub all_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub no_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub all_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub no_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub prism: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub inverted: bool,
}

/// An entry in `variants.json`. This is similar to `Variant`, but it only has primitive types.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogVariant {
    /// A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1, and so
    /// on. This is a legacy field; we want to transition to using a more descriptive string ID,
    /// which will allow for custom user-defined variants.
    #[schemars(range(min = 0, max = u32::MAX))]
    pub id: u32,
    /// A string that describes the variant. For example, "No Variant" is `R+Y+G+B+P`.
    #[serde(rename = "newID")]
    #[schemars(length(min = 1))]
    pub new_id: String,
    #[schemars(length(min = 1))]
    pub name: String,
    /// Suit names, which may end in " Reversed".
    #[schemars(length(min = 1), extend("x-readonly" = true))]
    pub suits: Vec<String>,
    /// The colors that players can clue. When omitted, the suits' clue colors.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<String>", extend("x-readonly" = true))]
    pub clue_colors: Option<Vec<String>>,
    /// The ranks that players can clue. When omitted, 1 through 5.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "Vec<RankClueNumber>", extend("x-readonly" = true))]
    pub clue_ranks: Option<Vec<u8>>,
    /// The number of cards in each stack. When omitted, 5.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u8", extend("enum" = explicit_stack_sizes()))]
    pub stack_size: Option<u8>,
    // The following properties are listed in order of how they appear in "variants.md".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "CatalogRank")]
    pub special_rank: Option<u8>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_all_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_all_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_no_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_no_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_deceptive: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "CatalogRank")]
    pub critical_rank: Option<u8>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub scarce_ones: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub clue_starved: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub color_clues_touch_nothing: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub rank_clues_touch_nothing: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub alternating_clues: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub cow_and_pig: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub duck: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub odds_and_evens: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub synesthesia: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub up_or_down: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub throw_it_in_a_hole: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub funnels: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub chimneys: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub sudoku: bool,
}

/// An entry in `characters.json`: a detrimental character.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogCharacter {
    #[schemars(length(min = 1))]
    pub name: String,
    /// The first character has an ID of 0.
    #[schemars(range(min = 0, max = u32::MAX))]
    pub id: u32,
    #[schemars(length(min = 1))]
    pub description: String,
    #[schemars(length(min = 1))]
    pub emoji: String,
    /// Whether the character's random color or rank is stored with the game.
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub write_metadata_to_database: bool,
    /// Excluded from two-player games.
    #[serde(default, rename = "not2P", skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub not_two_player: bool,
}

pub fn schemas() -> std::collections::BTreeMap<String, serde_json::Value> {
    let mut schemas = std::collections::BTreeMap::new();
    macro_rules! register {
        ($($ty:ty),+ $(,)?) => {$(
            schemas.insert(stringify!($ty).into(), serde_json::to_value(schemars::schema_for!($ty)).unwrap());
        )+};
    }
    register!(
        ReplayGame,
        ReplayImport,
        LoginRequest,
        LoginResponse,
        ApiError,
        IdentityRequest,
        IdentityResponse,
        IdentityTokenResponse,
        PasswordHashRequest,
        PasswordHashResponse,
        PublicGamePage,
        PublicGameRow,
        PublicVariant,
        VariantNames,
        ScoreFrequency,
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
        TableRestartDeclineRequest,
        TableSuggestRequest,
        TableSpectateRequest,
        SettingRequest,
        InactiveRequest,
        HistoryRequest,
        HistorySeedRequest,
        TagSearchRequest,
        TableCreateRequest,
        TableUpdateRequest,
        ReplayCreateRequest,
        Clock,
        Connected,
        IdleWarning,
        Pause,
        VoteChange,
        CardIdentity,
        CardIdentities,
        FinishOngoingGame,
        ReplaySegment,
        ReplayIndicator,
        ReplaySound,
        ReplayLeader,
        RestartDeclined,
        Suggestion,
        Hypothetical,
        HypotheticalAction,
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
        CatalogColor,
        CatalogSuit,
        CatalogVariant,
        CatalogCharacter,
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
                ClientMessage::decode(command, &case["input"])
                    .map(|message| message.map(|message| message.data()))
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
