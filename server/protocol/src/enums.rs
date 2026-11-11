//! The enums of the wire. `wire_enum!` defines the ones that the database stores as integers: their
//! schemas and the TypeScript enums that clients use are both generated from the definition, and the
//! wire carries each member's name.

use schemars::{JsonSchema, Schema, SchemaGenerator, json_schema};
use serde::{Deserialize, Serialize};
use std::borrow::Cow;

/// A wire enum as the TypeScript generator sees it.
pub struct WireEnum {
    pub name: &'static str,
    pub description: &'static str,
    pub members: &'static [WireEnumMember],
}

pub struct WireEnumMember {
    pub name: &'static str,
    /// The member's name on the wire.
    pub value: &'static str,
    pub description: &'static str,
}

/// Defines an enum that the database stores as an integer, with a schema that names it so that
/// clients use the generated TypeScript enum. The wire carries the name after each member's `=>`.
macro_rules! wire_enum {
    (
        $(#[doc = $doc:literal])*
        pub enum $name:ident {
            $($(#[doc = $member_doc:literal])* $member:ident = $value:literal => $wire:literal,)+
        }
    ) => {
        $(#[doc = $doc])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
        #[repr(i32)]
        pub enum $name {
            $($(#[doc = $member_doc])* $member = $value,)+
        }

        impl $name {
            pub const WIRE: WireEnum = WireEnum {
                name: stringify!($name),
                description: concat!($($doc, "\n"),*),
                members: &[$(WireEnumMember {
                    name: stringify!($member),
                    value: $wire,
                    description: concat!($($member_doc, "\n"),*),
                }),+],
            };

            /// The member's name on the wire.
            pub const fn wire_name(self) -> &'static str {
                match self {
                    $(Self::$member => $wire,)+
                }
            }
        }

        impl TryFrom<i32> for $name {
            type Error = String;

            fn try_from(value: i32) -> Result<Self, Self::Error> {
                match value {
                    $($value => Ok(Self::$member),)+
                    _ => Err(format!(concat!("Invalid ", stringify!($name), ": {}"), value)),
                }
            }
        }

        impl From<$name> for i32 {
            fn from(value: $name) -> Self {
                value as Self
            }
        }

        impl Serialize for $name {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(self.wire_name())
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                struct Visitor;

                impl serde::de::Visitor<'_> for Visitor {
                    type Value = $name;

                    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                        formatter.write_str(concat!("a ", stringify!($name), " name"))
                    }

                    fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<$name, E> {
                        match value {
                            $($wire => Ok($name::$member),)+
                            _ => Err(E::custom(format!(
                                concat!("Invalid ", stringify!($name), ": {}"),
                                value
                            ))),
                        }
                    }
                }

                deserializer.deserialize_str(Visitor)
            }
        }

        impl JsonSchema for $name {
            fn inline_schema() -> bool {
                true
            }

            fn schema_name() -> Cow<'static, str> {
                stringify!($name).into()
            }

            fn json_schema(_: &mut SchemaGenerator) -> Schema {
                json_schema!({
                    "type": "string",
                    "enum": [$($wire),+],
                    "x-enum": stringify!($name),
                })
            }
        }
    };
}

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

wire_enum! {
    /// How a game ended. These values are stored in the database, so changing one requires a
    /// migration.
    pub enum EndCondition {
        Normal = 1 => "normal",
        Strikeout = 2 => "strikeout",
        Timeout = 3 => "timeout",
        TerminatedByPlayer = 4 => "terminatedByPlayer",
        SpeedrunFail = 5 => "speedrunFail",
        IdleTimeout = 6 => "idleTimeout",
        CharacterSoftlock = 7 => "characterSoftlock",
        AllOrNothingFail = 8 => "allOrNothingFail",
        AllOrNothingSoftlock = 9 => "allOrNothingSoftlock",
        TerminatedByVote = 10 => "terminatedByVote",
    }
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

/// Every wire enum, for the TypeScript generator.
pub const WIRE_ENUMS: &[WireEnum] = &[EndCondition::WIRE];
