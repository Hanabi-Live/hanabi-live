//! Players' derived statistics.

use crate::{
    model::{Player, Snapshot},
    store::{LockSpace, advisory_lock},
    transport::Identity,
};
use anyhow::{Context, Result};
use hanabi_protocol::{PregameStats, UserId};
use sqlx::PgPool;
use std::collections::BTreeMap;

/// A pregame player with their statistics on `variant`.
pub(crate) async fn player(pool: &PgPool, identity: &Identity, variant: u32) -> Result<Player> {
    Ok(Player {
        id: Some(identity.user),
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
    let ids = players.iter().filter_map(|p| p.id).collect::<Vec<_>>();
    let mut stats = pregame_stats_of(pool, &ids, variant).await?;
    for player in players {
        player.stats = player
            .id
            .and_then(|id| stats.remove(&id))
            .unwrap_or_else(zero_stats);
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
    let raw_ids = ids.iter().map(|id| id.get()).collect::<Vec<_>>();
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
    .map(|row| Ok((UserId::try_from(row.user_id)?, row)))
    .collect::<Result<BTreeMap<_, _>>>()?;
    ids.iter()
        .map(|id| {
            let count = counts.get(id).copied().unwrap_or(0);
            Ok((*id, player_stats(count, rows.get(id))?))
        })
        .collect()
}

/// Updates the seed count and the best scores with a finished game. Running it again for the same
/// game changes nothing. The game counts are updated when the game is saved (`archive::insert`).
pub(crate) async fn refresh(pool: &PgPool, s: &Snapshot) -> Result<()> {
    let variant = hanabi_engine::get_variant(&s.game.options.variant_name)?;
    let v = i16::try_from(variant.id)?;
    let players = i32::try_from(s.players.len())?;
    let mut tx = pool.begin().await?;
    advisory_lock(&mut tx, LockSpace::VariantStats, i32::from(v)).await?;
    let seed = s.seed.as_ref().context("A saved game has a seed")?;
    sqlx::query!("INSERT INTO seeds(seed,num_games) VALUES($1,(SELECT count(*) FROM games WHERE seed=$1)) ON CONFLICT(seed) DO UPDATE SET num_games=excluded.num_games", seed).execute(&mut *tx).await?;
    let modifier = crate::model::ScoreModifier::of(&s.game.options);
    // Rows are locked in the same order as when the game is saved: players by ID.
    let mut users = s
        .players
        .iter()
        .map(|p| p.user().map(UserId::get))
        .collect::<Result<Vec<_>>>()?;
    users.sort_unstable();
    for user in users {
        sqlx::query!(
            "INSERT INTO user_stats(user_id,variant_id,best_score2,best_score2_mod,best_score3,
             best_score3_mod,best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,
             best_score6_mod) VALUES($1,$2,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
             ON CONFLICT DO NOTHING",
            user,
            v
        )
        .execute(&mut *tx)
        .await?;
        sqlx::query!(
            "UPDATE user_stats SET best_score2=CASE WHEN $5=2 THEN GREATEST(best_score2,$3) ELSE best_score2 END,best_score2_mod=CASE WHEN $5=2 AND (best_score2 IS NULL OR $3>best_score2 OR ($3=best_score2 AND $4<best_score2_mod)) THEN $4 ELSE best_score2_mod END,
             best_score3=CASE WHEN $5=3 THEN GREATEST(best_score3,$3) ELSE best_score3 END,best_score3_mod=CASE WHEN $5=3 AND (best_score3 IS NULL OR $3>best_score3 OR ($3=best_score3 AND $4<best_score3_mod)) THEN $4 ELSE best_score3_mod END,
             best_score4=CASE WHEN $5=4 THEN GREATEST(best_score4,$3) ELSE best_score4 END,best_score4_mod=CASE WHEN $5=4 AND (best_score4 IS NULL OR $3>best_score4 OR ($3=best_score4 AND $4<best_score4_mod)) THEN $4 ELSE best_score4_mod END,
             best_score5=CASE WHEN $5=5 THEN GREATEST(best_score5,$3) ELSE best_score5 END,best_score5_mod=CASE WHEN $5=5 AND (best_score5 IS NULL OR $3>best_score5 OR ($3=best_score5 AND $4<best_score5_mod)) THEN $4 ELSE best_score5_mod END,
             best_score6=CASE WHEN $5=6 THEN GREATEST(best_score6,$3) ELSE best_score6 END,best_score6_mod=CASE WHEN $5=6 AND (best_score6 IS NULL OR $3>best_score6 OR ($3=best_score6 AND $4<best_score6_mod)) THEN $4 ELSE best_score6_mod END
             WHERE user_id=$1 AND variant_id=$2",
            user,
            v,
            i16::try_from(s.game.score)?,
            modifier.bits(),
            players,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// A pregame player's statistics as their table's checkpoint stores them: all of their games, and
/// their games and best scores on the table's variant, from `user_stats` if they have played it.
fn player_stats(num_games: i64, row: Option<&crate::database::UserStats>) -> Result<PregameStats> {
    let (variant_games, best_scores) = row
        .map_or((0, [None; crate::database::PLAYER_COUNTS]), |row| {
            (i64::from(row.num_games), row.best_scores())
        });
    Ok(PregameStats {
        num_games: hanabi_protocol::Count::try_from(num_games)?,
        variant: hanabi_protocol::PregameVariantStats {
            num_games: hanabi_protocol::Count::try_from(variant_games)?,
            best_scores: (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
                .zip(best_scores)
                .filter_map(|(num_players, best)| {
                    let (score, modifier) = best?;
                    Some(hanabi_protocol::Score::try_from(score).map(|score| {
                        hanabi_protocol::PregameBestScore {
                            num_players: crate::model::num_players(num_players),
                            score,
                            modified: crate::model::ScoreModifier::from_bits(modifier).modified(),
                        }
                    }))
                })
                .collect::<Result<_, _>>()?,
        },
    })
}
pub fn zero_stats() -> PregameStats {
    player_stats(0, None).expect("zero is a count")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn pregame_statistics_list_only_the_player_counts_with_a_game() {
        assert_eq!(
            serde_json::to_value(zero_stats()).unwrap(),
            json!({"numGames":0,"variant":{"numGames":0,"bestScores":[]}})
        );

        let row = crate::database::UserStats {
            user_id: 1,
            variant_id: 0,
            num_games: 7,
            best_score2: Some(25),
            best_score2_mod: Some(0),
            best_score3: Some(24),
            best_score3_mod: Some(2 + 8),
            best_score4: None,
            best_score4_mod: None,
            best_score5: Some(0),
            best_score5_mod: Some(0),
            best_score6: Some(30),
            best_score6_mod: Some(16),
        };
        let stats = serde_json::to_value(player_stats(12, Some(&row)).unwrap()).unwrap();
        hanabi_protocol::validate::<PregameStats>(&stats).unwrap();
        assert_eq!(stats["numGames"], 12);
        assert_eq!(stats["variant"]["numGames"], 7);
        assert_eq!(
            stats["variant"]["bestScores"],
            json!([
                {"numPlayers":2,"score":25,"modified":false},
                {"numPlayers":3,"score":24,"modified":true},
                {"numPlayers":5,"score":0,"modified":false},
                {"numPlayers":6,"score":30,"modified":true},
            ])
        );
    }
}
