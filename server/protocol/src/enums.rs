//! Enums that the database stores as integers. Each one is defined only here: its schema and the
//! TypeScript enum that clients use are both generated from the definition. On the wire, an enum
//! is either its integer or, when its members name themselves, its member's name.

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
    pub value: WireValue,
    pub description: &'static str,
}

/// What a wire enum's member is on the wire.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WireValue {
    Integer(i32),
    Name(&'static str),
}

impl WireValue {
    pub fn json(self) -> serde_json::Value {
        match self {
            Self::Integer(value) => value.into(),
            Self::Name(name) => name.into(),
        }
    }
}

/// Defines an enum that the database stores as an integer, with a schema that names it so that
/// clients use the generated TypeScript enum. With `=> "name"` after each member, the wire carries
/// the names instead of the integers. Such an enum still reads the integer, which state that older
/// servers stored holds.
macro_rules! wire_enum {
    (
        $(#[doc = $doc:literal])*
        pub enum $name:ident {
            $($(#[doc = $member_doc:literal])* $member:ident = $value:literal,)+
        }
    ) => {
        wire_enum!(@common $(#[doc = $doc])* $name {
            $($(#[doc = $member_doc])* $member = $value => WireValue::Integer($value),)+
        });

        impl Serialize for $name {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_i32(i32::from(*self))
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                Self::try_from(i32::deserialize(deserializer)?).map_err(serde::de::Error::custom)
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
                    "type": "integer",
                    "enum": [$($value),+],
                    "x-enum": stringify!($name),
                })
            }
        }
    };
    (
        $(#[doc = $doc:literal])*
        pub enum $name:ident {
            $($(#[doc = $member_doc:literal])* $member:ident = $value:literal => $wire:literal,)+
        }
    ) => {
        wire_enum!(@common $(#[doc = $doc])* $name {
            $($(#[doc = $member_doc])* $member = $value => WireValue::Name($wire),)+
        });

        impl $name {
            /// The member's name on the wire.
            pub const fn wire_name(self) -> &'static str {
                match self {
                    $(Self::$member => $wire,)+
                }
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

                    // State that older servers stored holds the integer.
                    fn visit_i64<E: serde::de::Error>(self, value: i64) -> Result<$name, E> {
                        i32::try_from(value)
                            .map_err(E::custom)
                            .and_then(|value| $name::try_from(value).map_err(E::custom))
                    }

                    fn visit_u64<E: serde::de::Error>(self, value: u64) -> Result<$name, E> {
                        i32::try_from(value)
                            .map_err(E::custom)
                            .and_then(|value| $name::try_from(value).map_err(E::custom))
                    }
                }

                deserializer.deserialize_any(Visitor)
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
    (
        @common $(#[doc = $doc:literal])* $name:ident {
            $($(#[doc = $member_doc:literal])* $member:ident = $value:literal => $wire:expr,)+
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
    };
}

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
        InProgress = 0 => "inProgress",
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

wire_enum! {
    /// A column of the public game lists, which clients sort by `col[index]` and filter by
    /// `fcol[index]`.
    pub enum GameListColumn {
        Id = 0,
        NumPlayers = 1,
        Score = 2,
        Variant = 3,
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

/// Defines `NoticeCode` and the name of each code on the wire. The clients' schema cannot describe
/// each code, so their descriptions are comments.
macro_rules! notice_codes {
    ($($variant:ident => $name:literal,)+) => {
        /// The typed cause of a failure that a notice reports.
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
        pub enum NoticeCode {
            $(#[serde(rename = $name)] $variant,)+
        }

        impl NoticeCode {
            /// The code's name on the wire.
            pub const fn name(self) -> &'static str {
                match self {
                    $(Self::$variant => $name,)+
                }
            }
        }
    };
}

notice_codes! {
    ArchiveInconsistentPlayers => "archive_inconsistent_players",
    ArchiveInvalidAction => "archive_invalid_action",
    ArchiveInvalidSeed => "archive_invalid_seed",
    ArchiveMissingSeed => "archive_missing_seed",
    ArchiveUnknownCharacter => "archive_unknown_character",
    ArchiveUnknownVariant => "archive_unknown_variant",
    // A command that failed for a reason the server did not anticipate. Its report keeps the
    // server's own description, so the player can pass it on with the reference.
    CommandFailed => "command_failed",
    ConnectionLimit => "connection_limit",
    DatabaseConnectionFailed => "database_connection_failed",
    DatabaseConstraintFailed => "database_constraint_failed",
    DatabaseDuplicate => "database_duplicate",
    DatabaseError => "database_error",
    DatabaseLockTimeout => "database_lock_timeout",
    DatabasePoolTimeout => "database_pool_timeout",
    DatabaseQueryCancelled => "database_query_cancelled",
    DatabaseQueryTimeout => "database_query_timeout",
    DatabaseReferenceConflict => "database_reference_conflict",
    DatabaseResultInvalid => "database_result_invalid",
    DatabaseTransactionConflict => "database_transaction_conflict",
    DatabaseUnavailable => "database_unavailable",
    DiscordAnnouncementTimeout => "discord_announcement_timeout",
    DiscordChannelInvalid => "discord_channel_invalid",
    DiscordConfiguration => "discord_configuration",
    DiscordRoleMissing => "discord_role_missing",
    // A failure that the report does not recognize.
    InternalOperationFailed => "internal_operation_failed",
    LiveStateUnavailable => "live_state_unavailable",
    LobbyLoadTimeout => "lobby_load_timeout",
    LobbyQueueFull => "lobby_queue_full",
    // A login for a username that has no account, when the client did not ask to create one. The
    // client asks the player to confirm before it creates the account.
    NoAccount => "no_account",
    OperationTimeout => "operation_timeout",
    // A login or connection from a client of a different release. The client reloads the page.
    OutdatedClient => "outdated_client",
    PasswordProcessingBusy => "password_processing_busy",
    PasswordProcessingFailed => "password_processing_failed",
    // A password check that waits for earlier ones from the same address.
    PasswordRateLimited => "password_rate_limited",
    PersistenceUncertain => "persistence_uncertain",
    RecordNotFound => "record_not_found",
    ServerDataInvalid => "server_data_invalid",
    // A command or request that arrives while the server starts or drains.
    ServerDraining => "server_draining",
    ServerIoError => "server_io_error",
    ServerUnavailable => "server_unavailable",
    SessionGenerationExhausted => "session_generation_exhausted",
    // The same account connected somewhere else.
    SessionReplaced => "session_replaced",
    TableFailed => "table_failed",
    TableUnreadable => "table_unreadable",
    UpstreamConnectionFailed => "upstream_connection_failed",
    UpstreamHttpError => "upstream_http_error",
    UpstreamRequestInvalid => "upstream_request_invalid",
    UpstreamResponseInvalid => "upstream_response_invalid",
    UpstreamTimeout => "upstream_timeout",
    UpstreamUnauthorized => "upstream_unauthorized",
    WorkerFailed => "worker_failed",
}

impl std::fmt::Display for NoticeCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.name())
    }
}

/// Every wire enum, for the TypeScript generator.
pub const WIRE_ENUMS: &[WireEnum] = &[EndCondition::WIRE, GameListColumn::WIRE];
