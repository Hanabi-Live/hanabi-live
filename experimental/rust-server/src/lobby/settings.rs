use anyhow::{Result, bail, ensure};
use serde_json::{Value, json};
use sqlx::PgPool;

// SQL identifiers only come from this closed list; values are always bound.
const FIELDS: &[(&str, &str, &str)] = &[
    ("desktopNotification", "desktop_notification", "bool"),
    ("soundMove", "sound_move", "smallint"),
    ("soundTimer", "sound_timer", "bool"),
    ("keldonMode", "keldon_mode", "bool"),
    ("colorblindMode", "colorblind_mode", "bool"),
    ("realLifeMode", "real_life_mode", "bool"),
    ("reverseHands", "reverse_hands", "bool"),
    ("styleNumbers", "style_numbers", "bool"),
    ("showTimerInUntimed", "show_timer_in_untimed", "bool"),
    ("speedrunPreplay", "speedrun_preplay", "bool"),
    ("speedrunMode", "speedrun_mode", "bool"),
    ("hyphenatedConventions", "hyphenated_conventions", "bool"),
    ("volume", "volume", "smallint"),
    ("createTableVariant", "create_table_variant", "text"),
    ("createTableTimed", "create_table_timed", "bool"),
    (
        "createTableTimeBaseMinutes",
        "create_table_time_base_minutes",
        "float8",
    ),
    (
        "createTableTimePerTurnSeconds",
        "create_table_time_per_turn_seconds",
        "int",
    ),
    ("createTableSpeedrun", "create_table_speedrun", "bool"),
    ("createTableCardCycle", "create_table_card_cycle", "bool"),
    ("createTableDeckPlays", "create_table_deck_plays", "bool"),
    ("createTableEmptyClues", "create_table_empty_clues", "bool"),
    (
        "createTableOneExtraCard",
        "create_table_one_extra_card",
        "bool",
    ),
    (
        "createTableOneLessCard",
        "create_table_one_less_card",
        "bool",
    ),
    (
        "createTableAllOrNothing",
        "create_table_all_or_nothing",
        "bool",
    ),
    (
        "createTableDetrimentalCharacters",
        "create_table_detrimental_characters",
        "bool",
    ),
    (
        "createTableMaxPlayers",
        "create_table_max_players",
        "smallint",
    ),
];

pub async fn get_settings(pool: &PgPool, id: i32) -> Result<Value> {
    let row = sqlx::query_as!(
        crate::database::UserSettings,
        "SELECT user_id,desktop_notification,sound_move,sound_timer,keldon_mode,colorblind_mode,
         real_life_mode,reverse_hands,style_numbers,show_timer_in_untimed,speedrun_preplay,speedrun_mode,
         hyphenated_conventions,volume,create_table_variant,create_table_timed,create_table_time_base_minutes,
         create_table_time_per_turn_seconds,create_table_speedrun,create_table_card_cycle,create_table_deck_plays,
         create_table_empty_clues,create_table_one_extra_card,create_table_one_less_card,create_table_all_or_nothing,
         create_table_detrimental_characters,create_table_max_players FROM user_settings WHERE user_id=$1 LIMIT 1",
        id
    )
    .fetch_optional(pool)
    .await?
    .map(serde_json::to_value)
    .transpose()?;
    let mut result = serde_json::Map::new();
    for (name, column, kind) in FIELDS {
        let value = row
            .as_ref()
            .and_then(|row| row.get(column))
            .cloned()
            .unwrap_or_else(|| match *name {
                "soundTimer" => json!(true),
                "volume" => json!(50),
                "createTableVariant" => json!("No Variant"),
                "createTableTimeBaseMinutes" => json!(2),
                "createTableTimePerTurnSeconds" => json!(20),
                "createTableMaxPlayers" => json!(5),
                _ if *kind == "bool" => json!(false),
                _ => json!(0),
            });
        result.insert((*name).to_owned(), value);
    }
    Ok(Value::Object(result))
}

pub async fn set_setting(pool: &PgPool, id: i32, name: &str, value: &str) -> Result<()> {
    let (column, kind) = validate_setting(name, value)?;
    let mut tx = pool.begin().await?;
    let user = sqlx::query!("SELECT id FROM users WHERE id=$1 FOR UPDATE", id)
        .fetch_one(&mut *tx)
        .await?;
    let _: i32 = user.id;
    sqlx::query!(
        "INSERT INTO user_settings(user_id) SELECT $1 WHERE NOT EXISTS
         (SELECT 1 FROM user_settings WHERE user_id=$1)",
        id
    )
    .execute(&mut *tx)
    .await?;
    let mut query = sqlx::QueryBuilder::<sqlx::Postgres>::new("UPDATE user_settings SET ");
    query
        .push(column)
        .push("=")
        .push_bind(value)
        .push("::text::")
        .push(kind)
        .push(" WHERE user_id=")
        .push_bind(id);
    query.build().execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub fn validate_setting(name: &str, value: &str) -> Result<(&'static str, &'static str)> {
    ensure!(!name.is_empty(), "The settings name cannot be blank.");
    let Some((_, column, kind)) = FIELDS.iter().find(|(key, _, _)| *key == name) else {
        bail!(
            "The settings name of \"{}\" is invalid.",
            crate::accounts::escape_html(name)
        );
    };
    match *kind {
        "bool" => ensure!(
            matches!(value, "true" | "false"),
            "The setting of \"{name}\" must have a value of \"true\" or \"false\"."
        ),
        "float8" => {
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
        }
        "int" | "smallint" => {
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
                *kind != "smallint" || number <= i64::from(i16::MAX),
                "The setting of \"{name}\" is too large."
            );
            ensure!(
                name != "volume" || number <= 100,
                "The setting of \"volume\" must be between 0 and 100."
            );
        }
        _ => {}
    }
    Ok((column, kind))
}
