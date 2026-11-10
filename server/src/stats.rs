//! Players' and variants' derived statistics.

use crate::{
    model::{Player, Snapshot},
    store::{LockSpace, advisory_lock},
    transport::Identity,
};
use anyhow::Result;
use hanabi_protocol::{PregameStats, UserId};
use sqlx::PgPool;
use std::collections::BTreeMap;

/// A pregame player with their statistics on `variant`.
pub(crate) async fn player(pool: &PgPool, identity: &Identity, variant: u32) -> Result<Player> {
    Ok(Player {
        id: identity.user,
        name: identity.name.clone(),
        bot: identity.bot,
        stats: pregame_stats(pool, identity.user, variant).await?,
    })
}

/// A player's statistics on `variant`, as pregame tables show them.
pub(crate) async fn pregame_stats(pool: &PgPool, id: UserId, variant: u32) -> Result<PregameStats> {
    Ok(pregame_stats_of(pool, &[id], variant)
        .await?
        .remove(&id)
        .unwrap_or_else(zero_stats))
}

/// Sets the statistics of each pregame player on `variant`, reading all of them at once.
pub(crate) async fn refresh_players(
    pool: &PgPool,
    players: &mut [Player],
    variant: u32,
) -> Result<()> {
    let ids = players.iter().map(|p| p.id).collect::<Vec<_>>();
    let mut stats = pregame_stats_of(pool, &ids, variant).await?;
    for player in players {
        player.stats = stats.remove(&player.id).unwrap_or_else(zero_stats);
    }
    Ok(())
}

