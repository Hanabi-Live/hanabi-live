//! Players' and variants' derived statistics.

use crate::{
    model::{Player, Snapshot},
    store::{LockSpace, advisory_lock},
};
use anyhow::Result;
use sqlx::PgPool;

/// A pregame player with their statistics on `variant`.
pub(crate) async fn player(pool: &PgPool, id: i32, name: String, variant: u32) -> Result<Player> {
    let count = crate::database::normal_game_count(pool, id, false).await?;
    let row = sqlx::query_as!(
        crate::database::UserStats,
        "SELECT user_id,variant_id,num_games,best_score2,best_score2_mod,best_score3,best_score3_mod,
         best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,best_score6_mod
         FROM user_stats WHERE user_id=$1 AND variant_id=$2",
        id,
        i16::try_from(variant)?
    )
    .fetch_optional(pool)
    .await?;
    Ok(Player {
        id,
        name,
        stats: player_stats(count, row.as_ref()),
    })
}

/// Updates the seed, player, and variant statistics with a finished game.
pub(crate) async fn refresh(pool: &PgPool, s: &Snapshot) -> Result<()> {
    let variant = hanabi_engine::get_variant(&s.game.options.variant_name)?;
    let v = i16::try_from(variant.id)?;
    let players = i32::try_from(s.players.len())?;
    let mut tx = pool.begin().await?;
    advisory_lock(&mut tx, LockSpace::VariantStats, i32::from(v)).await?;
    sqlx::query!("INSERT INTO seeds(seed,num_games) VALUES($1,(SELECT count(*) FROM games WHERE seed=$1)) ON CONFLICT(seed) DO UPDATE SET num_games=excluded.num_games", &s.seed).execute(&mut *tx).await?;
    sqlx::query!(
        "INSERT INTO variant_stats(variant_id) VALUES($1) ON CONFLICT DO NOTHING",
        v
    )
    .execute(&mut *tx)
    .await?;
    let modifier = crate::model::ScoreModifier::of(&s.game.options);
    for p in &s.players {
        sqlx::query!(
            "INSERT INTO user_stats(user_id,variant_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            p.id,
            v
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "UPDATE user_stats SET best_score2=CASE WHEN $5=2 THEN GREATEST(best_score2,$3) ELSE best_score2 END,best_score2_mod=CASE WHEN $5=2 AND ($3>best_score2 OR ($3=best_score2 AND $4<best_score2_mod)) THEN $4 ELSE best_score2_mod END,
             best_score3=CASE WHEN $5=3 THEN GREATEST(best_score3,$3) ELSE best_score3 END,best_score3_mod=CASE WHEN $5=3 AND ($3>best_score3 OR ($3=best_score3 AND $4<best_score3_mod)) THEN $4 ELSE best_score3_mod END,
             best_score4=CASE WHEN $5=4 THEN GREATEST(best_score4,$3) ELSE best_score4 END,best_score4_mod=CASE WHEN $5=4 AND ($3>best_score4 OR ($3=best_score4 AND $4<best_score4_mod)) THEN $4 ELSE best_score4_mod END,
             best_score5=CASE WHEN $5=5 THEN GREATEST(best_score5,$3) ELSE best_score5 END,best_score5_mod=CASE WHEN $5=5 AND ($3>best_score5 OR ($3=best_score5 AND $4<best_score5_mod)) THEN $4 ELSE best_score5_mod END,
             best_score6=CASE WHEN $5=6 THEN GREATEST(best_score6,$3) ELSE best_score6 END,best_score6_mod=CASE WHEN $5=6 AND ($3>best_score6 OR ($3=best_score6 AND $4<best_score6_mod)) THEN $4 ELSE best_score6_mod END,
             num_games=s.n
             FROM (SELECT count(*)::integer n FROM games g
             JOIN game_participants p ON p.game_id=g.id
             WHERE p.user_id=$1 AND g.variant_id=$2 AND NOT g.speedrun) s
             WHERE user_id=$1 AND variant_id=$2",
            p.id,
            v,
            i16::try_from(s.game.score)?,
            modifier.bits(),
            players,
        )
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query!(
        "UPDATE variant_stats SET best_score2=CASE WHEN $5=2 AND $4 THEN GREATEST(best_score2,$2) ELSE best_score2 END,
         best_score3=CASE WHEN $5=3 AND $4 THEN GREATEST(best_score3,$2) ELSE best_score3 END,
         best_score4=CASE WHEN $5=4 AND $4 THEN GREATEST(best_score4,$2) ELSE best_score4 END,
         best_score5=CASE WHEN $5=5 AND $4 THEN GREATEST(best_score5,$2) ELSE best_score5 END,
         best_score6=CASE WHEN $5=6 AND $4 THEN GREATEST(best_score6,$2) ELSE best_score6 END,
         num_games=s.n,num_max_scores=s.maximum
         FROM (SELECT count(*)::integer n,(count(*) FILTER(WHERE score=$3))::integer maximum
         FROM games WHERE variant_id=$1 AND NOT speedrun) s
         WHERE variant_id=$1",
        v,
        i16::try_from(s.game.score)?,
        i16::try_from(variant.max_score)?,
        modifier == crate::model::ScoreModifier::default(),
        players,
    )
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

/// A pregame player's statistics as their table's checkpoint stores them: all of their games, and
/// their games and best scores on the table's variant, from `user_stats` if they have played it.
fn player_stats(
    num_games: i64,
    row: Option<&crate::database::UserStats>,
) -> hanabi_protocol::PregameStats {
    let (variant_games, best_scores) =
        row.map_or((0, [(0, 0); crate::database::PLAYER_COUNTS]), |row| {
            (
                i64::from(row.num_games),
                [
                    (row.best_score2, row.best_score2_mod),
                    (row.best_score3, row.best_score3_mod),
                    (row.best_score4, row.best_score4_mod),
                    (row.best_score5, row.best_score5_mod),
                    (row.best_score6, row.best_score6_mod),
                ],
            )
        });
    hanabi_protocol::PregameStats {
        num_games,
        variant: hanabi_protocol::PregameVariantStats {
            num_games: variant_games,
            best_scores: (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
                .zip(best_scores)
                .map(|(num_players, (score, modifier))| {
                    crate::model::ScoreModifier::from_bits(modifier)
                        .best_score(crate::model::small(num_players), i32::from(score))
                })
                .collect(),
        },
    }
}
pub fn zero_stats() -> hanabi_protocol::PregameStats {
    player_stats(0, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn pregame_statistics_keep_their_stored_format() {
        let unplayed = |n: usize| {
            json!({"numPlayers":n,"score":0,"modifier":0,"deckPlays":false,"emptyClues":false,
                "oneExtraCard":false,"oneLessCard":false,"allOrNothing":false})
        };
        let best_scores: Vec<Value> = (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
            .map(unplayed)
            .collect();
        assert_eq!(
            serde_json::to_value(zero_stats()).unwrap(),
            json!({"numGames":0,"variant":{"numGames":0,"bestScores":best_scores}})
        );

        let row = crate::database::UserStats {
            user_id: 1,
            variant_id: 0,
            num_games: 7,
            best_score2: 25,
            best_score2_mod: 0,
            best_score3: 24,
            best_score3_mod: 2 + 8,
            best_score4: 0,
            best_score4_mod: 0,
            best_score5: 0,
            best_score5_mod: 0,
            best_score6: 30,
            best_score6_mod: 16,
        };
        let stats = serde_json::to_value(player_stats(12, Some(&row))).unwrap();
        hanabi_protocol::validate::<hanabi_protocol::PregameStats>(&stats).unwrap();
        assert_eq!(stats["numGames"], 12);
        assert_eq!(stats["variant"]["numGames"], 7);
        let best = &stats["variant"]["bestScores"];
        assert_eq!(best[0]["score"], 25);
        assert_eq!(
            best[1],
            json!({"numPlayers":3,"score":24,"modifier":10,"deckPlays":false,"emptyClues":true,
                "oneExtraCard":false,"oneLessCard":true,"allOrNothing":false})
        );
        assert_eq!(best[4]["numPlayers"], 6);
        assert_eq!(best[4]["allOrNothing"], true);
    }
}
