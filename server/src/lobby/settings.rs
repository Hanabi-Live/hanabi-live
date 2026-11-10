use anyhow::{Result, ensure};
use hanabi_protocol::UserId;
use serde_json::Value;
use sqlx::PgPool;

/// A user's preferences, using the client-facing names. The database stores only the values a
/// user changed; everything else comes from `Default`.
pub use hanabi_protocol::Settings;

/// Every setting with its default value, keyed by its client-facing name.
pub(super) fn defaults() -> serde_json::Map<String, Value> {
    match serde_json::to_value(Settings::default()) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("settings serialize to an object"),
    }
}

/// The values that differ from their defaults, in the form that the database stores.
pub fn changed_settings(settings: &Settings) -> Value {
    let defaults = defaults();
    match serde_json::to_value(settings) {
        Ok(Value::Object(map)) => Value::Object(
            map.into_iter()
                .filter(|(name, value)| defaults.get(name) != Some(value))
                .collect(),
        ),
        _ => unreachable!("settings serialize to an object"),
    }
}

pub async fn get_settings(pool: &PgPool, id: UserId) -> Result<Settings> {
    let stored = sqlx::query_scalar!("SELECT settings FROM users WHERE id=$1", id.0)
        .fetch_optional(pool)
        .await?
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
    Ok(from_stored(stored))
}

/// Keeps only the stored values that pass the wire contract. Unknown names (from a removed setting)
/// and values that are no longer valid (such as an empty variant name) fall back to their defaults
/// instead of reaching clients that would reject them.
fn from_stored(stored: Value) -> Settings {
    let Value::Object(stored) = stored else {
        return Settings::default();
    };
    let valid = stored
        .into_iter()
        .filter(|(name, value)| {
            hanabi_protocol::validate::<Settings>(&serde_json::json!({ name: value })).is_ok()
        })
        .collect();
    serde_json::from_value(Value::Object(valid)).unwrap_or_default()
}

/// Stores one setting, after checking it against the wire contract.
pub async fn set_setting(pool: &PgPool, id: UserId, name: &str, value: &Value) -> Result<()> {
    validate_setting(name, value).map_err(anyhow::Error::from)?;
    // A value equal to the default is removed, so changing a default later reaches everyone who
    // never chose it.
    let changed = (defaults().get(name) != Some(value)).then_some(value);
    let updated = sqlx::query!(
        "UPDATE users SET settings = CASE WHEN $3::jsonb IS NULL THEN settings - $2::text
           ELSE settings || jsonb_build_object($2::text, $3::jsonb) END
         WHERE id=$1",
        id.0,
        name,
        changed
    )
    .execute(pool)
    .await?;
    ensure!(updated.rows_affected() == 1, "The user does not exist.");
    Ok(())
}

/// Removes a setting that a user can leave unset.
pub async fn clear_setting(pool: &PgPool, id: UserId, name: &str) -> Result<()> {
    let updated = sqlx::query!(
        "UPDATE users SET settings = settings - $2::text WHERE id=$1",
        id.0,
        name
    )
    .execute(pool)
    .await?;
    ensure!(updated.rows_affected() == 1, "The user does not exist.");
    Ok(())
}

/// Checks a setting that a client sent. The wire contract gives each setting its type and limits.
pub fn validate_setting(name: &str, value: &Value) -> crate::errors::CommandResult<()> {
    ensure_or_reject!(
        hanabi_protocol::validate::<Settings>(&serde_json::json!({ name: value })).is_ok(),
        "The setting of \"{}\" is not an allowed value.",
        crate::accounts::escape_html(name)
    );
    ensure_or_reject!(
        name != "createTableTimeBaseMinutes" || value.as_f64().is_some_and(|minutes| minutes > 0.0),
        "The setting of \"{name}\" must be positive."
    );
    Ok(())
}
