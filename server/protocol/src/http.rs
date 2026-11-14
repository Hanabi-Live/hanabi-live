//! The payloads of the HTTP routes: accounts, errors, and the public pages and API.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

/// The `/login` form.
#[derive(Clone, Debug, Default, Serialize, Deserialize, JsonSchema)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
    /// Sets a new password after the current one is verified. A blank value is absent, as forms
    /// send a blank input.
    #[serde(
        deserialize_with = "deserialize_form_text",
        skip_serializing_if = "Option::is_none"
    )]
    pub new_password: Option<String>,
    /// The client's release. Only the website sends it. A blank value is absent, as forms send a
    /// blank input.
    #[serde(
        deserialize_with = "deserialize_form_text",
        skip_serializing_if = "Option::is_none"
    )]
    pub version: Option<String>,
    /// Creates the account if the username is free. Without it, an unknown username fails with
    /// `NoticeCode::NoAccount`, so that a typo does not create an account.
    pub create_account: bool,
    pub client: ClientKind,
}

named_enum! {
    /// The kind of program that logs in, in the `/login` form and the `/ws` query. Only the website
    /// (`web`) sends `version`, and the server rejects a version from another release. A `bot` login
    /// marks the account as a bot, which other players see and which can play at several tables at
    /// once. An `app` is a program for people, such as a mobile client. Its account is a normal
    /// account.
    #[derive(Default)]
    pub enum ClientKind {
        #[default]
        Web => "web",
        Bot => "bot",
        App => "app",
    }
}

/// The query of the `/ws` connection.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WebSocketQuery {
    /// The account to connect as, when the browser is signed in to several. Absent uses the most
    /// recent sign-in.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<UserId>,
    /// The client's release. Only the website sends it. The server tells a website with another
    /// release, or with none, to reload. A blank value is absent, as in the `/login` form.
    #[serde(
        default,
        deserialize_with = "deserialize_form_text",
        skip_serializing_if = "Option::is_none"
    )]
    pub version: Option<String>,
    #[serde(default)]
    pub client: ClientKind,
}

impl WebSocketQuery {
    /// The names of the query's parameters.
    pub const PARAMETERS: [&str; 3] = ["account", "version", "client"];
}

/// Reads a form field that is absent when it is blank, as forms send a blank input. The schema
/// accepts a blank value, so that the server and the clients' schemas agree on what is valid.
fn deserialize_form_text<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let text = Option::<String>::deserialize(deserializer)?;
    Ok(text.filter(|text| !text.is_empty()))
}

/// The `/api/v1/identity` request.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityRequest {
    #[schemars(length(min = 1))]
    pub token: String,
}

/// A newly issued identity token, from `/api/v1/identity/token`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityTokenResponse {
    #[serde(flatten)]
    pub user: UserRef,
    pub token: String,
    pub expires_at: Timestamp,
}

/// The `/password-reset` request: a new password for an administrator to set.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PasswordHashRequest {
    #[schemars(length(min = 1))]
    pub password: String,
}

/// The hash of a `/password-reset` request's password.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PasswordHashResponse {
    pub hash: String,
}

/// The variant names in `/api/v1/variants`, keyed by variant ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct VariantNames(pub std::collections::BTreeMap<String, String>);

/// How many games with a seed reached a score, as the seed page's chart shows them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreFrequency {
    pub score: Score,
    pub num_games: Count,
}

/// The variants in `/api/v1/variants-full`, keyed by variant ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct PublicVariants(pub std::collections::BTreeMap<String, PublicVariant>);

/// A variant in `/api/v1/variants-full`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicVariant {
    pub name: String,
    pub suits: Vec<String>,
    pub stack_size: StackSize,
    pub max_score: Score,
}

named_enum! {
    /// A column of the public game lists, which clients sort by `sort` and filter by
    /// `filter[name]`.
    pub enum GameListColumn {
        GameId => "gameId",
        NumPlayers => "numPlayers",
        Score => "score",
        VariantId => "variantId",
    }
}

named_enum! {
    /// An option that keeps a best score from counting as a normal one. A score with several of
    /// them shows only the first in this order.
    pub enum ScoreModifierOption {
        AllOrNothing => "allOrNothing",
        OneExtraCard => "oneExtraCard",
        OneLessCard => "oneLessCard",
        EmptyClues => "emptyClues",
        DeckPlays => "deckPlays",
    }
}

/// A best score on a public page, and the option that keeps it from counting as a normal one.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BestScore {
    /// Absent when no game was played.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<Score>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifier: Option<ScoreModifierOption>,
}

/// A variant that a player has played, with their best score at each player count.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VariantScores {
    pub variant_name: String,
    pub max_score: Score,
    pub num_games: Count,
    /// From the fewest players to the most.
    #[schemars(length(min = MAX_PLAYERS - MIN_PLAYERS + 1, max = MAX_PLAYERS - MIN_PLAYERS + 1))]
    pub best_scores: Vec<BestScore>,
}

named_enum! {
    /// How hard a max score is, from the clue efficiency that it needs.
    pub enum Difficulty {
        Normal => "normal",
        Hard => "hard",
        VeryHard => "veryHard",
    }
}

/// A variant at a player count that has no normal max score yet.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MissingScore {
    pub variant_name: String,
    pub num_players: NumPlayers,
    /// The best score of the players. Absent when none of them played.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<Score>,
    pub max_score: Score,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifier: Option<ScoreModifierOption>,
    /// The clue efficiency that a max score needs, rounded as the page shows it.
    pub efficiency: String,
    pub difficulty: Difficulty,
}

/// A player of a shared missing scores page.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MissingScoresPlayer {
    pub name: Username,
    /// Whether the filters leave the player's scores out.
    pub excluded: bool,
}

/// The filters of a missing scores page. They are query parameters, so the page reloads to apply
/// them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum MissingScoresFilters {
    /// A player's own page, which shows one player count or all of them.
    #[serde(rename_all = "camelCase")]
    Player {
        name: Username,
        /// Absent when the page shows every player count.
        #[serde(skip_serializing_if = "Option::is_none")]
        num_players: Option<NumPlayers>,
    },
    /// The page of several players. The text filters are as the address gives them.
    #[serde(rename_all = "camelCase")]
    Shared {
        players: Vec<MissingScoresPlayer>,
        exclude_variants: String,
        min_efficiency: String,
        max_efficiency: String,
        /// Whether any filter leaves out a player, a variant, or an efficiency.
        active: bool,
    },
}

named_enum! {
    /// A list of games on a public page, which the page loads from the matching `/api/v1` route.
    pub enum PublicGameList {
        History => "history",
        Seed => "seed",
        Tags => "tags",
        Tag => "tag",
    }
}

/// What the script of a public page draws: its table, and the controls and chart that go with it.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum PublicPageTable {
    /// A player's best scores, one row for each variant that they have played.
    Scores { variants: Vec<VariantScores> },
    /// The max scores that one or more players are missing.
    MissingScores {
        rows: Vec<MissingScore>,
        filters: MissingScoresFilters,
    },
    /// A list of games that the page loads one page at a time.
    #[serde(rename_all = "camelCase")]
    Games {
        list: PublicGameList,
        api_path: String,
        /// How many games reached each score. Only a seed's page has them.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        frequencies: Vec<ScoreFrequency>,
    },
}
