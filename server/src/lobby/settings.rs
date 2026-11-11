use anyhow::{Result, ensure};
use hanabi_protocol::{CreateTableSettings, UserId};
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

/// The name of the setting that holds the "Create Game" form.
const CREATE_TABLE: &str = "createTable";

/// The settings that held the "Create Game" form before `createTable`, each with the place in
/// `createTable` of its value. "createTableTimed" has none: it decides whether the options have the
/// clock. Users who have not changed the form since then still have them stored.
const LEGACY_CREATE_TABLE: [(&str, &str); 12] = [
    ("createTableMaxPlayers", "/maxPlayers"),
    ("createTableVariant", "/options/variantName"),
    ("createTableTimed", ""),
    ("createTableTimeBaseSeconds", "/timeControl/baseSeconds"),
    (
        "createTableTimePerTurnSeconds",
        "/timeControl/perTurnSeconds",
    ),
    ("createTableSpeedrun", "/options/speedrun"),
    ("createTableDeckPlays", "/options/deckPlays"),
    ("createTableEmptyClues", "/options/emptyClues"),
    ("createTableOneExtraCard", "/options/oneExtraCard"),
    ("createTableOneLessCard", "/options/oneLessCard"),
    ("createTableAllOrNothing", "/options/allOrNothing"),
    (
        "createTableDetrimentalCharacters",
        "/options/detrimentalCharacters",
    ),
];

/// Builds `createTable` from the settings that held the form before it, if a user has any. A value
/// that is no longer valid takes its default, as it did before.
fn legacy_create_table(stored: &serde_json::Map<String, Value>) -> Option<Value> {
    if !LEGACY_CREATE_TABLE
        .iter()
        .any(|(name, _)| stored.contains_key(*name))
    {
        return None;
    }
    let mut create = serde_json::to_value(CreateTableSettings::default()).ok()?;
    for (name, pointer) in LEGACY_CREATE_TABLE {
        let Some(value) = stored.get(name).filter(|_| !pointer.is_empty()) else {
            continue;
        };
        let mut candidate = create.clone();
        if let Some(slot) = candidate.pointer_mut(pointer) {
            *slot = value.clone();
        }
        if hanabi_protocol::validate::<CreateTableSettings>(&candidate).is_ok() {
            create = candidate;
        }
    }
    if stored.get("createTableTimed") == Some(&Value::Bool(true)) {
        create["options"]["timeControl"] = create["timeControl"].clone();
    }
    Some(create)
}

/// Keeps only the stored values that pass the wire contract. Unknown names (from a removed setting)
/// and values that are no longer valid (such as an empty variant name) fall back to their defaults
/// instead of reaching clients that would reject them.
fn from_stored(stored: Value) -> Settings {
    let Value::Object(mut stored) = stored else {
        return Settings::default();
    };
    if !stored.contains_key(CREATE_TABLE)
        && let Some(create) = legacy_create_table(&stored)
    {
        stored.insert(CREATE_TABLE.into(), create);
    }
    let valid = stored
        .into_iter()
        .filter(|(name, value)| {
            hanabi_protocol::validate::<Settings>(&serde_json::json!({ name: value })).is_ok()
        })
        .collect();
    serde_json::from_value(Value::Object(valid)).unwrap_or_default()
}

/// Stores one setting, after checking it against the wire contract. A setting that is an object is
/// stored whole, with its missing fields filled in.
pub async fn set_setting(pool: &PgPool, id: UserId, name: &str, value: &Value) -> Result<()> {
    validate_setting(name, value).map_err(anyhow::Error::from)?;
    let full = serde_json::to_value(serde_json::from_value::<Settings>(
        serde_json::json!({ name: value }),
    )?)?;
    let value = full.get(name).unwrap_or(value);
    // A value equal to the default is removed, so changing a default later reaches everyone who
    // never chose it.
    let changed = (defaults().get(name) != Some(value)).then_some(value);
    // `createTable` replaces the settings that held the form before it.
    let replaced: Vec<&str> = if name == CREATE_TABLE {
        LEGACY_CREATE_TABLE.iter().map(|(name, _)| *name).collect()
    } else {
        vec![]
    };
    let updated = sqlx::query!(
        "UPDATE users SET settings = CASE WHEN $3::jsonb IS NULL THEN settings - $2::text
           ELSE settings || jsonb_build_object($2::text, $3::jsonb) END - $4::text[]
         WHERE id=$1",
        id.0,
        name,
        changed,
        &replaced as &[&str]
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
    Ok(())
}
