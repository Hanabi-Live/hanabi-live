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

wire_enum! {
    /// The type of an action in a game's record: a turn, or the end of the game. The database
    /// stores these values in `game_actions`.
    pub enum RecordedActionType {
        Play = 0,
        Discard = 1,
        ColorClue = 2,
        RankClue = 3,
        /// The game ended. The value is its `EndCondition`, and the target is the player who ended
        /// it, or -1.
        GameOver = 4,
        /// The players voted to end the game.
        GameOverByVote = 5,
    }
}

impl RecordedActionType {
    pub const fn is_clue(self) -> bool {
        matches!(self, Self::ColorClue | Self::RankClue)
    }

    pub const fn is_game_over(self) -> bool {
        matches!(self, Self::GameOver | Self::GameOverByVote)
    }
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

/// The activity that a user is currently performing.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Lobby,
    Pregame,
    Playing,
    Spectating,
    Replay,
    SharedReplay,
}

/// Every wire enum, for the TypeScript generator.
pub const WIRE_ENUMS: &[WireEnum] = &[
    EndCondition::WIRE,
    GameListColumn::WIRE,
    RecordedActionType::WIRE,
];
