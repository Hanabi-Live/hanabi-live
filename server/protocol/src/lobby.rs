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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Empty {}

/// Sent before a graceful restart or stop closes the connection.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ServerRestart {
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
    Ready { num_games: Count },
}

/// A user's presence in the lobby's user list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct User {
    pub user_id: UserId,
    pub username: Username,
    pub activity: Activity,
    pub h_group_conventions: bool,
    /// The highest H-Group level that this user wants to play at. Absent when they did not choose
    /// one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub h_group_level: Option<HGroupLevel>,
    pub bot: bool,
    pub inactive: bool,
}

/// What a user is doing, and at which table. A solo replay is private, so it does not name its
/// table.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Activity {
    Lobby {},
    Pregame { table_id: TableId },
    Playing { table_id: TableId },
    Spectating { table_id: TableId },
    Replay {},
    SharedReplay { table_id: TableId },
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserList {
    pub users: Vec<User>,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserRemoved {
    pub user_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Friends {
    pub friends: Vec<Username>,
}

/// The users whom we have blocked. It does not include the users who have blocked us.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Blocked {
    pub blocked: Vec<Username>,
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
    pub code: Option<NoticeCode>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
pub struct LobbySoundMessage {
    pub sound: LobbySound,
}

/// A sound played outside of a game. The server plays "shutdown" to everyone when it is going down,
/// and "someoneJoined" to the players at a pre-game table when another player joins it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum LobbySound {
    Shutdown,
    SomeoneJoined,
}

/// Defines `Settings`, with each setting's default, and `SettingsChange`, which changes some of
/// them. An optional setting has no default: a user can leave it unset.
macro_rules! settings {
    (
        required {
            $($(#[$attr:meta])* $field:ident: $ty:ty = $default:expr,)+
        }
        optional {
            $($(#[$optional_attr:meta])* $optional:ident: $optional_ty:ty,)+
        }
    ) => {
        /// A user's preferences. Missing fields take their default, so stored settings only need
        /// the values a user changed.
        #[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(default, rename_all = "camelCase", deny_unknown_fields)]
        pub struct Settings {
            $($(#[$attr])* pub $field: $ty,)+
            $(
                $(#[$optional_attr])*
                #[serde(skip_serializing_if = "Option::is_none")]
                pub $optional: Option<$optional_ty>,
            )+
        }

        impl Default for Settings {
            fn default() -> Self {
                Self {
                    $($field: $default,)+
                    $($optional: None,)+
                }
            }
        }

        /// New values for some of a user's settings. An absent setting stays as it is.
        #[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        pub struct SettingsChange {
            $(
                $(#[$attr])*
                #[serde(skip_serializing_if = "Option::is_none")]
                pub $field: Option<$ty>,
            )+
            $(
                $(#[$optional_attr])*
                #[serde(skip_serializing_if = "Option::is_none")]
                pub $optional: Option<$optional_ty>,
            )+
        }
    };
}

settings! {
    required {
        desktop_notification: bool = false,
        sound_move: SoundMove = SoundMove::All,
        sound_timer: bool = true,
        dark_mode: bool = false,
        keldon_mode: bool = false,
        /// Shows games in the redesigned game screen, which is in testing. Players opt in.
        new_ui: bool = false,
        colorblind_mode: bool = false,
        real_life_mode: bool = false,
        reverse_hands: bool = false,
        style_numbers: bool = false,
        show_timer_in_untimed: bool = false,
        #[schemars(range(min = 0, max = MAX_VOLUME))]
        volume: u8 = DEFAULT_VOLUME,
        speedrun_preplay: bool = false,
        speedrun_mode: bool = false,
        h_group_conventions: bool = false,
        create_table: CreateTableSettings = CreateTableSettings::default(),
    }
    optional {
        /// The highest H-Group level that this user wants to play at. Absent when they did not
        /// choose one; `SettingsRequest::cleared` removes it.
        h_group_level: HGroupLevel,
    }
}

/// The table that the "Create Game" form starts from: the one that the user last chose. Missing
/// fields take their defaults.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateTableSettings {
    pub max_players: NumPlayers,
    /// The options of the next table. Their `timeControl` is present when the table is timed.
    pub options: GameOptions,
    /// The clock that the form offers. The form keeps it while the table is untimed.
    pub time_control: TimeControl,
}

impl Default for CreateTableSettings {
    fn default() -> Self {
        Self {
            max_players: NumPlayers::default(),
            options: GameOptions::default(),
            time_control: TimeControl {
                base_seconds: DEFAULT_TIME_BASE_SECONDS,
                per_turn_seconds: DEFAULT_TIME_PER_TURN_SECONDS,
            },
        }
    }
}

/// The first message after connecting.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Welcome {
    pub user_id: UserId,
    pub username: Username,
    pub muted: bool,
    pub first_time_user: bool,
    pub settings: Settings,
    pub friends: Vec<Username>,
    /// The users whom we have blocked, as in [`Blocked`].
    pub blocked: Vec<Username>,
    /// Ongoing games the user is a player in.
    pub playing_at_tables: Vec<TableId>,
    /// The tables that the user spectated and did not leave, newest table first. A user who closes
    /// the page while spectating stays at that table, so this can list more than one.
    pub spectating_at_tables: Vec<SpectatedTable>,
}

/// A table that a user spectates, and the seat they shadow there, if any.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpectatedTable {
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
    /// The clock of a timed game. Absent when the game is untimed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_control: Option<TimeControl>,
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
            time_control: None,
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

/// The clock of a timed game. New tables need at least 1 second for each value, but some old games
/// have 0.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeControl {
    /// The starting clock of each player.
    #[schemars(range(min = 0, max = MAX_TIME_BASE_SECONDS))]
    pub base_seconds: i64,
    /// The time added to a player's clock after each of their turns.
    #[schemars(range(min = 0, max = MAX_TIME_PER_TURN_SECONDS))]
    pub per_turn_seconds: i64,
}

/// A table's name, player limit, options, and deal, as its owner sets them and as tables report
/// them.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableSettings {
    pub name: String,
    pub max_players: NumPlayers,
    pub options: GameOptions,
    /// The deal that the table requests. Absent when the server deals the next seed that none of
    /// the players have played.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deal: Option<Deal>,
}

/// The deal that a table requests: a seed that it chooses, or the deal of a finished game.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Deal {
    Seed {
        /// The end of the full seed: "123" in a 3-player game of No Variant deals `p3v0s123`.
        #[schemars(length(min = 1))]
        suffix: String,
    },
    /// A finished game that the table plays again with its deal, seats, characters, and options,
    /// which replace the others.
    Replay {
        game_id: GameId,
        /// The turn that the game starts from. Absent starts from the first turn.
        #[serde(skip_serializing_if = "Option::is_none")]
        turn: Option<Turn>,
    },
}

impl TableSettings {
    /// A table with this name and the default settings.
    pub fn named(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            max_players: NumPlayers::default(),
            options: GameOptions::default(),
            deal: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spectator {
    pub user_id: UserId,
    pub username: Username,
    /// The seat being shadowed, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shadowing_player_index: Option<PlayerIndex>,
}

/// A table's owner, who also leads its shared replay. The owner sends it to hand the table to
/// someone else, and the server sends it to everyone at the table when the owner changes.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableOwner {
    pub table_id: TableId,
    pub owner_id: UserId,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Spectators {
    pub table_id: TableId,
    pub spectators: Vec<Spectator>,
}

/// A table in the lobby's table list.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Table {
    /// The game that a replay shows, if it is stored in the database.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub game_id: Option<GameId>,
    pub table_id: TableId,
    pub settings: TableSettings,
    pub owner_id: UserId,
    pub password_protected: bool,
    #[schemars(length(max = MAX_PLAYERS))]
    pub player_names: Vec<Username>,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableList {
    pub tables: Vec<Table>,
}

/// A completed game in a player's history.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameHistoryEntry {
    pub game_id: GameId,
    pub options: GameOptions,
    pub seed: String,
    pub score: Score,
    #[schemars(range(min = 0, max = MAX_GAME_ACTIONS))]
    pub num_turns: u16,
    pub end_condition: EndCondition,
    pub started_at: Timestamp,
    pub finished_at: Timestamp,
    /// How many games used this seed.
    pub num_games_on_seed: Count,
    /// In alphabetical order, ignoring case.
    #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_names: Vec<Username>,
    /// The game's tags, in alphabetical order.
    pub tags: Vec<String>,
}

/// A page of a list of games: a player's own history, the games on a seed, or a public list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GamePage {
    pub games: Vec<GameHistoryEntry>,
    /// The position of the page's first game in the list.
    pub offset: Count,
    /// How many games the list has on all of its pages.
    pub total: Count,
}

/// A page of the games played on a seed, best scores first.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SeedGames {
    /// The seed of the request, so that a client can ignore a reply for a seed it no longer shows.
    #[schemars(length(min = 1))]
    pub seed: String,
    #[serde(flatten)]
    pub page: GamePage,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameBestScore {
    pub num_players: NumPlayers,
    /// Absent when there is no game at this player count.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub best: Option<BestScore>,
}

/// A best score, and whether it counts as a normal one.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BestScore {
    pub score: Score,
    /// Whether the game used an option that keeps its score from counting as a normal one, such as
    /// "One Extra Card".
    pub modified: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameVariantStats {
    pub num_games: Count,
    /// The best score for each player count.
    pub best_scores: Vec<PregameBestScore>,
}

/// A pregame player's statistics: all of their games, and their games on the table's variant.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregameStats {
    pub num_games: Count,
    pub variant: PregameVariantStats,
}

#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PregamePlayer {
    pub username: Username,
    /// Whether this player is connected and at the table.
    pub present: bool,
    pub stats: PregameStats,
}

/// A pregame's state, sent to the people at the table.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Pregame {
    pub table_id: TableId,
    pub settings: TableSettings,
    pub owner_id: UserId,
    #[schemars(length(max = MAX_PLAYERS))]
    pub players: Vec<PregamePlayer>,
    pub password_protected: bool,
}

/// Which moves play a sound: every move, only the moves that start the player's turn, or none.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum SoundMove {
    All,
    OnlyOwn,
    None,
}

