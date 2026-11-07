use anyhow::{Result, bail, ensure};
use sqlx::PgPool;

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Kind {
    Bool,
    SmallInt,
    Int,
    Float,
    Text,
}

/// A validated setting value, typed to match its column.
pub enum Value {
    Bool(bool),
    SmallInt(i16),
    Int(i32),
    Float(f64),
    Text(String),
}

// The client-facing setting names; each has a typed update in `set_setting`.
pub(super) const FIELDS: &[(&str, Kind)] = &[
    ("desktopNotification", Kind::Bool),
    ("soundMove", Kind::SmallInt),
    ("soundTimer", Kind::Bool),
    ("keldonMode", Kind::Bool),
    ("colorblindMode", Kind::Bool),
    ("realLifeMode", Kind::Bool),
    ("reverseHands", Kind::Bool),
    ("styleNumbers", Kind::Bool),
    ("showTimerInUntimed", Kind::Bool),
    ("speedrunPreplay", Kind::Bool),
    ("speedrunMode", Kind::Bool),
    ("hyphenatedConventions", Kind::Bool),
    ("volume", Kind::SmallInt),
    ("createTableVariant", Kind::Text),
    ("createTableTimed", Kind::Bool),
    ("createTableTimeBaseMinutes", Kind::Float),
    ("createTableTimePerTurnSeconds", Kind::Int),
    ("createTableSpeedrun", Kind::Bool),
    ("createTableCardCycle", Kind::Bool),
    ("createTableDeckPlays", Kind::Bool),
    ("createTableEmptyClues", Kind::Bool),
    ("createTableOneExtraCard", Kind::Bool),
    ("createTableOneLessCard", Kind::Bool),
    ("createTableAllOrNothing", Kind::Bool),
    ("createTableDetrimentalCharacters", Kind::Bool),
    ("createTableMaxPlayers", Kind::SmallInt),
];

pub async fn get_settings(pool: &PgPool, id: i32) -> Result<serde_json::Value> {
    let row = sqlx::query_as!(
        crate::database::UserSettings,
        "SELECT desktop_notification,sound_move,sound_timer,keldon_mode,colorblind_mode,
         real_life_mode,reverse_hands,style_numbers,show_timer_in_untimed,speedrun_preplay,speedrun_mode,
         hyphenated_conventions,volume,create_table_variant,create_table_timed,create_table_time_base_minutes,
         create_table_time_per_turn_seconds,create_table_speedrun,create_table_card_cycle,create_table_deck_plays,
         create_table_empty_clues,create_table_one_extra_card,create_table_one_less_card,create_table_all_or_nothing,
         create_table_detrimental_characters,create_table_max_players FROM user_settings WHERE user_id=$1 LIMIT 1",
        id
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or_default();
    Ok(serde_json::to_value(row)?)
}

pub async fn set_setting(pool: &PgPool, id: i32, name: &str, value: &str) -> Result<()> {
    let value = validate_setting(name, value)?;
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
    match (name, value) {
        ("desktopNotification", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET desktop_notification=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("soundMove", Value::SmallInt(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET sound_move=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("soundTimer", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET sound_timer=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("keldonMode", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET keldon_mode=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("colorblindMode", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET colorblind_mode=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("realLifeMode", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET real_life_mode=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("reverseHands", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET reverse_hands=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("styleNumbers", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET style_numbers=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("showTimerInUntimed", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET show_timer_in_untimed=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("speedrunPreplay", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET speedrun_preplay=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("speedrunMode", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET speedrun_mode=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("hyphenatedConventions", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET hyphenated_conventions=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("volume", Value::SmallInt(v)) => {
            sqlx::query!("UPDATE user_settings SET volume=$1 WHERE user_id=$2", v, id)
                .execute(&mut *tx)
                .await?;
        }
        ("createTableVariant", Value::Text(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_variant=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableTimed", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_timed=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableTimeBaseMinutes", Value::Float(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_time_base_minutes=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableTimePerTurnSeconds", Value::Int(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_time_per_turn_seconds=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableSpeedrun", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_speedrun=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableCardCycle", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_card_cycle=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableDeckPlays", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_deck_plays=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableEmptyClues", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_empty_clues=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableOneExtraCard", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_one_extra_card=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableOneLessCard", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_one_less_card=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableAllOrNothing", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_all_or_nothing=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableDetrimentalCharacters", Value::Bool(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_detrimental_characters=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        ("createTableMaxPlayers", Value::SmallInt(v)) => {
            sqlx::query!(
                "UPDATE user_settings SET create_table_max_players=$1 WHERE user_id=$2",
                v,
                id
            )
            .execute(&mut *tx)
            .await?;
        }
        _ => bail!("The setting of \"{name}\" has no matching column."),
    }
    tx.commit().await?;
    Ok(())
}

pub fn validate_setting(name: &str, value: &str) -> Result<Value> {
    ensure!(!name.is_empty(), "The settings name cannot be blank.");
    let Some(&(_, kind)) = FIELDS.iter().find(|(key, _)| *key == name) else {
        bail!(
            "The settings name of \"{}\" is invalid.",
            crate::accounts::escape_html(name)
        );
    };
    Ok(match kind {
        Kind::Bool => {
            ensure!(
                matches!(value, "true" | "false"),
                "The setting of \"{name}\" must have a value of \"true\" or \"false\"."
            );
            Value::Bool(value == "true")
        }
        Kind::Float => {
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
            Value::Float(number)
        }
        Kind::Int | Kind::SmallInt => {
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
                kind != Kind::SmallInt || number <= i64::from(i16::MAX),
                "The setting of \"{name}\" is too large."
            );
            ensure!(
                name != "volume" || number <= 100,
                "The setting of \"volume\" must be between 0 and 100."
            );
            if kind == Kind::SmallInt {
                Value::SmallInt(i16::try_from(number)?)
            } else {
                Value::Int(i32::try_from(number)?)
            }
        }
        Kind::Text => Value::Text(value.to_owned()),
    })
}
