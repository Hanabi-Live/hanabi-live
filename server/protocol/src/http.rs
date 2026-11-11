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
    /// Sets a new password after the current one is verified. A form's empty field is absent.
    #[serde(
        deserialize_with = "deserialize_form_text",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(length(min = 1))]
    pub new_password: Option<String>,
    pub version: String,
    /// Whether the client's system prefers a dark theme. A new account starts with this as its
    /// dark mode setting.
    pub dark_mode: bool,
    /// Creates the account if the username is free. Without it, an unknown username fails with
    /// `NO_ACCOUNT_CODE`, so that a typo does not create an account. Bots do not need it.
    pub create_account: bool,
}

/// Reads a form field that is absent when it is empty, as forms send a blank input.
fn deserialize_form_text<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let text = Option::<String>::deserialize(deserializer)?;
    Ok(text.filter(|text| !text.is_empty()))
}

/// The body of a successful `/login` response.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct LoginResponse {
    #[serde(rename = "userID")]
    pub user_id: UserId,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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
    #[serde(rename = "gameID")]
    pub game_id: GameId,
    #[schemars(with = "NumPlayers")]
    pub num_players: u8,
    #[schemars(range(min = 0, max = i32::MAX))]
    pub score: i32,
    /// Variant lists omit it.
    #[serde(rename = "variantID", skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0, max = u32::MAX))]
    pub variant_id: Option<u32>,
    /// How many games used this seed. Variant lists omit it.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(range(min = 0, max = MAX_SAFE_INTEGER))]
    pub num_games_on_seed: Option<i64>,
    /// In seat order.
    pub player_names: Vec<String>,
    #[schemars(with = "Timestamp")]
    pub datetime_finished: String,
    /// Absent for a game with its own deck instead of a seed, such as an imported one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<String>,
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
    pub max_score: i32,
}
