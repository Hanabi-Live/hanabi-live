//! The lobby: connection status, users, settings, tables, game history, and pregame tables.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Empty {}

/// Sent before a graceful restart or stop closes the connection.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Restart {
    /// HTML explaining the downtime, present only when an administrator gave a reason.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub message: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum LobbyStatus {
    Loading {},
    Error(Notice),
    Ready {
        #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
        total_games: i64,
    },
}

/// A user's presence in the lobby's user list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct User {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(with = "Username")]
    pub username: String,
    pub status: Status,
    #[serde(rename = "tableID", skip_serializing_if = "Option::is_none")]
    pub table_id: Option<TableId>,
    pub h_group_conventions: bool,
    /// The highest H-Group level that this user wants to play at. Absent when they did not choose
    /// one.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 1, max = MAX_H_GROUP_LEVEL))]
    pub h_group_level: Option<u8>,
    pub bot: bool,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct UserList(pub Vec<User>);

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserLeft {
    #[serde(rename = "userID")]
    pub user_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserInactive {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    pub inactive: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Friends {
    #[schemars(with = "Vec<Username>")]
    pub friends: Vec<String>,
}

/// The users whom we have blocked. It does not include the users who have blocked us.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Blocked {
    #[schemars(with = "Vec<Username>")]
    pub blocked: Vec<String>,
}

/// A problem that the client shows: an `error` message, after which the connection closes, a
/// recoverable `warning`, a lobby statistics failure, or the body of a JSON HTTP error response. The
/// text may contain HTML. A server failure also names its typed cause and the diagnostic ID that its
/// log entry carries.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notice {
    #[schemars(length(min = 1))]
    pub message: String,
    /// The typed cause of a server failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub code: Option<String>,
    #[serde(rename = "diagnosticID", skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub diagnostic_id: Option<String>,
}

impl Notice {
    /// A notice without a typed cause, such as a refused command.
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: None,
            diagnostic_id: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SoundLobby {
    pub file: LobbySound,
}

/// A sound played outside of a game. The server plays "shutdown" to everyone when it is going down,
/// and "someoneJoined" to the players at a pre-game table when another player joins it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LobbySound {
    Shutdown,
    SomeoneJoined,
}

/// A user's preferences. Missing fields take their default, so stored settings only need the values
/// a user changed.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub desktop_notification: bool,
    pub sound_move: SoundMove,
    pub sound_timer: bool,
    pub dark_mode: bool,
    pub keldon_mode: bool,
    /// Shows games in the redesigned game screen, which is in testing. Players opt in.
    pub new_ui: bool,
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
    /// The highest H-Group level that this user wants to play at. Absent when they did not choose
    /// one; `SettingRequest::cleared` removes it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 1, max = MAX_H_GROUP_LEVEL))]
    pub h_group_level: Option<u8>,
    #[schemars(length(min = 1))]
    pub create_table_variant: String,
    pub create_table_timed: bool,
    #[schemars(range(min = 0, max = MAX_TIME_BASE_SECONDS / i64::from(SECONDS_PER_MINUTE)))]
    pub create_table_time_base_minutes: f64,
    #[schemars(range(min = 0, max = MAX_TIME_PER_TURN_SECONDS))]
    pub create_table_time_per_turn_seconds: i64,
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
            dark_mode: false,
            keldon_mode: false,
            new_ui: false,
            colorblind_mode: false,
            real_life_mode: false,
            reverse_hands: false,
            style_numbers: false,
            show_timer_in_untimed: false,
            volume: DEFAULT_VOLUME,
            speedrun_preplay: false,
            speedrun_mode: false,
            h_group_conventions: false,
            h_group_level: None,
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
pub struct Welcome {
    #[serde(rename = "userID")]
    pub user_id: UserId,
    #[schemars(with = "Username")]
    pub username: String,
    pub muted: bool,
    pub first_time_user: bool,
    pub settings: Settings,
    #[schemars(with = "Vec<Username>")]
    pub friends: Vec<String>,
    /// The users whom we have blocked, as in [`Blocked`].
    #[schemars(with = "Vec<Username>")]
    pub blocked: Vec<String>,
    /// Ongoing games the user is a player in.
    pub playing_at_tables: Vec<TableId>,
    /// The table the user was spectating when they disconnected, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub spectating_at_table: Option<SpectatedTable>,
}

/// A table that a user spectates, and the seat they shadow there, if any.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpectatedTable {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadowing_player_index: Option<PlayerIndex>,
}

/// A game's options. Missing fields take their defaults. The player count is not an option: a game
/// has one player name for each seat, and a table counts the players who join it.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct GameOptions {
    #[schemars(length(min = 1))]
    pub variant_name: String,
    pub timed: bool,
    #[schemars(range(min = 0, max = MAX_TIME_BASE_SECONDS))]
    pub time_base_seconds: i64,
    #[schemars(range(min = 0, max = MAX_TIME_PER_TURN_SECONDS))]
    pub time_per_turn_seconds: i64,
    pub speedrun: bool,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
    pub detrimental_characters: bool,
}