named_enum! {
    /// The typed cause of a failure that a notice reports. The clients' schema cannot describe each
    /// code, so their descriptions are comments.
    pub enum NoticeCode {
        ArchiveInconsistentPlayers => "archiveInconsistentPlayers",
        ArchiveInvalidAction => "archiveInvalidAction",
        ArchiveInvalidSeed => "archiveInvalidSeed",
        ArchiveInvalidCharacter => "archiveInvalidCharacter",
        ArchiveUnknownVariant => "archiveUnknownVariant",
        // A command that failed for a reason the server did not anticipate. Its report keeps the
        // server's own description, so the player can pass it on with the reference.
        CommandFailed => "commandFailed",
        ConnectionLimit => "connectionLimit",
        DatabaseConnectionFailed => "databaseConnectionFailed",
        DatabaseConstraintFailed => "databaseConstraintFailed",
        DatabaseDuplicate => "databaseDuplicate",
        DatabaseError => "databaseError",
        DatabaseLockTimeout => "databaseLockTimeout",
        DatabasePoolTimeout => "databasePoolTimeout",
        DatabaseQueryCancelled => "databaseQueryCancelled",
        DatabaseQueryTimeout => "databaseQueryTimeout",
        DatabaseReferenceConflict => "databaseReferenceConflict",
        DatabaseResultInvalid => "databaseResultInvalid",
        DatabaseTransactionConflict => "databaseTransactionConflict",
        DatabaseUnavailable => "databaseUnavailable",
        DiscordAnnouncementTimeout => "discordAnnouncementTimeout",
        DiscordChannelInvalid => "discordChannelInvalid",
        DiscordConfiguration => "discordConfiguration",
        DiscordRoleMissing => "discordRoleMissing",
        // A failure that the report does not recognize.
        InternalOperationFailed => "internalOperationFailed",
        LiveStateUnavailable => "liveStateUnavailable",
        LobbyLoadTimeout => "lobbyLoadTimeout",
        LobbyQueueFull => "lobbyQueueFull",
        // A login for a username that has no account, when the client did not ask to create one. The
        // client asks the player to confirm before it creates the account.
        NoAccount => "noAccount",
        OperationTimeout => "operationTimeout",
        // A login or connection from a client of a different release. The client reloads the page.
        OutdatedClient => "outdatedClient",
        PasswordProcessingBusy => "passwordProcessingBusy",
        PasswordProcessingFailed => "passwordProcessingFailed",
        // A password check that waits for earlier ones from the same address.
        PasswordRateLimited => "passwordRateLimited",
        PersistenceUncertain => "persistenceUncertain",
        RecordNotFound => "recordNotFound",
        ServerDataInvalid => "serverDataInvalid",
        // A command or request that arrives while the server starts or drains.
        ServerDraining => "serverDraining",
        ServerIoError => "serverIoError",
        ServerUnavailable => "serverUnavailable",
        SessionGenerationExhausted => "sessionGenerationExhausted",
        // The same account connected somewhere else.
        SessionReplaced => "sessionReplaced",
        TableFailed => "tableFailed",
        TableUnreadable => "tableUnreadable",
        UpstreamConnectionFailed => "upstreamConnectionFailed",
        UpstreamHttpError => "upstreamHttpError",
        UpstreamRequestInvalid => "upstreamRequestInvalid",
        UpstreamResponseInvalid => "upstreamResponseInvalid",
        UpstreamTimeout => "upstreamTimeout",
        UpstreamUnauthorized => "upstreamUnauthorized",
        WorkerFailed => "workerFailed",
    }
}

impl std::fmt::Display for NoticeCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}
