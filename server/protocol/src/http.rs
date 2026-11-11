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
    /// `NoticeCode::NoAccount`, so that a typo does not create an account.
    pub create_account: bool,
    /// Marks the account as a bot, which other players see and which can play at several tables at
    /// once. A bot does not send `version`.
    pub bot: bool,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LoginResponse {
    pub user_id: UserId,
}

/// The `/api/v1/identity` request.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityRequest {
    #[schemars(length(min = 1))]
    pub token: String,
}

/// The account that an identity token belongs to.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityResponse {
    pub username: Username,
}

/// A newly issued identity token, from `/api/v1/identity/token`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct IdentityTokenResponse {
    pub username: Username,
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

/// A page of games from the public `/api/v1/history`, `/seed`, and `/variants/{id}` lists.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGamePage {
    pub games: Vec<PublicGameRow>,
    /// How many games the list has on all of its pages.
    pub total: Count,
}

/// One game in a public game list.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicGameRow {
    pub game_id: GameId,
    pub score: Score,
    /// Variant lists omit it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant_id: Option<VariantId>,
    /// How many games used this seed. Absent in variant lists and for a game with no seed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub num_games_on_seed: Option<Count>,
    /// In seat order.
    #[schemars(length(min = MIN_PLAYERS, max = MAX_PLAYERS))]
    pub player_names: Vec<Username>,
    pub finished_at: Timestamp,
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
    pub score: Score,
    pub num_times: Count,
}

/// A variant in `/api/v1/variants-full`, keyed by its ID.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicVariant {
    pub name: String,
    pub suits: Vec<String>,
    #[schemars(range(min = 1, max = MAX_RANK))]
    pub stack_size: u8,
    pub max_score: Score,
}
