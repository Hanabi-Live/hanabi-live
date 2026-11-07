use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

/// A user's preferences, using the client-facing names. The database stores only the values a
/// user changed; everything else comes from `Default`. Unknown stored names are ignored, so a
/// setting can be removed without a migration.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub desktop_notification: bool,
    /// See the client's `SoundMove` enum.
    pub sound_move: i16,
    pub sound_timer: bool,
    pub keldon_mode: bool,
    pub colorblind_mode: bool,
    pub real_life_mode: bool,
    pub reverse_hands: bool,
    pub style_numbers: bool,
    pub show_timer_in_untimed: bool,
    pub speedrun_preplay: bool,
    pub speedrun_mode: bool,
    pub hyphenated_conventions: bool,
    pub volume: i16,
    pub create_table_variant: String,
    pub create_table_timed: bool,
    pub create_table_time_base_minutes: f64,
    pub create_table_time_per_turn_seconds: i32,
    pub create_table_speedrun: bool,
    pub create_table_card_cycle: bool,
    pub create_table_deck_plays: bool,
    pub create_table_empty_clues: bool,
    pub create_table_one_extra_card: bool,
    pub create_table_one_less_card: bool,
    pub create_table_all_or_nothing: bool,
    pub create_table_detrimental_characters: bool,
    pub create_table_max_players: i16,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            desktop_notification: false,
            sound_move: 0,
            sound_timer: true,
            keldon_mode: false,
            colorblind_mode: false,
            real_life_mode: false,
            reverse_hands: false,
            style_numbers: false,
            show_timer_in_untimed: false,
            speedrun_preplay: false,
            speedrun_mode: false,
            hyphenated_conventions: false,
            volume: 50,
            create_table_variant: "No Variant".into(),
            create_table_timed: false,
            create_table_time_base_minutes: 2.0,
            create_table_time_per_turn_seconds: 20,
            create_table_speedrun: false,
            create_table_card_cycle: false,
            create_table_deck_plays: false,
            create_table_empty_clues: false,
            create_table_one_extra_card: false,
            create_table_one_less_card: false,
            create_table_all_or_nothing: false,
            create_table_detrimental_characters: false,
            create_table_max_players: 5,
        }
    }
}

/// Every setting with its default value, keyed by its client-facing name.
pub(super) fn defaults() -> serde_json::Map<String, Value> {
    match serde_json::to_value(Settings::default()) {
        Ok(Value::Object(map)) => map,
        _ => unreachable!("settings serialize to an object"),
    }
}

pub async fn get_settings(pool: &PgPool, id: i32) -> Result<Value> {
    let stored = sqlx::query_scalar!("SELECT settings FROM users WHERE id=$1", id)
        .fetch_optional(pool)
        .await?
        .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
    let settings: Settings = serde_json::from_value(stored)?;
    Ok(serde_json::to_value(settings)?)
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
            let number = value.parse::<f64>().ok().filter(|n| n.is_finite());
            ensure!(
                number.is_some(),
                "The setting of \"{name}\" must be an float64."
            );
            let number = number.unwrap();
            ensure!(
                number > 0.0 && number <= 86400.0,
                "The setting of \"{name}\" is too large."
            );
            Value::from(number)
        }
        Value::Number(_) => {
            let number = value.parse::<i64>().ok();
            ensure!(
                number.is_some(),
                "The setting of \"{name}\" must be an integer."
            );
            let number = number.unwrap();
            ensure!(
                (0..=604800).contains(&number),
                "The setting of \"{name}\" is too large."
            );
            ensure!(
                name != "volume" || number <= 100,
                "The setting of \"volume\" must be between 0 and 100."
            );
            Value::from(number)
        }
        Value::String(_) => Value::String(value.to_owned()),
        _ => unreachable!("settings are booleans, numbers, or strings"),
    };
    // The field's own type enforces the remaining limits, such as small integer ranges.
    ensure!(
        serde_json::from_value::<Settings>(serde_json::json!({ name: parsed })).is_ok(),
        "The setting of \"{name}\" is too large."
    );
    Ok(parsed)
}
