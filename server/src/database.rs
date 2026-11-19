use anyhow::Result;
use hanabi_protocol::UserId;
use serde::Serialize;
use sqlx::PgPool;
use std::collections::BTreeMap;

/// The counts of games that ended normally, without speedruns, as pregame statistics show them.
pub(crate) async fn normal_game_counts(
    pool: &PgPool,
    ids: &[UserId],
) -> Result<BTreeMap<UserId, i64>> {
    let ids = ids.iter().map(|id| id.get()).collect::<Vec<_>>();
    let rows = sqlx::query!(
        "SELECT id AS user_id, num_normal_games::bigint AS \"count!\" FROM users WHERE id=ANY($1)",
        &ids,
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| Ok((UserId::try_from(row.user_id)?, row.count)))
        .collect()
}

/// The count of all of a player's games, however each one ended, which tests check the stored count
/// with.
#[cfg(test)]
pub(crate) async fn game_count(pool: &PgPool, id: UserId) -> Result<i64> {
    Ok(sqlx::query_scalar!(
        "SELECT num_games::bigint AS \"count!\" FROM users WHERE id=$1",
        id.get()
    )
    .fetch_optional(pool)
    .await?
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
    pub best_score2: Option<i16>,
    pub best_score2_mod: Option<i16>,
    pub best_score3: Option<i16>,
    pub best_score3_mod: Option<i16>,
    pub best_score4: Option<i16>,
    pub best_score4_mod: Option<i16>,
    pub best_score5: Option<i16>,
    pub best_score5_mod: Option<i16>,
    pub best_score6: Option<i16>,
    pub best_score6_mod: Option<i16>,
}

impl UserStats {
    /// The best score and its modifier bits for each player count, from the fewest players to the
    /// most. `None` for a player count that the user has no game at.
    pub fn best_scores(&self) -> [Option<(i16, i16)>; PLAYER_COUNTS] {
        [
            (self.best_score2, self.best_score2_mod),
            (self.best_score3, self.best_score3_mod),
            (self.best_score4, self.best_score4_mod),
            (self.best_score5, self.best_score5_mod),
            (self.best_score6, self.best_score6_mod),
        ]
        .map(|(score, modifier)| score.zip(modifier))
    }
}

#[cfg(test)]
mod tests {
    use super::{UserId, game_count, normal_game_counts};
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
               SELECT p.user_id, count(*) AS all_games,
                      count(*) FILTER (WHERE g.end_condition = 1 AND NOT g.speedrun) AS normal
               FROM game_participants p JOIN games g ON g.id = p.game_id
               GROUP BY p.user_id) c ON c.user_id = u.id
             WHERE u.num_games <> COALESCE(c.all_games, 0)
                OR u.num_normal_games <> COALESCE(c.normal, 0)) AS \"value!\""
        )
        .fetch_one(&db.pool)
        .await
        .unwrap()
    }

    async fn all_counts(db: &TestDb, ids: &[UserId]) -> Vec<i64> {
        let mut counts = vec![];
        for id in ids {
            counts.push(game_count(&db.pool, *id).await.unwrap());
        }
        counts
    }

    #[tokio::test]
    async fn game_counts_follow_saved_and_deleted_games_postgres() {
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
        let ended_early = game(&db, 4, false, &[bob]).await;
        assert!(stored_counts_match_a_recount(&db).await);
        let ids = [alice, bob, carol].map(|id| UserId::new(id).unwrap());
        let normal = normal_game_counts(&db.pool, &ids).await.unwrap();
        assert_eq!(
            (normal[&ids[0]], normal[&ids[1]], normal[&ids[2]]),
            (1, 2, 1)
        );
        // The game history counts every game, however it ended.
        assert_eq!(all_counts(&db, &ids).await, [3, 3, 1]);

        sqlx::query!("DELETE FROM games WHERE id=ANY($1)", &[shared, ended_early])
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(stored_counts_match_a_recount(&db).await);
        assert_eq!(all_counts(&db, &ids).await, [2, 1, 1]);
        // Deleting a player also deletes their games, which other players lose too.
        sqlx::query!("DELETE FROM users WHERE id=$1", carol)
            .execute(&db.pool)
            .await
            .unwrap();
        assert!(stored_counts_match_a_recount(&db).await);
        let normal = normal_game_counts(&db.pool, &ids).await.unwrap();
        assert_eq!(
            (normal[&ids[0]], normal[&ids[1]], normal.get(&ids[2])),
            (0, 0, None)
        );
        assert_eq!(all_counts(&db, &ids).await, [2, 0, 0]);
        db.close().await;
    }
}
