//! The enums of the wire.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Defines an enum whose members the wire carries as names, with `name` and `from_name` to convert
/// between them. Use it for an enum whose names the server also needs as text, such as in a URL or
/// in the database.
macro_rules! named_enum {
    (
        $(#[$meta:meta])*
        pub enum $name:ident {
            $($(#[$member_meta:meta])* $member:ident => $wire:literal,)+
        }
    ) => {
        $(#[$meta])*
        #[derive(
            Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize,
            schemars::JsonSchema,
        )]
        pub enum $name {
            $($(#[$member_meta])* #[serde(rename = $wire)] $member,)+
        }

        impl $name {
            /// Every member, in the order of the definition.
            pub const ALL: &'static [Self] = &[$(Self::$member),+];

            /// The member's name on the wire.
            pub const fn name(self) -> &'static str {
                match self {
                    $(Self::$member => $wire,)+
                }
            }

            /// The member with this name on the wire.
            pub fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($wire => Some(Self::$member),)+
                    _ => None,
                }
            }
        }
    };
}
pub(crate) use named_enum;

/// The kind of a clue.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum ClueType {
    Color,
    Rank,
}

/// How a game ended.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum EndCondition {
    Normal,
    Strikeout,
    Timeout,
    TerminatedByPlayer,
    SpeedrunFail,
    IdleTimeout,
    CharacterSoftlock,
    AllOrNothingFail,
    AllOrNothingSoftlock,
    TerminatedByVote,
}

named_enum! {
    /// A column of the public game lists, which clients sort by `sort` and filter by
    /// `filter[name]`.
    pub enum GameListColumn {
        Id => "id",
        NumPlayers => "numPlayers",
        Score => "score",
        Variant => "variant",
    }
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
        ArchiveMissingSeed => "archiveMissingSeed",
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
