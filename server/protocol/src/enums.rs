//! Integer enums on the wire. Each one is defined only here: its schema and the TypeScript enum that
//! clients use are both generated from the definition.

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
    pub value: i32,
    pub description: &'static str,
}

/// Defines an enum that is sent as an integer, with a schema that names it so that clients use the
/// generated TypeScript enum.
macro_rules! wire_enum {
    (
        $(#[doc = $doc:literal])*
        pub enum $name:ident {
            $($(#[doc = $member_doc:literal])* $member:ident = $value:literal,)+
        }
    ) => {
        $(#[doc = $doc])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(try_from = "i32", into = "i32")]
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
                    value: $value,
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
}

wire_enum! {
    /// The kind of a turn that a player takes. A game's record stores it as a `RecordedActionType`.
    pub enum ActionType {
        Play = 0,
        Discard = 1,
        ColorClue = 2,
        RankClue = 3,
    }
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

/// A turn is recorded with the same type.
impl From<ActionType> for RecordedActionType {
    fn from(action: ActionType) -> Self {
        match action {
            ActionType::Play => Self::Play,
            ActionType::Discard => Self::Discard,
            ActionType::ColorClue => Self::ColorClue,
            ActionType::RankClue => Self::RankClue,
        }
    }
}

wire_enum! {
    /// The kind of a clue in a game event. Actions name clues with `ActionType` instead.
    pub enum ClueType {
        Color = 0,
        Rank = 1,
    }
}

wire_enum! {
    /// How a game ended. These values are stored in the database, so changing one requires a
    /// migration.
    pub enum EndCondition {
        InProgress = 0,
        Normal = 1,
        Strikeout = 2,
        Timeout = 3,
        TerminatedByPlayer = 4,
        SpeedrunFail = 5,
        IdleTimeout = 6,
        CharacterSoftlock = 7,
        AllOrNothingFail = 8,
        AllOrNothingSoftlock = 9,
        TerminatedByVote = 10,
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

wire_enum! {
    /// The parts of the board that a shared-replay arrow can point at, besides cards.
    pub enum ReplayBoardElement {
        Nothing = -1,
        Deck = -2,
        Turn = -3,
        Score = -4,
        MaxScore = -5,
        Clues = -6,
        Strike1 = -7,
        Strike2 = -8,
        Strike3 = -9,
        Pace = -10,
        Efficiency = -11,
        MinEfficiency = -12,
    }
}

wire_enum! {
    /// Which moves play a sound: every move, only the player's own, or none.
    pub enum SoundMove {
        All = 0,
        OnlyOwn = 1,
        None = 2,
    }
}

wire_enum! {
    /// The activity that a user is currently performing.
    pub enum Status {
        Lobby = 0,
        Pregame = 1,
        Playing = 2,
        Spectating = 3,
        Replay = 4,
        SharedReplay = 5,
    }
}

/// Every wire enum, for the TypeScript generator.
pub const WIRE_ENUMS: &[WireEnum] = &[
    ActionType::WIRE,
    ClueType::WIRE,
    EndCondition::WIRE,
    GameListColumn::WIRE,
    RecordedActionType::WIRE,
    ReplayBoardElement::WIRE,
    SoundMove::WIRE,
    Status::WIRE,
];