/// Must match `hanabi_engine::Options::default()`; a server test checks this.
impl Default for GameOptions {
    fn default() -> Self {
        Self {
            variant_name: DEFAULT_VARIANT_NAME.into(),
            timed: false,
            time_base_seconds: 0,
            time_per_turn_seconds: 0,
            speedrun: false,
            deck_plays: false,
            empty_clues: false,
            one_extra_card: false,
            one_less_card: false,
            all_or_nothing: false,
            detrimental_characters: false,
        }
    }
}

const fn default_max_players() -> u8 {
    DEFAULT_MAX_PLAYERS
}

/// A table's name, player limit, options, and deal, as its owner sets them and as tables report
/// them. Missing fields take their defaults.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSettings {
    /// Blank in a request uses the owner's name.
    #[serde(default)]
    pub name: String,
    #[serde(default = "default_max_players")]
    #[schemars(with = "NumPlayers")]
    pub max_players: u8,
    #[serde(default)]
    pub options: GameOptions,
    /// The deal that the table requests, as the end of its full seed: "123" in a 3-player game of
    /// No Variant deals `p3v0s123`. Absent when the server deals the next seed that none of the
    /// players have played.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1, max = MAX_SEED_LENGTH))]
    pub seed: Option<String>,
    /// A finished game that the table plays again with its deal, seats, characters, and options,
    /// which replace the others.
    #[serde(rename = "replayGameID", skip_serializing_if = "Option::is_none")]
    pub replay_game_id: Option<GameId>,
    /// The turn of `replayGameID` that the game starts from, counting from 1. Absent starts from
    /// the first turn.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 1, max = i32::MAX))]
    pub replay_turn: Option<u32>,
}

impl Default for TableSettings {
    fn default() -> Self {
        Self {
            name: String::new(),
            max_players: DEFAULT_MAX_PLAYERS,
            options: GameOptions::default(),
            seed: None,
            replay_game_id: None,
            replay_turn: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spectator {
    #[schemars(with = "Username")]
    pub username: String,
    /// The seat being shadowed, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadowing_player_index: Option<PlayerIndex>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spectators {
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    pub spectators: Vec<Spectator>,
}

/// A table in the lobby's table list.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Table {
    /// The game that a replay shows, if it is stored in the database.
    #[serde(rename = "gameID", skip_serializing_if = "Option::is_none")]
    pub game_id: Option<GameId>,
    #[serde(rename = "tableID")]
    pub table_id: TableId,
    /// Whether the recipient is one of the players.
    pub joined: bool,
    pub settings: TableSettings,
    #[serde(rename = "ownerID")]
    pub owner_id: UserId,
    pub password_protected: bool,
    #[schemars(with = "Vec<Username>")]
    pub player_names: Vec<String>,
    /// The percentage of the maximum score reached, or of a replay watched.
    #[schemars(range(min = 0, max = MAX_PROGRESS))]
    pub progress: u8,
    pub phase: TablePhase,
    pub spectators: Vec<Spectator>,
}

/// What a table is doing: waiting for its game to start, playing it, or showing a finished game to
/// its owner (replay) or to everyone (shared replay).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum TablePhase {
    Pregame,
    Playing,
    Replay,
    SharedReplay,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct TableList(pub Vec<Table>);

/// A completed game in a player's history.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameHistoryEntry {
    #[serde(rename = "gameID")]
    pub game_id: GameId,
    pub options: GameOptions,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub num_turns: i32,
    pub end_condition: EndCondition,
    #[schemars(with = "Timestamp")]
    pub datetime_started: String,
    #[schemars(with = "Timestamp")]
    pub datetime_finished: String,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub num_games_on_seed: i64,
    #[schemars(with = "Vec<Username>")]
    pub player_names: Vec<String>,
    /// The game's tags, in alphabetical order.
    pub tags: Vec<String>,
}

/// A page of the player's own game history, newest first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct GameHistory(pub Vec<GameHistoryEntry>);

/// A page of the games played on a seed.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameHistoryOtherScores {
    pub games: Vec<GameHistoryEntry>,
    /// The position of the page's first game among all the games on the seed.
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub offset: i64,
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub num_games_on_seed: i64,
    #[schemars(length(min = 1))]
    pub variant_name: String,
    #[schemars(length(min = 1))]
    pub seed: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameBestScore {
    #[schemars(with = "NumPlayers")]
    pub num_players: u8,
    /// Absent when there is no game at this player count.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: Option<i32>,
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
    pub index: PlayerIndex,
    #[schemars(with = "Username")]
    pub username: String,
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
    pub settings: TableSettings,
    #[serde(rename = "ownerID")]
    pub owner_id: UserId,
    pub players: Vec<PregamePlayer>,
    pub password_protected: bool,
}
