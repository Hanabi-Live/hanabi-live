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
    /// Sets a new password after the current one is verified.
    pub new_password: String,
    pub version: String,
    /// Whether the client's system prefers a dark theme. A new account starts with this as its
    /// dark mode setting.
    pub dark_mode: bool,
}

/// The body of a successful `/login` response.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LoginResponse {
    #[serde(rename = "userID")]
    pub user_id: UserId,
}

/// The body of a JSON HTTP error response. Server failures also name their typed cause and the
/// diagnostic ID that their log entry carries.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ApiError {
    pub error: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "String")]
    pub code: Option<String>,
    #[serde(
        default,
        rename = "diagnosticID",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(with = "String")]
    pub diagnostic_id: Option<String>,
}

impl ApiError {
    /// An error without a typed cause, such as a refused request.
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            error: error.into(),
            code: None,
            diagnostic_id: None,
        }
    }
}

/// The `/api/v1/identity` request.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityRequest {
    #[schemars(length(min = 1))]
    pub token: String,
}

/// The account that an identity token belongs to.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityResponse {
    pub username: String,
}

/// A newly issued identity token, from `/api/v1/identity/token`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct IdentityTokenResponse {
    pub username: String,
    pub token: String,
    #[schemars(with = "Timestamp")]
    pub expires_at: String,
}

/// The `/password-reset` request: a new password for an administrator to set.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordHashRequest {
    #[schemars(length(min = 1))]
    pub password: String,
}

/// The hash of a `/password-reset` request's password.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct PasswordHashResponse {
    pub hash: String,
}

/// A page of games from the public `/api/v1/history`, `/seed`, and `/variants/{id}` lists.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGamePage {
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub total_rows: i64,
    /// The accepted parameters.
    pub info: String,
    pub rows: Vec<PublicGameRow>,
}

/// One game in a public game list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGameRow {
    pub id: GameId,
    #[schemars(range(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub num_players: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    /// The variant ID. Variant lists omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(max = u32::MAX))]
    pub variant: Option<u32>,
    /// How many games used this seed. Variant lists omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schemars(with = "u32", range(max = u32::MAX))]
    pub other_scores: Option<u32>,
    /// The players' names, separated by commas.
    pub users: String,
    /// When the game finished.
    #[schemars(with = "Timestamp")]
    pub datetime: String,
    pub seed: String,
}

/// The variant names in `/api/v1/variants`, keyed by variant ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct VariantNames(pub std::collections::BTreeMap<String, String>);

/// How many games with a seed reached a score, as the seed page's chart shows them.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreFrequency {
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    #[schemars(range(min = 1, max = MAX_SAFE_INTEGER))]
    pub num_times: i64,
}

/// A variant in `/api/v1/variants-full`, keyed by its ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicVariant {
    pub name: String,
    pub suits: Vec<String>,
    #[schemars(range(min = 1, max = MAX_RANK))]
    pub stack_size: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub max_score: u32,
}
