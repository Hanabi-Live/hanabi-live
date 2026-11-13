//! Public wire contracts and the game catalog format only: no database, actor, engine, or
//! transport dependencies.

pub use schemars::JsonSchema;
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

mod registry;
pub use registry::{
    ClientRequest, Reply, ReplyData, ServerEvent, decode, decode_event, decode_reply, event,
    event_contracts, exported, game_library, reply, reply_contracts, request_contracts, schemas,
    validate,
};

mod catalog;
mod chat;
mod game;
mod http;
mod integers;
mod lobby;
mod replay;
mod requests;
pub use catalog::*;
pub use chat::*;
pub use game::*;
pub use http::*;
pub use integers::*;
pub use lobby::*;
pub use replay::*;
pub use requests::*;

/// Defines the protocol's constants. `@data` or `@game` before a constant also exports it to
/// TypeScript under the same name, from the data package or from the game library, which
/// `exported_constants` lists for the generator.
macro_rules! constants {
    (@package data) => { ConstantPackage::Data };
    (@package game) => { ConstantPackage::Game };
    ($(
        $(#[$meta:meta])*
        $(@$package:ident)? $vis:vis const $name:ident: $ty:ty = $value:expr;
    )+) => {
        $($(#[$meta])* $vis const $name: $ty = $value;)+

        /// The constants that TypeScript exports, in the order of their definitions.
        pub fn exported_constants() -> Vec<ExportedConstant> {
            vec![$($(ExportedConstant {
                package: constants!(@package $package),
                name: stringify!($name),
                type_name: stringify!($ty),
                value: serde_json::json!($name),
            },)?)+]
        }
    };
}

/// The TypeScript package that exports a constant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConstantPackage {
    /// `@hanabi-live/data`.
    Data,
    /// `@hanabi-live/game`.
    Game,
}

/// A constant that TypeScript exports under the same name.
pub struct ExportedConstant {
    pub package: ConstantPackage,
    pub name: &'static str,
    /// The constant's Rust type, such as `u8` or `VariantId`.
    pub type_name: &'static str,
    pub value: serde_json::Value,
}

constants! {
    /// The largest integer that JavaScript numbers hold exactly (`Number.MAX_SAFE_INTEGER`).
    pub const MAX_SAFE_INTEGER: i64 = (1 << 53) - 1;

    /// The fewest players a game can have.
    @game pub const MIN_PLAYERS: usize = 2;
    /// The most players a game can have, which also bounds every per-player list.
    @game pub const MAX_PLAYERS: usize = 6;
    /// The highest seat index.
    pub(crate) const MAX_SEAT: usize = MAX_PLAYERS - 1;
    /// The player limit of a table whose creator did not choose one.
    @data pub const DEFAULT_MAX_PLAYERS: u8 = 5;
    /// The variant of a game or table that does not choose one.
    @game pub const DEFAULT_VARIANT_NAME: &str = "No Variant";
    /// The ID of `DEFAULT_VARIANT_NAME` in `variants.json`.
    @game pub const DEFAULT_VARIANT_ID: VariantId = VariantId(0);
    /// The most suits a variant can have.
    @game pub const MAX_SUITS: usize = 6;
    /// The highest suit index.
    pub(crate) const MAX_SUIT_INDEX: usize = MAX_SUITS - 1;
    /// The lowest rank.
    @game pub const MIN_RANK: i32 = 1;
    /// The highest normal rank, which is also a suit's stack size unless the variant sets one.
    @game pub const MAX_RANK: i32 = 5;
    /// The highest score: every card of the most suits played.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_possible_wrap,
        reason = "the most suits is far below i32::MAX"
    )]
    pub const MAX_SCORE: i32 = MAX_SUITS as i32 * MAX_RANK;
    /// The most cards in a hand without the options that change it: the hand of a 2- or 3-player game.
    pub const MAX_NORMAL_HAND_SIZE: usize = 5;
    /// The most cards in a hand: "One Extra Card" adds one.
    pub const MAX_HAND_SIZE: usize = MAX_NORMAL_HAND_SIZE + 1;
    /// The rank of a stack's start card, which Up or Down variants add to each suit.
    @game pub const START_CARD_RANK: i32 = 7;
    /// The rank clue that touches the odd ranks in an Odds and Evens variant.
    @game pub const ODD_RANK_CLUE: i32 = 1;
    /// The rank clue that touches the even ranks in an Odds and Evens variant.
    @game pub const EVEN_RANK_CLUE: i32 = 2;
    /// Clue tokens in play at most, before a clue-starved variant doubles their count.
    @game pub const MAX_CLUES: i32 = 8;
    /// The strikes that end a game.
    @game pub const MAX_STRIKES: i32 = 3;
    /// The clues at or below which a Panicky player must discard twice, before a clue-starved variant
    /// doubles their count.
    @game pub const PANICKY_MAX_CLUES: i32 = 4;
    /// The most cards a deck can have.
    @game pub const MAX_DECK_SIZE: usize = 60;
    /// The most actions a game can record.
    pub const MAX_GAME_ACTIONS: usize = 512;
    /// The longest seed that a table can request, in characters. The full seed also names the player count
    /// and variant, such as "p3v0s" before "123".
    @data pub const MAX_SEED_LENGTH: usize = 32;
    /// The longest chat message, in characters.
    @data pub const MAX_CHAT_LENGTH: usize = 300;
    /// The longest note, in characters, that a player or spectator writes during a game. The server
    /// cuts a longer note to this length.
    @data pub const MAX_NOTE_LENGTH: usize = 300;
    /// The longest game tag, in characters.
    pub const MAX_TAG_LENGTH: usize = 100;
    /// The longest table name that a player chooses, in characters. The server cuts a longer name to
    /// this length.
    @data pub const MAX_TABLE_NAME_LENGTH: usize = 45;
    /// The longest note, in characters, that an imported game can give a card.
    pub const MAX_IMPORTED_NOTE_LENGTH: usize = 65536;
    /// The number of seconds in a minute.
    @data pub const SECONDS_PER_MINUTE: i64 = 60;
    /// The milliseconds in a second. Player clocks and idle timers hold milliseconds; time options
    /// hold seconds.
    pub const MS_PER_SECOND: i64 = 1000;
    /// The milliseconds in a minute.
    pub const MS_PER_MINUTE: i64 = SECONDS_PER_MINUTE * MS_PER_SECOND;
    /// How long a game can go without a move before it ends.
    pub const IDLE_TIMEOUT_MS: i64 = 30 * MS_PER_MINUTE;
    /// How long before an idle game ends to warn its table.
    pub const IDLE_WARNING_MS: i64 = 5 * MS_PER_MINUTE;
    /// How long a typing indicator lasts without another keystroke, in milliseconds.
    @data pub const TYPING_TIMEOUT_MS: i64 = 2 * MS_PER_SECOND;
    /// The number of minutes in an hour.
    pub const MINUTES_PER_HOUR: i64 = 60;
    /// The number of seconds in an hour.
    pub const SECONDS_PER_HOUR: i64 = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
    /// The number of hours in a day.
    pub const HOURS_PER_DAY: i64 = 24;
    /// The number of seconds in a day.
    pub const SECONDS_PER_DAY: i64 = HOURS_PER_DAY * SECONDS_PER_HOUR;
    /// The longest starting clock a timed game can have, in seconds (one week).
    @data pub const MAX_BASE_SECONDS: i64 = 7 * SECONDS_PER_DAY;
    /// The most time a timed game can add each turn, in seconds (one day).
    @data pub const MAX_PER_TURN_SECONDS: i64 = SECONDS_PER_DAY;
    /// The loudest volume setting.
    @data pub const MAX_VOLUME: u8 = 100;
    /// The highest level of the H-Group convention guide's learning path.
    @data pub const MAX_H_GROUP_LEVEL: u8 = 25;
    /// The volume setting of a new user.
    pub const DEFAULT_VOLUME: u8 = MAX_VOLUME / 2;
    /// The starting clock that the "Create Game" form offers for a timed table, in seconds.
    @data pub const DEFAULT_BASE_SECONDS: i64 = 2 * SECONDS_PER_MINUTE;
    /// The time that the "Create Game" form offers for a timed table to add each turn, in seconds.
    @data pub const DEFAULT_PER_TURN_SECONDS: i64 = 20;
    /// The rows on a page of a public listing when the request does not name a limit.
    @data pub const DEFAULT_PAGE_LIMIT: i64 = 10;
    /// The most rows that a page of a public listing, a player's game history, or their private
    /// messages can have.
    @data pub const MAX_PAGE_LIMIT: i64 = 100;
    /// A table's progress, as a percentage, once its game reaches the maximum score or its replay
    /// reaches the last turn.
    pub const MAX_PROGRESS: u8 = 100;
    /// How far a shared replay's leader can move the count of cards that the efficiency uses, either way.
    /// It never needs to be larger than a deck.
    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_possible_wrap,
        reason = "the largest deck is far below i32::MAX"
    )]
    @data pub const MAX_EFFICIENCY_MODIFIER: i32 = MAX_DECK_SIZE as i32;
    /// The highest card order: stack bases follow the cards of the largest deck, one for each suit.
    const MAX_CARD_ORDER: usize = MAX_DECK_SIZE + MAX_SUITS - 1;
}

