use anyhow::Result;
use serde_json::{Value, json};
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
    // OFFSET 0 keeps each archive lookup dependent on the participant set. Without this boundary,
    // a generic plan can scan the entire games archive even for a user with no games.
    Ok(sqlx::query_scalar!("SELECT g.id FROM
         (SELECT DISTINCT game_id FROM game_participants WHERE user_id=$1) played
         CROSS JOIN LATERAL (SELECT id,datetime_finished FROM games WHERE id=played.game_id OFFSET 0) g
         ORDER BY g.datetime_finished DESC, g.id DESC LIMIT NULLIF($2::bigint,0) OFFSET $3",
         id, amount, if amount == 0 { 0 } else { offset })
         .fetch_all(pool).await?)
}

pub async fn get_history(pool: &PgPool, ids: &[i32], seed_order: bool) -> Result<Vec<Value>> {
    macro_rules! rows {
        ($order:literal) => {
            sqlx::query_scalar!(
        "SELECT to_jsonb(g) || jsonb_build_object(
            'playerNames', COALESCE((SELECT jsonb_agg(u.username ORDER BY LOWER(u.username) COLLATE \"C\")
                FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id), '[]'::jsonb),
            'tags', COALESCE((SELECT STRING_AGG(DISTINCT tag, ', ' ORDER BY tag) FROM game_tags WHERE game_id=g.id),''),
            'numGamesOnThisSeed', COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0)) AS \"history!\"
         FROM games g WHERE id=ANY($1) ORDER BY " + $order, ids
            ).fetch_all(pool).await?
        };
    }
    let rows = if seed_order {
        rows!("g.score DESC, g.datetime_finished, g.id")
    } else {
        rows!("g.datetime_finished DESC, g.id DESC")
    };
    let mut result = Vec::new();
    for row in rows {
        let mut options = serde_json::Map::new();
        for (wire, column) in [
            ("numPlayers", "num_players"),
            ("variantID", "variant_id"),
            ("timed", "timed"),
            ("timeBase", "time_base"),
            ("timePerTurn", "time_per_turn"),
            ("speedrun", "speedrun"),
            ("cardCycle", "card_cycle"),
            ("deckPlays", "deck_plays"),
            ("emptyClues", "empty_clues"),
            ("oneExtraCard", "one_extra_card"),
            ("oneLessCard", "one_less_card"),
            ("allOrNothing", "all_or_nothing"),
            ("detrimentalCharacters", "detrimental_characters"),
        ] {
            options.insert(wire.to_owned(), row[column].clone());
        }
        options.insert(
            "variantName".into(),
            json!(
                VARIANTS
                    .get(&row["variant_id"].as_i64().unwrap_or(-1))
                    .map(String::as_str)
                    .unwrap_or("Unknown")
            ),
        );
        result.push(json!({
            "id":row["id"], "options":options, "seed":row["seed"], "score":row["score"],
            "numTurns":row["num_turns"], "endCondition":row["end_condition"],
            "datetimeStarted":row["datetime_started"], "datetimeFinished":row["datetime_finished"],
            "numGamesOnThisSeed":row["numGamesOnThisSeed"], "playerNames":row["playerNames"],
            "tags":row["tags"], "incrementNumGames":false
        }));
    }
    Ok(result)
}

/// Seed scope is directed, exactly one hop. A→B→C must not block C's seeds for A.
pub async fn blocked_seeds(pool: &PgPool, user_ids: &[i32]) -> Result<Vec<String>> {
    Ok(sqlx::query_scalar!(
        "SELECT DISTINCT g.seed FROM games g JOIN game_participants p ON p.game_id=g.id
         WHERE p.user_id=ANY($1) OR p.user_id IN
         (SELECT linked_id FROM user_linkages WHERE user_id=ANY($1))",
        user_ids
    )
    .fetch_all(pool)
    .await?)
}
