//! The integers of the wire. Each one is its own type, so that one cannot stand in for another, and
//! its schema declares the range, and if needed the values, that the wire accepts.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the integers use the crate's shared constants and schema helpers"
    )
)]
use super::*;

/// The JSON Schema format of an integer type.
trait IntegerFormat {
    const FORMAT: &'static str;
}

macro_rules! integer_formats {
    ($($int:ty => $format:literal),+ $(,)?) => {$(
        impl IntegerFormat for $int {
            const FORMAT: &'static str = $format;
        }
    )+};
}

integer_formats! {
    u8 => "uint8",
    u16 => "uint16",
    u32 => "uint32",
    u64 => "uint64",
    i32 => "int32",
    i64 => "int64",
}

/// Defines an integer of the wire, from `min` to `max`. `values` lists the values that it can have
/// within that range, and `brand` gives its TypeScript type a brand. `new` returns the value only
/// when the wire accepts it, so that the server cannot send a value that the clients' schema
/// rejects.
macro_rules! wire_integer {
    (
        $(#[doc = $doc:literal])+
        $(#[derive($($derive:ident),+)])?
        $name:ident($vis:vis $int:ty), $min:expr, $max:expr
        $(, values = $values:expr)?
        $(, brand = $brand:literal)?
    ) => {
        $(#[doc = $doc])+
        #[derive(
            Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize
            $($(, $derive)+)?
        )]
        #[serde(transparent)]
        pub struct $name($vis $int);

        impl $name {
            /// The value, if the wire accepts it.
            pub fn new<T: TryInto<i64>>(value: T) -> Option<Self> {
                let value = value.try_into().ok()?;
                let in_range = i64::try_from($min).is_ok_and(|min| value >= min)
                    && i64::try_from($max).is_ok_and(|max| value <= max);
                let listed = true
                    $(&& $values.into_iter().any(|listed| i64::try_from(listed).ok() == Some(value)))?;
                if in_range && listed { <$int>::try_from(value).ok().map(Self) } else { None }
            }

            pub const fn get(self) -> $int {
                self.0
            }
        }

        impl From<$name> for $int {
            fn from(value: $name) -> Self {
                value.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl JsonSchema for $name {
            fn schema_name() -> std::borrow::Cow<'static, str> {
                stringify!($name).into()
            }

            fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
                let mut schema = schemars::json_schema!({
                    "type": "integer",
                    "format": <$int as IntegerFormat>::FORMAT,
                    "minimum": $min,
                    "maximum": $max,
                });
                let doc: &[&str] = &[$($doc),+];
                schema.insert(
                    "description".into(),
                    doc.iter().map(|line| line.trim()).collect::<Vec<_>>().join("\n").into(),
                );
                $(schema.insert("enum".into(), $values.into());)?
                $(schema.insert("x-brand".into(), $brand.into());)?
                schema
            }
        }
    };
}

/// Adds `index`, for an integer that indexes a list, such as the players or the deck.
macro_rules! list_indexes {
    ($($name:ident),+ $(,)?) => {$(
        impl $name {
            pub const fn index(self) -> usize {
                self.0 as usize
            }
        }

        impl From<$name> for usize {
            fn from(value: $name) -> Self {
                value.index()
            }
        }

        impl From<$name> for i32 {
            fn from(value: $name) -> Self {
                value.0.into()
            }
        }
    )+};
}

wire_integer! {
    /// A table's ID.
    TableId(pub u64), 1, MAX_SAFE_INTEGER, brand = "TableId"
}

wire_integer! {
    /// A user's ID.
    UserId(pub i32), 1, i32::MAX, brand = "UserId"
}

wire_integer! {
    /// A saved game's ID.
    GameId(pub i32), 1, i32::MAX, brand = "GameId"
}

wire_integer! {
    /// A variant's number in `variants.json`. "No Variant" is 0. The database stores it as a
    /// `SMALLINT`.
    VariantId(pub u32), 0, i16::MAX, brand = "VariantId"
}

wire_integer! {
    /// A detrimental character's number in `characters.json`. The database stores it as a
    /// `SMALLINT`.
    CharacterId(pub u32), 0, i16::MAX, brand = "CharacterId"
}

wire_integer! {
    /// A chat message's ID in `chat_log`.
    ChatId(pub i64), 1, MAX_SAFE_INTEGER, brand = "ChatId"
}

wire_integer! {
    /// A number of things, such as games or unread messages, or a position in a list of them.
    #[derive(Default)]
    Count(pub i64), 0, MAX_SAFE_INTEGER
}

wire_integer! {
    /// A game's score: the cards played, or less in a variant that scores some cards lower.
    #[derive(Default)]
    Score(pub i32), 0, MAX_SCORE
}

wire_integer! {
    /// A turn of a game, or a position in its replay, counting from 0. A game records at most
    /// `MAX_GAME_ACTIONS` actions, so it has no more turns than that.
    #[derive(Default)]
    Turn(pub u16), 0, MAX_GAME_ACTIONS
}

wire_integer! {
    /// A seat in a game. The game library's `PlayerIndex` type.
    PlayerIndex(pub u8), 0, MAX_SEAT, values = up_to(MAX_SEAT)
}

wire_integer! {
    /// A card's position in the initial deck, which identifies it. Stack bases follow the cards of
    /// the largest deck.
    CardOrder(pub u8), 0, MAX_CARD_ORDER, brand = "CardOrder"
}

wire_integer! {
    /// A card's suit.
    SuitIndex(pub u8), 0, MAX_SUIT_INDEX, values = up_to(MAX_SUIT_INDEX)
}

wire_integer! {
    /// The index of a color in the variant's clue colors.
    ColorIndex(pub u8), 0, MAX_SUIT_INDEX, values = up_to(MAX_SUIT_INDEX)
}

list_indexes!(Turn, PlayerIndex, CardOrder, SuitIndex, ColorIndex);

wire_integer! {
    /// A card's rank. 7 is the rank of a stack's start card.
    CardRank(pub u8), MIN_RANK, START_CARD_RANK, values = catalog_ranks()
}

wire_integer! {
    /// A rank that clues can name.
    ClueRank(pub u8), MIN_RANK, MAX_RANK, values = ranks()
}

impl From<CardRank> for i32 {
    fn from(value: CardRank) -> Self {
        value.0.into()
    }
}

impl From<ClueRank> for i32 {
    fn from(value: ClueRank) -> Self {
        value.0.into()
    }
}

wire_integer! {
    /// A number of votes: at most one for each player.
    VoteCount(pub u8), 0, MAX_PLAYERS
}

wire_integer! {
    /// A length of time in milliseconds, such as how long a turn has taken.
    #[derive(Default)]
    Milliseconds(pub i64), 0, MAX_SAFE_INTEGER
}

wire_integer! {
    /// A player's clock in milliseconds: the time left in a timed game, which goes below 0 when it
    /// runs out, or the time taken in an untimed one.
    PlayerClock(pub i64), -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER
}

wire_integer! {
    /// The starting clock of each player of a timed game, in seconds.
    BaseSeconds(pub i64), 0, MAX_TIME_BASE_SECONDS
}

wire_integer! {
    /// The time that a timed game adds to a player's clock after each of their turns, in seconds.
    PerTurnSeconds(pub i64), 0, MAX_TIME_PER_TURN_SECONDS
}

wire_integer! {
    /// A table's progress, as a percentage of the maximum score, or of a replay's turns.
    #[derive(Default)]
    Progress(pub u8), 0, MAX_PROGRESS
}

wire_integer! {
    /// The volume of the sounds, as a percentage.
    Volume(pub u8), 0, MAX_VOLUME
}

wire_integer! {
    /// The number of cards in each stack of a variant.
    StackSize(pub u8), MIN_RANK, MAX_RANK, values = ranks()
}

wire_integer! {
    /// A number of players.
    NumPlayers(pub(crate) u8), MIN_PLAYERS, MAX_PLAYERS, values = player_counts()
}

/// The player limit of a table whose creator did not choose one.
impl Default for NumPlayers {
    fn default() -> Self {
        Self(DEFAULT_MAX_PLAYERS)
    }
}

impl From<NumPlayers> for usize {
    fn from(value: NumPlayers) -> Self {
        value.0.into()
    }
}

wire_integer! {
    /// The highest H-Group level that a user wants to play at.
    HGroupLevel(pub(crate) u8), 1, MAX_H_GROUP_LEVEL
}

wire_integer! {
    /// How far a shared replay's leader moved the count of cards that the efficiency uses.
    #[derive(Default)]
    EfficiencyModifier(pub(crate) i32), -MAX_EFFICIENCY_MODIFIER, MAX_EFFICIENCY_MODIFIER
}

wire_integer! {
    /// The most rows that one page of a list can ask for.
    PageLimit(pub(crate) i64), 1, MAX_PAGE_LIMIT
}

/// Every value from 0 to `max`, for schemas that list them.
fn up_to(max: usize) -> Vec<usize> {
    (0..=max).collect()
}
