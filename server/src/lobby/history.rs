use crate::archive::GameRecord;
use anyhow::{Context, Result};
use hanabi_protocol::UserId;
use sqlx::{PgPool, types::Json};

pub async fn history_ids(pool: &PgPool, id: UserId, offset: i64, amount: i64) -> Result<Vec<i32>> {
    // A player is in one game at a time, so their game IDs follow the order their games finished.
    // Paging by ID reads only the requested entries from the (user_id, game_id) index, instead of
    // loading every game the player has finished to sort them by finish time.
    Ok(sqlx::query_scalar!(
        "SELECT game_id FROM game_participants WHERE user_id=$1
         ORDER BY game_id DESC LIMIT NULLIF($2::bigint,0) OFFSET $3",
        id.0,
        amount,
        if amount == 0 { 0 } else { offset }
    )
    .fetch_all(pool)
    .await?)
}

struct HistoryRow {
    game: Json<GameRecord>,
    player_names: Vec<String>,
    tags: String,
    num_games_on_this_seed: i32,
}

pub async fn get_history(
    pool: &PgPool,
    ids: &[i32],
    seed_order: bool,
) -> Result<Vec<hanabi_protocol::GameHistory>> {
    macro_rules! rows {
        ($order:literal) => {
            sqlx::query_as!(
                HistoryRow,
        "SELECT to_jsonb(g) AS \"game!: Json<GameRecord>\",
            COALESCE((SELECT array_agg(u.username ORDER BY LOWER(u.username) COLLATE \"C\")
                FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id),
                '{}') AS \"player_names!\",
            COALESCE((SELECT STRING_AGG(DISTINCT tag, ', ' ORDER BY tag) FROM game_tags
                WHERE game_id=g.id),'') AS \"tags!\",
            COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS \"num_games_on_this_seed!\"
         FROM games g WHERE id=ANY($1) ORDER BY " + $order, ids
            ).fetch_all(pool).await?
        };
    }
    let rows = if seed_order {
        rows!("g.score DESC, g.datetime_finished, g.id")
    } else {
        rows!("g.datetime_finished DESC, g.id DESC")
    };
    let time = crate::model::timestamp;
    let mut result = Vec::new();
    for row in rows {
        let game = row.game.0;
        result.push(hanabi_protocol::GameHistory {
            id: hanabi_protocol::GameId(game.id),
            options: crate::model::wire_options(&crate::archive::options(&game)?),
            score: i32::from(game.score),
            num_turns: i32::from(game.num_turns),
            end_condition: hanabi_protocol::EndCondition::try_from(i32::from(game.end_condition))
                .map_err(anyhow::Error::msg)
                .context("Invalid stored end condition")?,
            datetime_started: time(game.datetime_started),
            datetime_finished: time(game.datetime_finished),
            seed: game.seed,
            num_games_on_this_seed: i64::from(row.num_games_on_this_seed),
            player_names: row.player_names,
            increment_num_games: false,
            tags: row.tags,
        });
    }
    Ok(result)
}

/// Seed scope is directed, exactly one hop. A→B→C must not block C's seeds for A.
/// Seeds starting with `prefix` already played by these users or the accounts they linked.
pub async fn blocked_seeds(pool: &PgPool, users: &[UserId], prefix: &str) -> Result<Vec<String>> {
    let user_ids = users.iter().map(|user| user.0).collect::<Vec<_>>();
    // Resolve linked accounts into one list first: an `OR ... IN (subquery)` condition prevents
    // the participant index from being used and scans every game.
    Ok(sqlx::query_scalar!(
        "SELECT DISTINCT g.seed FROM games g JOIN game_participants p ON p.game_id=g.id
         WHERE p.user_id=ANY($1::integer[] ||
           ARRAY(SELECT linked_id FROM user_linkages WHERE user_id=ANY($1)))
         AND starts_with(g.seed, $2)",
        &user_ids,
        prefix
    )
    .fetch_all(pool)
    .await?)
}
