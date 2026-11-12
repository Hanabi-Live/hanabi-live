use anyhow::{Result, ensure};
use hanabi_protocol::UserId;
use serde_json::Value;
use sqlx::PgPool;

/// A user's preferences, using the client-facing names. The database stores only the values a
/// user changed; everything else comes from `Default`.
pub use hanabi_protocol::Settings;
use hanabi_protocol::{OptionalSetting, SettingsChange};

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

/// Stores a change to a user's settings in one statement. A setting changed to its default, and an
/// optional setting that is cleared, is removed, so that changing a default later reaches everyone
/// who never chose it.
pub async fn set_settings(
    pool: &PgPool,
    id: UserId,
    change: &SettingsChange,
    cleared: &[OptionalSetting],
) -> Result<()> {
    let defaults = defaults();
    let Value::Object(changes) = serde_json::to_value(change)? else {
        unreachable!("a settings change serializes to an object")
    };
    let mut removed: Vec<String> = cleared
        .iter()
        .map(|setting| setting.name().to_owned())
        .collect();
    let mut stored = serde_json::Map::new();
    for (name, value) in changes {
        if defaults.get(&name) == Some(&value) {
            removed.push(name);
        } else {
            stored.insert(name, value);
        }
    }
    let updated = sqlx::query!(
        "UPDATE users SET settings = (settings || $2::jsonb) - $3::text[] WHERE id=$1",
        id.0,
        Value::Object(stored),
        &removed
    )
    .execute(pool)
    .await?;
    ensure!(updated.rows_affected() == 1, "The user does not exist.");
    Ok(())
}
