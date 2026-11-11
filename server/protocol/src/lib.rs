//! Public wire contracts and the game catalog format only: no database, actor, engine, or
//! transport dependencies.

pub use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

mod enums;
pub use enums::{
    ClueType, EndCondition, GameListColumn, RecordedActionType, SoundMove, Status, WIRE_ENUMS,
    WireEnum, WireEnumMember, WireValue,
};
mod registry;
pub use registry::{
    ClientMessage, ServerMessage, client_contracts, decode, decode_server, exported, schemas,
    server, server_contracts, validate,
};

mod catalog;
mod chat;
mod game;
mod http;
mod lobby;
mod replay;
mod requests;
pub use catalog::*;
pub use chat::*;
pub use game::*;
pub use http::*;
pub use lobby::*;
pub use replay::*;
pub use requests::*;

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
/// The player limit of a table whose creator did not choose one.
pub const DEFAULT_MAX_PLAYERS: u8 = 5;
/// The variant of a game or table that does not choose one.
pub const DEFAULT_VARIANT_NAME: &str = "No Variant";
/// What follows the creator's name to name a table whose creator did not choose a name.
pub const DEFAULT_TABLE_NAME_SUFFIX: &str = "'s table";
/// The `code` of the login error for a client from a different release, which reloads the page.
pub const OUTDATED_CLIENT_CODE: &str = "outdated_client";
/// The `code` of the login error for a username that has no account, when the client did not ask
/// to create one. The client asks the player to confirm before it creates the account.
pub const NO_ACCOUNT_CODE: &str = "no_account";
/// The most suits a variant can have.
pub const MAX_SUITS: usize = 6;
/// The highest suit index.
pub(crate) const MAX_SUIT_INDEX: usize = MAX_SUITS - 1;
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
pub const SECONDS_PER_MINUTE: i64 = 60;
/// Player clocks and idle timers hold milliseconds; time options hold seconds.
pub const CLOCK_UNITS_PER_SECOND: i64 = 1000;
/// The clock units in a minute.
pub const CLOCK_UNITS_PER_MINUTE: i64 = SECONDS_PER_MINUTE * CLOCK_UNITS_PER_SECOND;
/// How long a game can go without a move before it ends.
pub const IDLE_TIMEOUT_MS: i64 = 30 * CLOCK_UNITS_PER_MINUTE;
/// How long a typing indicator lasts without another keystroke, in milliseconds.
pub const TYPING_TIMEOUT_MS: i64 = 2 * CLOCK_UNITS_PER_SECOND;
/// The number of minutes in an hour.
pub const MINUTES_PER_HOUR: i64 = 60;
/// The number of seconds in an hour.
pub const SECONDS_PER_HOUR: i64 = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
/// The number of hours in a day.
pub const HOURS_PER_DAY: i64 = 24;
/// The number of seconds in a day.
pub const SECONDS_PER_DAY: i64 = HOURS_PER_DAY * SECONDS_PER_HOUR;
/// The longest starting clock a timed game can have, in seconds (one week).
pub const MAX_TIME_BASE_SECONDS: i64 = 7 * SECONDS_PER_DAY;
/// The most time a timed game can add each turn, in seconds (one day).
pub const MAX_TIME_PER_TURN_SECONDS: i64 = SECONDS_PER_DAY;
/// The loudest volume setting.
pub const MAX_VOLUME: u8 = 100;
/// The highest level of the H-Group convention guide's learning path.
pub const MAX_H_GROUP_LEVEL: u8 = 25;
/// The volume setting of a new user.
pub const DEFAULT_VOLUME: u8 = MAX_VOLUME / 2;
/// The starting clock that a new user's timed tables have, in minutes.
pub const DEFAULT_TIME_BASE_MINUTES: f64 = 2.0;
/// The time that a new user's timed tables add each turn, in seconds.
pub const DEFAULT_TIME_PER_TURN_SECONDS: i64 = 20;
/// The rows on a page of a public listing when the request does not name a size.
pub const DEFAULT_PAGE_SIZE: i64 = 10;
/// The most rows that a page of a public listing or of a player's game history can have.
pub const MAX_PAGE_SIZE: i64 = 100;
/// The most private messages that one history request can ask for.
pub const MAX_PRIVATE_HISTORY_MESSAGES: i64 = 100;
/// A table's progress, as a percentage, once its game reaches the maximum score or its replay
/// reaches the last turn.
pub const MAX_PROGRESS: u8 = 100;
/// The highest card order: stack bases follow the cards of the largest deck, one for each suit.
const MAX_CARD_ORDER: usize = MAX_DECK_SIZE + MAX_SUITS - 1;

/// Every normal rank, which are also the ranks that clues can name.
fn ranks() -> Vec<i32> {
    (MIN_RANK..=MAX_RANK).collect()
}

/// Every rank a catalog can name: the normal ranks and the start card's.
fn catalog_ranks() -> Vec<i32> {
    ranks().into_iter().chain([START_CARD_RANK]).collect()
}