/// Lets a flag be omitted when it is false; an explicit false is then never sent.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde passes skipped fields by reference"
)]
pub(crate) fn is_false(value: &bool) -> bool {
    !*value
}

/// Every normal rank, which are also the ranks that clues can name.
fn ranks() -> Vec<i32> {
    (MIN_RANK..=MAX_RANK).collect()
}

/// Every rank a catalog can name: the normal ranks and the start card's.
fn catalog_ranks() -> Vec<i32> {
    ranks().into_iter().chain([START_CARD_RANK]).collect()
}

/// Every number of players that a game can have.
fn player_counts() -> Vec<i64> {
    (MIN_PLAYERS..=MAX_PLAYERS)
        .filter_map(|count| i64::try_from(count).ok())
        .collect()
}

/// Whether a game can have this many players.
pub fn is_player_count<T: TryInto<usize>>(count: T) -> bool {
    count
        .try_into()
        .is_ok_and(|count| (MIN_PLAYERS..=MAX_PLAYERS).contains(&count))
}

/// A payload without fields, for a message whose name says everything.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Empty {}

/// A payload that names only a table: a request about the table, or a message about it.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TableRef {
    pub table_id: TableId,
}

/// Defines a string of the wire that is never empty.
macro_rules! wire_string {
    (
        $(#[doc = $doc:literal])+
        $(#[derive($($derive:ident),+)])?
        $name:ident
    ) => {
        $(#[doc = $doc])+
        #[derive(
            Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize
            $($(, $derive)+)?
        )]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn as_str(&self) -> &str {
                &self.0
            }

            pub fn into_string(self) -> String {
                self.0
            }
        }

        impl From<String> for $name {
            fn from(text: String) -> Self {
                Self(text)
            }
        }

        impl From<&str> for $name {
            fn from(text: &str) -> Self {
                Self(text.to_owned())
            }
        }

        impl std::ops::Deref for $name {
            type Target = str;

            fn deref(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                self.0.fmt(f)
            }
        }

        impl JsonSchema for $name {
            fn inline_schema() -> bool {
                true
            }

            fn schema_name() -> std::borrow::Cow<'static, str> {
                stringify!($name).into()
            }

            fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
                schemars::json_schema!({
                    "type": "string",
                    "minLength": 1,
                })
            }
        }
    };
}

