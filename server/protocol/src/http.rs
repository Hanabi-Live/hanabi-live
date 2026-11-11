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
    /// The client's release. Only the website sends it. A form's empty field is absent.
    #[serde(
        deserialize_with = "deserialize_form_text",
        skip_serializing_if = "Option::is_none"
    )]
    #[schemars(length(min = 1))]
    pub version: Option<String>,
    /// Whether the client's system prefers a dark theme. A new account starts with this as its
    /// dark mode setting.
    pub dark_mode: bool,
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
