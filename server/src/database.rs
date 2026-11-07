use anyhow::Result;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::BTreeMap;

// Pregame/player-info exclude speedruns; the welcome/history total includes them.
pub(crate) async fn normal_game_counts(
    pool: &PgPool,
    ids: &[i32],
    include_speedruns: bool,
) -> Result<BTreeMap<i32, i64>> {
    let rows = sqlx::query!(
        "SELECT p.user_id, count(*) AS \"count!\"
         FROM game_participants p
         CROSS JOIN LATERAL (SELECT end_condition,speedrun FROM games WHERE id=p.game_id OFFSET 0) g
         WHERE p.user_id=ANY($1) AND g.end_condition=1 AND ($2 OR NOT g.speedrun)
         GROUP BY p.user_id",
        ids,
        include_speedruns,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.user_id, row.count))
        .collect())
}

pub(crate) async fn normal_game_count(
    pool: &PgPool,
    id: i32,
    include_speedruns: bool,
) -> Result<i64> {
    Ok(normal_game_counts(pool, &[id], include_speedruns)
        .await?
        .get(&id)
        .copied()
        .unwrap_or(0))
}

#[derive(Serialize)]
pub(crate) struct UserStats {
    pub user_id: i32,
    pub variant_id: i16,
    pub num_games: i32,
    pub best_score2: i16,
    pub best_score2_mod: i16,
    pub best_score3: i16,
    pub best_score3_mod: i16,
    pub best_score4: i16,
    pub best_score4_mod: i16,
    pub best_score5: i16,
    pub best_score5_mod: i16,
    pub best_score6: i16,
    pub best_score6_mod: i16,
    pub average_score: f64,
    pub num_strikeouts: i32,
}

#[derive(Serialize)]
pub(crate) struct VariantStats {
    pub variant_id: i16,
    pub num_games: i32,
    pub best_score2: i16,
    pub best_score3: i16,
    pub best_score4: i16,
    pub best_score5: i16,
    pub best_score6: i16,
    pub num_max_scores: i32,
    pub average_score: f64,
    pub num_strikeouts: i32,
}

/// Serializes to the client-facing setting names.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UserSettings {
    pub desktop_notification: bool,
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

/// The column defaults from `install/database_schema.sql`, for users who never changed a setting.
impl Default for UserSettings {
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