wire_string! {
    /// A username that the server sends. Requests carry plain strings instead, as the `requests`
    /// module explains.
    ///
    /// Send a name alone when the client only shows it or compares it, such as a chat author or a
    /// player's name, or when the name may have no account, such as a player of an imported game
    /// or a Discord author. A name names one account exactly: names are unique and never change.
    /// When the client sends the user back or acts on the account, send a `UserRef` instead.
    Username
}

wire_string! {
    /// A deal's seed, such as "p3v0s123": the player count, the variant ID, and the table's choice
    /// or a number.
    Seed
}

/// One author's notes, by card order. An empty note is a card without one.
pub struct Notes;

impl JsonSchema for Notes {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "Notes".into()
    }

    fn json_schema(generator: &mut schemars::SchemaGenerator) -> schemars::Schema {
        <Vec<String>>::json_schema(generator)
    }
}

/// Whether each player has loaded the game, in seat order.
pub struct PlayerConnections;

impl JsonSchema for PlayerConnections {
    fn schema_name() -> std::borrow::Cow<'static, str> {
        "PlayerConnections".into()
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "array",
            "items": { "type": "boolean" },
            "minItems": MIN_PLAYERS,
            "maxItems": MAX_PLAYERS,
        })
    }
}

/// A timestamp on the wire: RFC 3339 in UTC, with milliseconds, such as
/// "2026-01-01T12:00:00.000Z". Both the server's and the clients' schemas accept only this form.
/// Checkpoints can hold the forms that older servers wrote, so reading one does not check it.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Timestamp(String);

impl Timestamp {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<chrono::DateTime<chrono::Utc>> for Timestamp {
    fn from(time: chrono::DateTime<chrono::Utc>) -> Self {
        Self(time.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
    }
}

impl std::fmt::Display for Timestamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

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
            let result = match case["direction"].as_str().unwrap() {
                "request" => ClientRequest::decode(command, &case["input"])
                    .map(|message| message.map(|message| message.data())),
                "reply" => decode_reply(command, &case["input"]),
                _ => decode_event(command, &case["input"]),
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
    fn timestamps_are_utc_with_milliseconds() {
        let time = chrono::DateTime::from_timestamp(1_767_268_800, 123_456_789).unwrap();
        assert_eq!(Timestamp::from(time).as_str(), "2026-01-01T12:00:00.123Z");
        let whole = chrono::DateTime::from_timestamp(1_767_268_800, 0).unwrap();
        assert_eq!(Timestamp::from(whole).as_str(), "2026-01-01T12:00:00.000Z");
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
            "text": "private text", "tableId": null
        }))
        .unwrap_err();
        assert!(!format!("{error:#}").contains("private text"));
        let data = decode::<ChatRequest>(&json!({"text":"hello"})).unwrap();
        assert_eq!(serde_json::to_value(data).unwrap(), json!({"text":"hello"}));
    }
}