/// The statistics on `variant` of the users in `ids`, as pregame tables show them.
pub(crate) async fn pregame_stats_of(
    pool: &PgPool,
    ids: &[UserId],
    variant: u32,
) -> Result<BTreeMap<UserId, PregameStats>> {
    let counts = crate::database::normal_game_counts(pool, ids, false).await?;
    let raw_ids = ids.iter().map(|id| id.0).collect::<Vec<_>>();
    let rows = sqlx::query_as!(
        crate::database::UserStats,
        "SELECT user_id,variant_id,num_games,best_score2,best_score2_mod,best_score3,best_score3_mod,
         best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,best_score6_mod
         FROM user_stats WHERE user_id=ANY($1) AND variant_id=$2",
        &raw_ids,
        i16::try_from(variant)?
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|row| (UserId(row.user_id), row))
    .collect::<BTreeMap<_, _>>();
    Ok(ids
        .iter()
        .map(|id| {
            let count = counts.get(id).copied().unwrap_or(0);
            (*id, player_stats(count, rows.get(id)))
        })
        .collect())
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
        "INSERT INTO variant_stats(variant_id,best_score2,best_score3,best_score4,best_score5,best_score6)
         VALUES($1,NULL,NULL,NULL,NULL,NULL) ON CONFLICT DO NOTHING",
        v
    )
    .execute(&mut *tx)
    .await?;
    let modifier = crate::model::ScoreModifier::of(&s.game.options);
    for p in &s.players {
        sqlx::query!(
            "INSERT INTO user_stats(user_id,variant_id,best_score2,best_score3,best_score4,best_score5,
             best_score6) VALUES($1,$2,NULL,NULL,NULL,NULL,NULL) ON CONFLICT DO NOTHING",
            p.id.0,
            v
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "UPDATE user_stats SET best_score2=CASE WHEN $5=2 THEN GREATEST(best_score2,$3) ELSE best_score2 END,best_score2_mod=CASE WHEN $5=2 AND (best_score2 IS NULL OR $3>best_score2 OR ($3=best_score2 AND $4<best_score2_mod)) THEN $4 ELSE best_score2_mod END,
             best_score3=CASE WHEN $5=3 THEN GREATEST(best_score3,$3) ELSE best_score3 END,best_score3_mod=CASE WHEN $5=3 AND (best_score3 IS NULL OR $3>best_score3 OR ($3=best_score3 AND $4<best_score3_mod)) THEN $4 ELSE best_score3_mod END,
             best_score4=CASE WHEN $5=4 THEN GREATEST(best_score4,$3) ELSE best_score4 END,best_score4_mod=CASE WHEN $5=4 AND (best_score4 IS NULL OR $3>best_score4 OR ($3=best_score4 AND $4<best_score4_mod)) THEN $4 ELSE best_score4_mod END,
             best_score5=CASE WHEN $5=5 THEN GREATEST(best_score5,$3) ELSE best_score5 END,best_score5_mod=CASE WHEN $5=5 AND (best_score5 IS NULL OR $3>best_score5 OR ($3=best_score5 AND $4<best_score5_mod)) THEN $4 ELSE best_score5_mod END,
             best_score6=CASE WHEN $5=6 THEN GREATEST(best_score6,$3) ELSE best_score6 END,best_score6_mod=CASE WHEN $5=6 AND (best_score6 IS NULL OR $3>best_score6 OR ($3=best_score6 AND $4<best_score6_mod)) THEN $4 ELSE best_score6_mod END,
             num_games=s.n
             FROM (SELECT count(*)::integer n FROM games g
             JOIN game_participants p ON p.game_id=g.id
             WHERE p.user_id=$1 AND g.variant_id=$2 AND NOT g.speedrun) s
             WHERE user_id=$1 AND variant_id=$2",
            p.id.0,
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
fn player_stats(num_games: i64, row: Option<&crate::database::UserStats>) -> PregameStats {
    let (variant_games, best_scores) =
        row.map_or((0, [(None, 0); crate::database::PLAYER_COUNTS]), |row| {
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
    PregameStats {
        num_games,
        variant: hanabi_protocol::PregameVariantStats {
            num_games: variant_games,
            best_scores: (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
                .zip(best_scores)
                .map(|(num_players, (score, modifier))| {
                    crate::model::ScoreModifier::from_bits(modifier)
                        .best_score(crate::model::small(num_players), score.map(i32::from))
                })
                .collect(),
        },
    }
}
pub fn zero_stats() -> PregameStats {
    player_stats(0, None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    #[test]
    fn pregame_statistics_keep_their_stored_format() {
        let unplayed = |n: usize| {
            json!({"numPlayers":n,"modifier":0,"deckPlays":false,"emptyClues":false,
                "oneExtraCard":false,"oneLessCard":false,"allOrNothing":false})
        };
        let best_scores: Vec<Value> = (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
            .map(unplayed)
            .collect();
        assert_eq!(
            serde_json::to_value(zero_stats()).unwrap(),
            json!({"numGames":0,"variant":{"numGames":0,"bestScores":best_scores}})
        );
        // Checkpoints from before November 2026 store 0 for a player count without a game.
        let mut stored = serde_json::to_value(zero_stats()).unwrap();
        stored["variant"]["bestScores"][0]["score"] = json!(0);
        let decoded: PregameStats = serde_json::from_value(stored).unwrap();
        assert_eq!(decoded.variant.best_scores[0].score, Some(0));

        let row = crate::database::UserStats {
            user_id: 1,
            variant_id: 0,
            num_games: 7,
            best_score2: Some(25),
            best_score2_mod: 0,
            best_score3: Some(24),
            best_score3_mod: 2 + 8,
            best_score4: None,
            best_score4_mod: 0,
            best_score5: Some(0),
            best_score5_mod: 0,
            best_score6: Some(30),
            best_score6_mod: 16,
        };
        let stats = serde_json::to_value(player_stats(12, Some(&row))).unwrap();
        hanabi_protocol::validate::<PregameStats>(&stats).unwrap();
        assert_eq!(stats["numGames"], 12);
        assert_eq!(stats["variant"]["numGames"], 7);
        let best = &stats["variant"]["bestScores"];
        assert_eq!(best[0]["score"], 25);
        assert_eq!(
            best[1],
            json!({"numPlayers":3,"score":24,"modifier":10,"deckPlays":false,"emptyClues":true,
                "oneExtraCard":false,"oneLessCard":true,"allOrNothing":false})
        );
        assert!(best[2].get("score").is_none());
        assert_eq!(best[3]["score"], 0);
        assert_eq!(best[4]["numPlayers"], 6);
        assert_eq!(best[4]["allOrNothing"], true);
    }
}