/// Every stack size that a variant can set, all smaller than the default of `MAX_RANK`.
fn explicit_stack_sizes() -> Vec<i32> {
    (1..MAX_RANK).collect()
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

/// A username that the server sends, which is never empty. Requests carry plain strings instead, so
/// that the server can answer a missing name, such as in a chat command, with a helpful warning.
pub struct Username;

impl JsonSchema for Username {
    fn inline_schema() -> bool {
        true
    }

    fn schema_name() -> std::borrow::Cow<'static, str> {
        "Username".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "string",
            "minLength": 1,
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

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "TableID"))]
pub struct TableId(#[schemars(range(min = 0, max = MAX_SAFE_INTEGER))] pub u64);

impl std::fmt::Display for TableId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "UserID"))]
pub struct UserId(#[schemars(range(min = 0, max = i32::MAX))] pub i32);

impl std::fmt::Display for UserId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
#[schemars(extend("x-brand" = "GameID"))]
pub struct GameId(#[schemars(range(min = 0, max = i32::MAX))] pub i32);

impl std::fmt::Display for GameId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

/// An integer that JavaScript represents exactly. Lists of integers use it to bound each item.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
pub struct SafeInteger(#[schemars(range(min = -MAX_SAFE_INTEGER, max = MAX_SAFE_INTEGER))] pub i64);

/// Defines a small non-negative integer on the wire, such as a seat or a card's position. Each one
/// is its own type, so that one cannot stand in for another, and its schema lists or bounds the
/// values that the wire accepts.
macro_rules! wire_index {
    (
        $(#[doc = $doc:literal])*
        $name:ident, $max:expr $(, values = $values:expr)? $(, brand = $brand:literal)?
    ) => {
        $(#[doc = $doc])*
        #[derive(
            Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize,
            Deserialize, JsonSchema,
        )]
        #[serde(transparent)]
        $(#[schemars(extend("x-brand" = $brand))])?
        pub struct $name(
            #[schemars(range(min = 0, max = $max) $(, extend("enum" = $values))?)] pub u8,
        );

        impl $name {
            /// The largest value.
            pub const MAX: usize = $max;

            /// The value, if it is in range.
            pub fn new<T: TryInto<usize>>(value: T) -> Option<Self> {
                value
                    .try_into()
                    .ok()
                    .filter(|value| *value <= Self::MAX)
                    .and_then(|value| u8::try_from(value).ok())
                    .map(Self)
            }

            pub const fn index(self) -> usize {
                self.0 as usize
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl From<$name> for i32 {
            fn from(value: $name) -> Self {
                value.0.into()
            }
        }

        impl From<$name> for usize {
            fn from(value: $name) -> Self {
                value.index()
            }
        }
    };
}

/// Every value from 0 to `max`, for schemas that list them.
fn up_to(max: usize) -> Vec<usize> {
    (0..=max).collect()
}

wire_index! {
    /// A seat in a game. The game library's `PlayerIndex` type.
    PlayerIndex, MAX_SEAT, values = up_to(MAX_SEAT)
}

wire_index! {
    /// A card's position in the initial deck, which identifies it. Stack bases follow the cards of
    /// the largest deck.
    CardOrder, MAX_CARD_ORDER, brand = "CardOrder"
}

wire_index! {
    /// A card's suit.
    SuitIndex, MAX_SUIT_INDEX, values = up_to(MAX_SUIT_INDEX)
}

wire_index! {
    /// The index of a color in the variant's clue colors.
    ColorIndex, MAX_SUIT_INDEX, values = up_to(MAX_SUIT_INDEX)
}

/// A card's rank. 7 is the rank of a stack's start card.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
pub struct CardRank(
    #[schemars(range(min = MIN_RANK, max = START_CARD_RANK), extend("enum" = catalog_ranks()))]
    pub u8,
);

/// A rank that clues can name.
#[derive(
    Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, JsonSchema,
)]
#[serde(transparent)]
pub struct RankClueNumber(
    #[schemars(range(min = MIN_RANK, max = MAX_RANK), extend("enum" = ranks()))] pub u8,
);

/// Converts a rank to its wire type, if it is one that the type allows.
macro_rules! rank_conversions {
    ($($name:ident: $allowed:expr;)+) => {$(
        impl $name {
            pub fn new<T: TryInto<i32>>(rank: T) -> Option<Self> {
                rank.try_into()
                    .ok()
                    .filter(|rank| $allowed.contains(rank))
                    .and_then(|rank| u8::try_from(rank).ok())
                    .map(Self)
            }
        }

        impl From<$name> for i32 {
            fn from(value: $name) -> Self {
                value.0.into()
            }
        }
    )+};
}

rank_conversions! {
    CardRank: catalog_ranks();
    RankClueNumber: ranks();
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
    fn every_schema_is_valid() {
        for (name, schema) in schemas() {
            assert!(
                jsonschema::options().build(&schema).is_ok(),
                "{name} has an invalid schema"
            );
        }
    }

    #[test]
    fn optional_values_are_omitted_not_null() {
        let error = decode::<ChatRequest>(&json!({
            "text": "private text", "tableID": null
        }))
        .unwrap_err();
        assert!(!format!("{error:#}").contains("private text"));
        let data = decode::<ChatRequest>(&json!({"text":"hello"})).unwrap();
        assert_eq!(serde_json::to_value(data).unwrap(), json!({"text":"hello"}));
    }
}
