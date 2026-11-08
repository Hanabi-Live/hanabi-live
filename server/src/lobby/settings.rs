use anyhow::{Result, bail, ensure};
use serde_json::Value;
use sqlx::PgPool;

/// A user's preferences, using the client-facing names. The database stores only the values a
/// user changed; everything else comes from `Default`.
pub use hanabi_protocol::Settings;

use hanabi_protocol::MAX_VOLUME;

/// Every setting with its default value, keyed by its client-facing name.
pub(super) fn defaults() -> serde_json::Map<String, Value> {
    match serde_json::to_value(Settings::default()) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("settings serialize to an object"),
    }
}

pub async fn get_settings(pool: &PgPool, id: i32) -> Result<Settings> {
    let stored = sqlx::query_scalar!("SELECT settings FROM users WHERE id=$1", id)
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

pub async fn set_setting(pool: &PgPool, id: i32, name: &str, value: &str) -> Result<()> {
    let value = validate_setting(name, value)?;
    // A value equal to the default is removed, so changing a default later reaches everyone who
    // never chose it.
    let changed = (defaults().get(name) != Some(&value)).then_some(value);
    let updated = sqlx::query!(
        "UPDATE users SET settings = CASE WHEN $3::jsonb IS NULL THEN settings - $2::text
           ELSE settings || jsonb_build_object($2::text, $3::jsonb) END
         WHERE id=$1",
        id,
        name,
        changed
    )
    .execute(pool)
    .await?;
    ensure!(updated.rows_affected() == 1, "The user does not exist.");
    Ok(())
}

/// Parses a setting sent by a client into the JSON value that is stored.
pub fn validate_setting(name: &str, value: &str) -> Result<Value> {
    ensure!(!name.is_empty(), "The settings name cannot be blank.");
    let defaults = defaults();
    let Some(default) = defaults.get(name) else {
        bail!(
            "The settings name of \"{}\" is invalid.",
            crate::accounts::escape_html(name)
        );
    };
    let parsed = match default {
        Value::Bool(_) => {
            ensure!(
                matches!(value, "true" | "false"),
                "The setting of \"{name}\" must have a value of \"true\" or \"false\"."
            );
            Value::Bool(value == "true")
        }
        Value::Number(number) if number.is_f64() => {
            let Some(number) = value.parse::<f64>().ok().filter(|n| n.is_finite()) else {
                bail!("The setting of \"{name}\" must be an float64.");
            };
            ensure!(number > 0.0, "The setting of \"{name}\" must be positive.");
            Value::from(number)
        }
        Value::Number(_) => {
            let Ok(number) = value.parse::<i64>() else {
                bail!("The setting of \"{name}\" must be an integer.");
            };
            ensure!(number >= 0, "The setting of \"{name}\" cannot be negative.");
            ensure!(
                name != "volume" || number <= i64::from(MAX_VOLUME),
                "The setting of \"volume\" must be between 0 and {MAX_VOLUME}."
            );
            Value::from(number)
        }
        Value::String(_) => Value::String(value.to_owned()),
        _ => unreachable!("settings are booleans, numbers, or strings"),
    };
    // The wire contract enforces the remaining limits, such as the timed-game limits and the allowed
    // player counts.
    ensure!(
        hanabi_protocol::validate::<Settings>(&serde_json::json!({ name: parsed })).is_ok(),
        "The setting of \"{name}\" is not an allowed value."
    );
    Ok(parsed)
}
