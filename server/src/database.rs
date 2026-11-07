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
        "SELECT id AS user_id,
         (num_normal_games + CASE WHEN $2 THEN num_normal_speedrun_games ELSE 0 END)::bigint
         AS \"count!\"
         FROM users WHERE id=ANY($1)",
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

#[cfg(test)]
mod tests {
    use super::normal_game_counts;
    use crate::accounts::test_support::TestDb;

    async fn game(db: &TestDb, end_condition: i16, speedrun: bool, players: &[i32]) -> i32 {
        let id = sqlx::query_scalar!(
            "INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
             card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
             detrimental_characters,seed,score,num_turns,end_condition,datetime_started,
             datetime_finished)
             VALUES('Counts',$1,0,false,0,0,$2,false,false,false,false,false,false,false,
             'counts-'||gen_random_uuid(),0,1,$3,NOW(),NOW()) RETURNING id",
            players.len() as i16,
            speedrun,
            end_condition,
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        for (seat, player) in players.iter().enumerate() {
            sqlx::query!(
                "INSERT INTO game_participants(game_id,user_id,seat,character_assignment,
                 character_metadata) VALUES($1,$2,$3,0,0)",
                id,
                player,
                seat as i16,
            )
            .execute(&db.pool)
            .await
            .unwrap();
        }
        id
    }

    async fn stored_counts_match_a_recount(db: &TestDb) -> bool {
        sqlx::query_scalar!(
            "SELECT NOT EXISTS(SELECT 1 FROM users u LEFT JOIN (
               SELECT p.user_id, count(*) FILTER (WHERE NOT g.speedrun) AS normal,
                      count(*) FILTER (WHERE g.speedrun) AS speedrun
               FROM game_participants p JOIN games g ON g.id = p.game_id
               WHERE g.end_condition = 1 GROUP BY p.user_id) c ON c.user_id = u.id
             WHERE u.num_normal_games <> COALESCE(c.normal, 0)
                OR u.num_normal_speedrun_games <> COALESCE(c.speedrun, 0)) AS \"value!\""
        )
        .fetch_one(&db.pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn normal_game_counts_follow_saved_and_deleted_games_postgres() {
        let Some(db) = TestDb::create().await else {
            return;
        };
        let (alice, bob, carol) = (
            db.user("Alice").await,
            db.user("Bob").await,
            db.user("Carol").await,
        );
        let shared = game(&db, 1, false, &[alice, bob]).await;
        game(&db, 1, true, &[alice]).await;
        game(&db, 4, false, &[alice]).await;
        game(&db, 1, false, &[bob, carol]).await;
        assert!(stored_counts_match_a_recount(&db).await);
        let ids = [alice, bob, carol];
        let normal = normal_game_counts(&db.pool, &ids, false).await.unwrap();
        let all = normal_game_counts(&db.pool, &ids, true).await.unwrap();
        assert_eq!((normal[&alice], normal[&bob], normal[&carol]), (1, 2, 1));
        assert_eq!((all[&alice], all[&bob], all[&carol]), (2, 2, 1));

        sqlx::query!("DELETE FROM games WHERE id=$1", shared)
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(stored_counts_match_a_recount(&db).await);
        // Deleting a player also deletes their games, which other players lose too.
        sqlx::query!("DELETE FROM users WHERE id=$1", carol)
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(stored_counts_match_a_recount(&db).await);
        let all = normal_game_counts(&db.pool, &ids, true).await.unwrap();
        assert_eq!((all[&alice], all[&bob], all.get(&carol)), (1, 0, None));
        db.close().await;
    }
}
