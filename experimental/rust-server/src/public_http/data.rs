use super::*;
use sqlx::{Postgres, QueryBuilder, Row};

#[derive(Default)]
pub(super) struct Selection {
    pub users: Vec<i32>,
    pub seed: Option<String>,
    pub variant: Option<i64>,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub tag: Option<String>,
    pub tag_user: Option<i32>,
}

pub(super) async fn players(
    state: &PublicState,
    params: &Params,
    multiple: bool,
) -> Result<Vec<(i32, String)>> {
    let mut users = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for i in 1..=if multiple { 6 } else { 1 } {
        let Some(name) = params.get(&format!("player{i}")).filter(|n| !n.is_empty()) else {
            if i == 1 {
                return Err(Error::not_found("Error: You must specify a player."));
            }
            break;
        };
        let normalized = crate::accounts::normalize_string(name);
        if !seen.insert(normalized.clone()) {
            return Err(Error::not_found(
                "Error: You can not specify the same player twice.",
            ));
        }
        let user: Option<(i32, String)> =
            sqlx::query_as("SELECT id, username FROM users WHERE normalized_username = $1")
                .bind(normalized)
                .fetch_optional(&state.pool)
                .await?;
        users.push(user.ok_or_else(|| {
            Error::not_found(if multiple {
                format!("Error: The player of \"{name}\" does not exist in the database.")
            } else {
                "Error: That player does not exist in the database.".into()
            })
        })?);
    }
    Ok(users)
}

pub(super) async fn selection(state: &PublicState, p: &Params, mode: &str) -> Result<Selection> {
    let mut s = Selection::default();
    match mode {
        "history" => {
            s.users = players(state, p, true)
                .await?
                .into_iter()
                .map(|u| u.0)
                .collect()
        }
        "variants" => {
            s.variant = p
                .get("id")
                .and_then(|v| integer(v))
                .filter(|id| catalog::variant(*id).is_some());
            if s.variant.is_none() {
                return Err(Error::bad("Missing valid variant ID"));
            }
        }
        _ => {
            s.seed = p.get("seed").filter(|v| !v.is_empty()).cloned();
            if s.seed.is_none() {
                return Err(Error::bad("Missing seed"));
            }
        }
    }
    Ok(s)
}

fn selected(s: Selection) -> QueryBuilder<Postgres> {
    let mut qb = QueryBuilder::new("WITH selected AS (SELECT g.* FROM games g WHERE TRUE");
    for id in s.users {
        qb.push(
            " AND EXISTS (SELECT 1 FROM game_participants gp WHERE gp.game_id=g.id AND gp.user_id=",
        )
        .push_bind(id)
        .push(")");
    }
    if let Some(seed) = s.seed {
        qb.push(" AND g.seed=").push_bind(seed);
    }
    if let Some(id) = s.variant {
        qb.push(" AND g.variant_id::bigint=").push_bind(id);
    }
    if let Some(id) = s.start {
        qb.push(" AND g.id::bigint>=").push_bind(id);
    }
    if let Some(id) = s.end {
        qb.push(" AND g.id::bigint<=").push_bind(id);
    }
    if let Some(tag) = s.tag {
        qb.push(" AND EXISTS(SELECT 1 FROM game_tags gt WHERE gt.game_id=g.id AND gt.tag=")
            .push_bind(tag)
            .push(")");
    }
    if let Some(user) = s.tag_user {
        qb.push(" AND EXISTS(SELECT 1 FROM game_tags gt WHERE gt.game_id=g.id AND gt.user_id=")
            .push_bind(user)
            .push(")");
    }
    qb
}

pub(super) async fn list(
    state: &PublicState,
    s: Selection,
    q: &Query,
    mode: &str,
) -> Result<Value> {
    let size = first(q, "size")
        .and_then(integer)
        .filter(|n| (0..=100).contains(n))
        .unwrap_or(10);
    let page = first(q, "page").and_then(integer).unwrap_or(0).max(0);
    let offset = page
        .checked_mul(size)
        .filter(|v| *v <= 9_007_199_254_740_991)
        .ok_or_else(|| Error::bad("Pagination offset is too large."))?;
    let fields = ["id", "num_players", "score", "variant_id"];
    let display = ["id", "numPlayers", "score", "variantID"];
    let mut order = if mode == "history" { "id" } else { "score" };
    let mut ascending = false;
    let mut sorted = false;
    let mut seen = std::collections::HashSet::new();
    let mut qb = selected(s);
    for (key, value) in q {
        if !seen.insert(key) {
            continue;
        }
        if let Some(index) = key
            .strip_prefix("col[")
            .and_then(|k| k.strip_suffix(']'))
            .and_then(integer)
            && (0..3).contains(&index)
            && !sorted
        {
            order = fields[index as usize];
            ascending = value == "0";
            sorted = true;
        }
        if let Some(index) = key
            .strip_prefix("fcol[")
            .and_then(|k| k.strip_suffix(']'))
            .and_then(integer)
            && (0..if mode == "history" { 4 } else { 3 }).contains(&index)
            && !(mode == "seed" && index == 1)
            && !value.is_empty()
        {
            let value = integer(value).ok_or_else(|| {
                Error::bad(format!(
                    "Invalid numeric filter for {}.",
                    display[index as usize]
                ))
            })?;
            qb.push(" AND g.")
                .push(fields[index as usize])
                .push("::bigint=")
                .push_bind(value);
        }
    }
    qb.push("), paged AS (SELECT * FROM selected ORDER BY ").push(order)
        .push(if ascending { " ASC" } else { " DESC" }).push(", id DESC LIMIT ")
        .push_bind(size).push(" OFFSET ").push_bind(offset)
        .push(") SELECT jsonb_build_object('total_rows',(SELECT count(*) FROM selected),'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'num_players',g.num_players,'score',g.score,");
    if mode != "variants" {
        qb.push("'variant',g.variant_id,'other_scores',COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0),");
    }
    qb.push("'users',COALESCE((SELECT string_agg(u.username, ', ' ORDER BY lower(u.username), u.username) FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id),''),'datetime',to_char(g.datetime_finished AT TIME ZONE 'UTC','YYYY-MM-DD\" - \"HH24:MI:SS \"UTC\"'),'seed',g.seed) ORDER BY g.")
        .push(order).push(if ascending { " ASC" } else { " DESC" })
        .push(",g.id DESC) FROM paged g),'[]'::jsonb))");
    let mut result: Value = qb.build_query_scalar().fetch_one(&state.pool).await?;
    result["info"] = json!(if mode == "variants" {
        "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score)"
    } else {
        "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 2: score)"
    });
    Ok(result)
}

