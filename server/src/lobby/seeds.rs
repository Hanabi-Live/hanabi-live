use anyhow::Result;
use hanabi_protocol::UserId;
use sqlx::PgPool;

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
