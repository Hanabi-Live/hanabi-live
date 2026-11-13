//! The payloads of the HTTP routes that the website uses: identity tokens, password hashes, and the public pages and API.
//! Behind the `http` feature, since a client of the WebSocket does not need them.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

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
