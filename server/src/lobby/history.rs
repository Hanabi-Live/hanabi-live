use crate::archive::GameRecord;
use anyhow::Result;
use hanabi_protocol::UserId;
use sqlx::{PgPool, types::Json};

pub async fn history_ids(pool: &PgPool, id: UserId, offset: i64, amount: i64) -> Result<Vec<i32>> {
    // A player is in one game at a time, so their game IDs follow the order their games finished.
    // Paging by ID reads only the requested entries from the (user_id, game_id) index, instead of
    // loading every game the player has finished to sort them by finish time.
    Ok(sqlx::query_scalar!(
        "SELECT game_id FROM game_participants WHERE user_id=$1
         ORDER BY game_id DESC LIMIT $2 OFFSET $3",
        id.get(),
        amount,
        offset
    )
    .fetch_all(pool)
    .await?)
}

/// A page of the games on a seed: the games without rule options first, then the highest scores, then
/// the earliest games.
pub async fn seed_history_ids(
    pool: &PgPool,
    seed: &str,
    offset: i64,
    amount: i64,
) -> Result<Vec<i32>> {
    Ok(sqlx::query_scalar!(
        "SELECT id FROM games WHERE seed=$1
         ORDER BY (deck_plays OR empty_clues OR one_extra_card OR one_less_card OR all_or_nothing
             OR detrimental_characters),
           score DESC, datetime_finished, id
         LIMIT $2 OFFSET $3",
        seed,
        amount,
        offset
    )
    .fetch_all(pool)
    .await?)
}

/// The number of games on a seed.
pub async fn seed_game_count(pool: &PgPool, seed: &str) -> Result<i64> {
    Ok(sqlx::query_scalar!(
        "SELECT count(*) AS \"count!\" FROM games WHERE seed=$1",
        seed
    )
    .fetch_one(pool)
    .await?)
}

struct HistoryRow {
    game: Json<GameRecord>,
    player_names: Vec<String>,
    tags: Vec<String>,
    num_games_on_this_seed: i32,
}

/// The games with these IDs, in the same order.
pub async fn get_history(pool: &PgPool, ids: &[i32]) -> Result<Vec<hanabi_protocol::GameSummary>> {
    let rows = sqlx::query_as!(
                HistoryRow,
        "SELECT to_jsonb(g) AS \"game!: Json<GameRecord>\",
            COALESCE((SELECT array_agg(u.username ORDER BY p.seat)
                FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id),
                '{}') AS \"player_names!\",
            COALESCE((SELECT ARRAY_AGG(DISTINCT tag ORDER BY tag) FROM game_tags
                WHERE game_id=g.id),'{}') AS \"tags!\",
            COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS \"num_games_on_this_seed!\"
         FROM games g WHERE id=ANY($1) ORDER BY array_position($1, g.id)",
        ids
    )
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            row.game
                .0
                .summary(row.player_names, row.tags, row.num_games_on_this_seed)
        })
        .collect()
}

/// Seed scope is directed, exactly one hop. A→B→C must not block C's seeds for A.
/// Seeds starting with `prefix` already played by these users or the accounts they linked.
pub async fn blocked_seeds(pool: &PgPool, users: &[UserId], prefix: &str) -> Result<Vec<String>> {
    let user_ids = users.iter().map(|user| user.get()).collect::<Vec<_>>();
    // Resolve linked accounts into one list first: an `OR ... IN (subquery)` condition prevents
    // the participant index from being used and scans every game.
    Ok(sqlx::query_scalar!(
        "SELECT DISTINCT g.seed AS \"seed!\" FROM games g JOIN game_participants p ON p.game_id=g.id
         WHERE p.user_id=ANY($1::integer[] ||
           ARRAY(SELECT linked_id FROM user_linkages WHERE user_id=ANY($1)))
         AND starts_with(g.seed, $2)",
        &user_ids,
        prefix
    )
    .fetch_all(pool)
    .await?)
}
