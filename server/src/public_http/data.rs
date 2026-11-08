use super::*;
use crate::archive::GameRecord;
use anyhow::Context;
use sqlx::{Postgres, QueryBuilder};

const GAME_COLUMNS: &str = "g.id,g.name,g.num_players,g.starting_player,g.variant_id,
    g.timed,g.time_base,g.time_per_turn,g.speedrun,g.card_cycle,g.deck_plays,g.empty_clues,
    g.one_extra_card,g.one_less_card,g.all_or_nothing,g.detrimental_characters,
    g.seed,g.score,g.num_turns,g.end_condition,g.datetime_started,g.datetime_finished";

#[derive(sqlx::FromRow)]
struct HistoryRow {
    #[sqlx(flatten)]
    game: GameRecord,
    started: String,
    finished: String,
    names: Vec<String>,
    seed_count: i32,
    tags: String,
}

/// The rows are built in SQL, so that counting and paging stay in one statement, and decoded into
/// their wire type.
#[derive(sqlx::FromRow)]
struct PageRow {
    total_rows: i64,
    rows: sqlx::types::Json<Vec<hanabi_protocol::PublicGameRow>>,
}

#[derive(Default)]
pub(super) struct Selection {
    pub users: Vec<i32>,
    pub seed: Option<String>,
    pub variant: Option<i64>,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub tag: Option<String>,
    pub tag_user: Option<i32>,
    pub page: Option<(i64, i64)>,
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
        let user = sqlx::query!(
            "SELECT id, username FROM users WHERE normalized_username = $1",
            normalized
        )
        .fetch_optional(&state.pool)
        .await?
        .map(|row| (row.id, row.username));
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

/// Pushes `AND g.<column> <op> <value>`, binding the column's own type: a cast column, such as
/// `g.id::bigint`, cannot use its index. A value outside the column's range matches every row or
/// none, so it is decided here instead of being sent to PostgreSQL, which would reject it.
fn push_compare(qb: &mut QueryBuilder<Postgres>, column: &str, op: &str, value: i64) {
    let in_range = if column == "id" {
        i32::try_from(value).map(|value| {
            qb.push(" AND g.").push(column).push(op).push_bind(value);
        })
    } else {
        i16::try_from(value).map(|value| {
            qb.push(" AND g.").push(column).push(op).push_bind(value);
        })
    }
    .is_ok();
    let matches_all = (op == ">=" && value < 0) || (op == "<=" && value > 0);
    if !in_range && !matches_all {
        qb.push(" AND FALSE");
    }
}

// Optional filters and sort orders are assembled per request so PostgreSQL can plan each
// combination against the large games table; a static `$n IS NULL OR ...` query would
// share one generic plan. Values are always bound, and tests cover each filter and order.
// "selected" is not materialized, so that counting and paging plan separately: a materialized
// result would copy every matching game before the page could use an index.
#[allow(clippy::disallowed_methods)]
fn selected(s: Selection) -> QueryBuilder<Postgres> {
    let mut qb = QueryBuilder::new("WITH selected AS NOT MATERIALIZED (SELECT ");
    qb.push(GAME_COLUMNS).push(" FROM games g WHERE TRUE");
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
        push_compare(&mut qb, "variant_id", "=", id);
    }
    if let Some(id) = s.start {
        push_compare(&mut qb, "id", ">=", id);
    }
    if let Some(id) = s.end {
        push_compare(&mut qb, "id", "<=", id);
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
) -> Result<hanabi_protocol::PublicGamePage> {
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
                    "Invalid numeric filter for: {}",
                    display[index as usize]
                ))
            })?;
            push_compare(&mut qb, fields[index as usize], "=", value);
        }
    }
    qb.push("), paged AS (SELECT id,num_players,score,variant_id,seed,datetime_finished FROM selected ORDER BY ").push(order)
        .push(if ascending { " ASC" } else { " DESC" }).push(", id DESC LIMIT ")
        .push_bind(size).push(" OFFSET ").push_bind(offset)
        .push(") SELECT (SELECT count(*) FROM selected) AS total_rows,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id,'num_players',g.num_players,'score',g.score,");
    if mode != "variants" {
        qb.push("'variant',g.variant_id,'other_scores',COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0),");
    }
    qb.push("'users',COALESCE((SELECT string_agg(u.username, ', ' ORDER BY lower(u.username), u.username) FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id),''),'datetime',to_char(g.datetime_finished AT TIME ZONE 'UTC','YYYY-MM-DD\" - \"HH24:MI:SS \"UTC\"'),'seed',g.seed) ORDER BY g.")
        .push(order).push(if ascending { " ASC" } else { " DESC" })
        .push(",g.id DESC) FROM paged g),'[]'::jsonb) AS rows");
    let page: PageRow = qb.build_query_as().fetch_one(&state.pool).await?;
    Ok(hanabi_protocol::PublicGamePage {
        total_rows: page.total_rows,
        info: if mode == "variants" {
            "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score)"
        } else {
            "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 2: score)"
        }
        .into(),
        rows: Some(page.rows.0),
    })
}

/// The list response for a rejected request, with the reason in place of the parameters.
pub(super) fn rejected(reason: String) -> hanabi_protocol::PublicGamePage {
    hanabi_protocol::PublicGamePage {
        total_rows: 0,
        info: reason,
        rows: None,
    }
}

/// The public history lists the lobby's `GameHistory` contract.
fn game_history(row: HistoryRow) -> anyhow::Result<hanabi_protocol::GameHistory> {
    let g = row.game;
    Ok(hanabi_protocol::GameHistory {
        id: hanabi_protocol::GameId(g.id),
        options: crate::model::wire_options(&crate::store::options_from_record(&g)?),
        seed: g.seed,
        score: i32::from(g.score),
        num_turns: i32::from(g.num_turns),
        end_condition: u8::try_from(g.end_condition).context("Invalid stored end condition")?,
        datetime_started: row.started,
        datetime_finished: row.finished,
        num_games_on_this_seed: i64::from(row.seed_count),
        player_names: row.names,
        increment_num_games: false,
        tags: row.tags,
    })
}

pub(super) async fn history(state: &PublicState, s: Selection, seed_sort: bool) -> Result<Value> {
    let tag_user = s.tag_user;
    let page = s.page;
    let mut qb = selected(s);
    qb.push(") SELECT ").push(GAME_COLUMNS);
    // Keep PostgreSQL's existing timestamp text, including fractional-second precision.
    qb.push(",to_jsonb(g.datetime_started)#>>'{}' AS started,to_jsonb(g.datetime_finished)#>>'{}' AS finished, ARRAY(SELECT u.username FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id ORDER BY lower(u.username),u.username) AS names, COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS seed_count, COALESCE((SELECT string_agg(DISTINCT tag, ', ' ORDER BY tag) FROM game_tags WHERE game_id=g.id");
    if let Some(user) = tag_user {
        qb.push(" AND user_id=").push_bind(user);
    }
    qb.push("),'') AS tags FROM selected g ORDER BY ");
    qb.push(if seed_sort {
        "g.score DESC,g.datetime_finished ASC,g.id ASC"
    } else {
        "g.datetime_finished DESC,g.id DESC"
    });
    if let Some((size, offset)) = page {
        qb.push(" LIMIT ")
            .push_bind(size)
            .push(" OFFSET ")
            .push_bind(offset);
    }
    let result = qb
        .build_query_as::<HistoryRow>()
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(game_history)
        .collect::<anyhow::Result<Vec<_>>>()?;
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