pub(super) fn options(g: &Value) -> Result<Value> {
    let variant = catalog::variant(
        g["variant_id"]
            .as_i64()
            .ok_or_else(|| anyhow::anyhow!("Missing variant"))?,
    )
    .ok_or_else(|| anyhow::anyhow!("Unknown historical variant"))?;
    let mut options = json!({"variantID":g["variant_id"],"variantName":variant["name"]});
    for (db, wire) in OPTION_FIELDS {
        options[wire] = g[db].clone();
    }
    Ok(options)
}
pub(super) const OPTION_FIELDS: [(&str, &str); 13] = [
    ("num_players", "numPlayers"),
    ("timed", "timed"),
    ("time_base", "timeBase"),
    ("time_per_turn", "timePerTurn"),
    ("speedrun", "speedrun"),
    ("card_cycle", "cardCycle"),
    ("deck_plays", "deckPlays"),
    ("empty_clues", "emptyClues"),
    ("one_extra_card", "oneExtraCard"),
    ("one_less_card", "oneLessCard"),
    ("all_or_nothing", "allOrNothing"),
    ("detrimental_characters", "detrimentalCharacters"),
    ("starting_player", "startingPlayer"),
];

pub(super) async fn history(state: &PublicState, s: Selection, seed_sort: bool) -> Result<Value> {
    let tag_user = s.tag_user;
    let mut qb = selected(s);
    qb.push(") SELECT to_jsonb(g) AS game, ARRAY(SELECT u.username FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id ORDER BY lower(u.username),u.username) AS names, COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS seed_count, COALESCE((SELECT string_agg(DISTINCT tag, ', ' ORDER BY tag) FROM game_tags WHERE game_id=g.id");
    if let Some(user) = tag_user {
        qb.push(" AND user_id=").push_bind(user);
    }
    qb.push("),'') AS tags FROM selected g ORDER BY ");
    qb.push(if seed_sort {
        "g.score DESC,g.datetime_finished ASC,g.id ASC"
    } else {
        "g.datetime_finished DESC,g.id DESC"
    });
    let mut result = Vec::new();
    for row in qb.build().fetch_all(&state.pool).await? {
        let g: Value = row.try_get("game")?;
        let options = options(&g)?;
        result.push(json!({
            "id":g["id"],"options":options,"seed":g["seed"],"score":g["score"],
            "numTurns":g["num_turns"],"endCondition":g["end_condition"],
            "datetimeStarted":g["datetime_started"],"datetimeFinished":g["datetime_finished"],
            "numGamesOnThisSeed":row.try_get::<i32,_>("seed_count")?,
            "playerNames":row.try_get::<Vec<String>,_>("names")?,
            "tags":row.try_get::<String,_>("tags")?,"incrementNumGames":false
        }));
    }
    Ok(json!(result))
}

pub(super) fn sanitize_tag(value: &str) -> Result<String> {
    if value.len() > 100 {
        return Err(Error::not_found(
            "Tags cannot be longer than 100 characters.",
        ));
    }
    let value: String = value
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .collect();
    let value = value.trim_matches(' ');
    if value.is_empty() {
        return Err(Error::not_found("Tags cannot be blank."));
    }
    Ok(crate::accounts::normalize_string(value))
}

pub(super) async fn tagged(state: &PublicState, params: &Params, search: bool) -> Result<Value> {
    let mut s = Selection::default();
    if search {
        let value = params
            .get("tag")
            .filter(|v| !v.is_empty())
            .ok_or_else(|| Error::not_found("Error: You must specify a tag."))?;
        s.tag = Some(sanitize_tag(value)?);
    } else {
        s.tag_user = Some(players(state, params, false).await?[0].0);
    }
    history(state, s, false).await
}
