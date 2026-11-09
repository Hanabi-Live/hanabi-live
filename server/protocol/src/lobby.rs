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
    /// The highest H-Group level that this user wants to play at, or 0 if they did not choose one.
    #[schemars(range(min = 0, max = MAX_H_GROUP_LEVEL))]
    pub h_group_level: u8,
    pub bot: bool,
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

/// A sound played outside of a game. The server plays "shutdown" to everyone when it is going down,
/// and "someone-joined" to the players at a pre-game table when another player joins it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "kebab-case")]
pub enum LobbySound {
    Shutdown,
    SomeoneJoined,
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
    pub dark_mode: bool,
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
    /// The highest H-Group level that this user wants to play at, or 0 if they did not choose one.
    #[schemars(range(min = 0, max = MAX_H_GROUP_LEVEL))]
    pub h_group_level: u8,
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
            dark_mode: false,
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
            h_group_level: 0,
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
