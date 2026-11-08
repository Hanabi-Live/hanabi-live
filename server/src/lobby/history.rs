use anyhow::{Context, Result};
use serde_json::Value;
use sqlx::PgPool;
use std::{collections::HashMap, sync::LazyLock};

static VARIANTS: LazyLock<HashMap<i64, String>> = LazyLock::new(|| {
    let variants: Vec<Value> = serde_json::from_str(include_str!(
        "../../../packages/game/src/json/variants.json"
    ))
    .unwrap();
    variants
        .iter()
        .map(|v| {
            (
                v["id"].as_i64().unwrap(),
                v["name"].as_str().unwrap().to_owned(),
            )
        })
        .collect()
});

pub async fn history_ids(pool: &PgPool, id: i32, offset: i64, amount: i64) -> Result<Vec<i32>> {
    // A player is in one game at a time, so their game IDs follow the order their games finished.
    // Paging by ID reads only the requested entries from the (user_id, game_id) index, instead of
    // loading every game the player has finished to sort them by finish time.
    Ok(sqlx::query_scalar!(
        "SELECT game_id FROM game_participants WHERE user_id=$1
         ORDER BY game_id DESC LIMIT NULLIF($2::bigint,0) OFFSET $3",
        id,
        amount,
        if amount == 0 { 0 } else { offset }
    )
    .fetch_all(pool)
    .await?)
}

struct HistoryRow {
    id: i32,
    num_players: i16,
    variant_id: i16,
    timed: bool,
    time_base: i32,
    time_per_turn: i32,
    speedrun: bool,
    card_cycle: bool,
    deck_plays: bool,
    empty_clues: bool,
    one_extra_card: bool,
    one_less_card: bool,
    all_or_nothing: bool,
    detrimental_characters: bool,
    seed: String,
    score: i16,
    num_turns: i16,
    end_condition: i16,
    datetime_started: chrono::DateTime<chrono::Utc>,
    datetime_finished: chrono::DateTime<chrono::Utc>,
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
        "SELECT g.id,g.num_players,g.variant_id,g.timed,g.time_base,g.time_per_turn,g.speedrun,
            g.card_cycle,g.deck_plays,g.empty_clues,g.one_extra_card,g.one_less_card,
            g.all_or_nothing,g.detrimental_characters,g.seed,g.score,g.num_turns,g.end_condition,
            g.datetime_started,g.datetime_finished,
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
    // Dates keep the offset form PostgreSQL's JSON used, such as "2023-12-29T18:21:43.81+00:00".
    let time = |time: chrono::DateTime<chrono::Utc>| {
        time.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, false)
    };
    let mut result = Vec::new();
    for row in rows {
        result.push(hanabi_protocol::GameHistory {
            id: hanabi_protocol::GameId(row.id),
            options: hanabi_protocol::GameOptions {
                num_players: u8::try_from(row.num_players)
                    .context("Invalid stored player count")?,
                variant_name: VARIANTS
                    .get(&i64::from(row.variant_id))
                    .map_or_else(|| "Unknown".into(), Clone::clone),
                variant_id: Some(u32::try_from(row.variant_id).context("Invalid stored variant")?),
                timed: row.timed,
                time_base: f64::from(row.time_base),
                time_per_turn: i64::from(row.time_per_turn),
                speedrun: row.speedrun,
                card_cycle: row.card_cycle,
                deck_plays: row.deck_plays,
                empty_clues: row.empty_clues,
                one_extra_card: row.one_extra_card,
                one_less_card: row.one_less_card,
                all_or_nothing: row.all_or_nothing,
                detrimental_characters: row.detrimental_characters,
                ..hanabi_protocol::GameOptions::default()
            },
            seed: row.seed,
            score: i32::from(row.score),
            num_turns: i32::from(row.num_turns),
            end_condition: u8::try_from(row.end_condition)
                .context("Invalid stored end condition")?,
            datetime_started: time(row.datetime_started),
            datetime_finished: time(row.datetime_finished),
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
pub async fn blocked_seeds(pool: &PgPool, user_ids: &[i32], prefix: &str) -> Result<Vec<String>> {
    // Resolve linked accounts into one list first: an `OR ... IN (subquery)` condition prevents
    // the participant index from being used and scans every game.
    Ok(sqlx::query_scalar!(
        "SELECT DISTINCT g.seed FROM games g JOIN game_participants p ON p.game_id=g.id
         WHERE p.user_id=ANY($1::integer[] ||
           ARRAY(SELECT linked_id FROM user_linkages WHERE user_id=ANY($1)))
         AND starts_with(g.seed, $2)",
        user_ids,
        prefix
    )
    .fetch_all(pool)
    .await?)
}
