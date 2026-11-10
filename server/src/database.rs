use anyhow::Result;
use hanabi_protocol::UserId;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::BTreeMap;

// Pregame/player-info exclude speedruns; the welcome/history total includes them.
pub(crate) async fn normal_game_counts(
    pool: &PgPool,
    ids: &[UserId],
    include_speedruns: bool,
) -> Result<BTreeMap<UserId, i64>> {
    let ids = ids.iter().map(|id| id.0).collect::<Vec<_>>();
    let rows = sqlx::query!(
        "SELECT id AS user_id,
         (num_normal_games + CASE WHEN $2 THEN num_normal_speedrun_games ELSE 0 END)::bigint
         AS \"count!\"
         FROM users WHERE id=ANY($1)",
        &ids,
        include_speedruns,
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (UserId(row.user_id), row.count))
        .collect())
}

pub(crate) async fn normal_game_count(
    pool: &PgPool,
    id: UserId,
    include_speedruns: bool,
) -> Result<i64> {
    Ok(normal_game_counts(pool, &[id], include_speedruns)
        .await?
        .get(&id)
        .copied()
        .unwrap_or(0))
}

// The statistics tables have one best-score column for each player count, from `best_score2` to
// `best_score6`, and queries name those columns directly.
const _: () = assert!(
    hanabi_protocol::MIN_PLAYERS == 2 && hanabi_protocol::MAX_PLAYERS == 6,
    "The best-score columns must match the supported player counts"
);
/// The player counts that a variant has a best score for.
pub(crate) const PLAYER_COUNTS: usize =
    hanabi_protocol::MAX_PLAYERS - hanabi_protocol::MIN_PLAYERS + 1;

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
}

#[cfg(test)]
mod tests {
    use super::{UserId, normal_game_counts};
    use crate::accounts::test_support::TestDb;

    async fn game(db: &TestDb, end_condition: i16, speedrun: bool, players: &[i32]) -> i32 {
        let id = sqlx::query_scalar!(
            "INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
             deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
             detrimental_characters,seed,score,num_turns,end_condition,datetime_started,
             datetime_finished)
             VALUES('Counts',$1,0,false,NULL,NULL,$2,false,false,false,false,false,false,
             'counts-'||gen_random_uuid(),0,1,$3,NOW(),NOW()) RETURNING id",
            i16::try_from(players.len()).unwrap(),
            speedrun,
            end_condition,
        )
        .fetch_one(&db.pool)
        .await
        .unwrap();
        for (seat, player) in players.iter().enumerate() {
            sqlx::query!(
                "INSERT INTO game_participants(game_id,user_id,seat) VALUES($1,$2,$3)",
                id,
                player,
                i16::try_from(seat).unwrap(),
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
        let ids = [alice, bob, carol].map(UserId);
        let normal = normal_game_counts(&db.pool, &ids, false).await.unwrap();
        let all = normal_game_counts(&db.pool, &ids, true).await.unwrap();
        assert_eq!(
            (normal[&ids[0]], normal[&ids[1]], normal[&ids[2]]),
            (1, 2, 1)
        );
        assert_eq!((all[&ids[0]], all[&ids[1]], all[&ids[2]]), (2, 2, 1));

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
        assert_eq!((all[&ids[0]], all[&ids[1]], all.get(&ids[2])), (1, 0, None));
        db.close().await;
    }
}
