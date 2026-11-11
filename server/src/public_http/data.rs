use super::{
    HttpError, PAGE_PARAMETERS, Params, PublicState, Query, Result, catalog, integer, pagination,
};
use crate::archive::GameRecord;
use anyhow::Context;
use hanabi_protocol::GameListColumn as Column;
use sqlx::{Postgres, QueryBuilder};

const GAME_COLUMNS: &str = "g.id,g.name,g.num_players,g.variant_id,
    g.time_base,g.time_per_turn,g.speedrun,g.deck_plays,g.empty_clues,
    g.one_extra_card,g.one_less_card,g.all_or_nothing,g.detrimental_characters,
    g.seed,g.score,g.num_turns,g.end_condition,g.datetime_started,g.datetime_finished";

const SORTABLE_COLUMNS: &[Column] = &[Column::Id, Column::NumPlayers, Column::Score];

const fn column_field(column: Column) -> &'static str {
    match column {
        Column::Id => "id",
        Column::NumPlayers => "num_players",
        Column::Score => "score",
        Column::Variant => "variant_id",
    }
}

/// The columns that a game list filters by.
const fn filterable_columns(mode: &str) -> &'static [Column] {
    match mode.as_bytes() {
        b"history" => Column::ALL,
        b"variants" => SORTABLE_COLUMNS,
        _ => &[Column::Id, Column::Score],
    }
}

/// The query parameters that a game list takes: paging, `sort` with a column's name, `order` with
/// `asc` or `desc`, and `filter[name]` with a column's value.
pub(super) fn list_parameters(mode: &str) -> Vec<String> {
    PAGE_PARAMETERS
        .into_iter()
        .chain(["sort", "order"])
        .map(str::to_owned)
        .chain(
            filterable_columns(mode)
                .iter()
                .map(|&c| format!("filter[{}]", c.name())),
        )
        .collect()
}

/// The order of a player's history: the most recently finished game first.
pub(super) const FINISHED_ORDER: &str = "g.datetime_finished DESC,g.id DESC";

/// The order of the games on a seed: the best score first, and the earliest of equal scores.
pub(super) const SEED_ORDER: &str = "g.score DESC,g.datetime_finished ASC,g.id ASC";

#[derive(sqlx::FromRow)]
struct HistoryRow {
    #[sqlx(flatten)]
    game: GameRecord,
    names: Vec<String>,
    seed_count: i32,
    tags: Vec<String>,
}

#[derive(Clone, Default)]
pub(super) struct Selection {
    pub users: Vec<i32>,
    pub seed: Option<String>,
    pub variant: Option<i64>,
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub tag: Option<String>,
    pub tag_user: Option<i32>,
    /// Each column's required value.
    pub filters: Vec<(&'static str, i64)>,
    pub page: Option<(i64, i64)>,
}

pub(super) async fn players(
    state: &PublicState,
    params: &Params,
    multiple: bool,
) -> Result<Vec<(i32, String)>> {
    let mut users = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for i in 1..=if multiple {
        hanabi_protocol::MAX_PLAYERS
    } else {
        1
    } {
        let Some(name) = params.get(&format!("player{i}")).filter(|n| !n.is_empty()) else {
            if i == 1 {
                return Err(HttpError::not_found("You must specify a player."));
            }
            break;
        };
        let normalized = crate::accounts::normalize_string(name);
        if !seen.insert(normalized.clone()) {
            return Err(HttpError::not_found(
                "You can not specify the same player twice.",
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
            HttpError::not_found(if multiple {
                format!("The player of \"{name}\" does not exist in the database.")
            } else {
                "That player does not exist in the database.".into()
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
                .collect();
        }
        "variants" => {
            let raw = p
                .get("id")
                .filter(|v| !v.is_empty())
                .ok_or_else(|| HttpError::not_found("You must specify a variant ID."))?;
            let id =
                integer(raw).ok_or_else(|| HttpError::bad("The variant ID must be a number."))?;
            if catalog::variant(id).is_none() {
                return Err(HttpError::not_found("That variant does not exist."));
            }
            s.variant = Some(id);
        }
        _ => {
            s.seed = p.get("seed").filter(|v| !v.is_empty()).cloned();
            if s.seed.is_none() {
                return Err(HttpError::not_found("You must specify a seed."));
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
#[expect(
    clippy::disallowed_methods,
    reason = "the filters and sort order are composed at run time"
)]
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
    for (column, value) in s.filters {
        push_compare(&mut qb, column, "=", value);
    }
    qb
}

pub(super) async fn list(
    state: &PublicState,
    mut s: Selection,
    q: &Query,
    mode: &str,
) -> Result<hanabi_protocol::GamePage> {
    let (limit, offset) = pagination(q)?.unwrap_or((super::DEFAULT_PAGE_SIZE, 0));
    s.page = Some((limit, offset));
    let column = match q.get("sort") {
        None if mode == "history" => Column::Id,
        None => Column::Score,
        Some(name) => Column::from_name(name)
            .filter(|column| SORTABLE_COLUMNS.contains(column))
            .ok_or_else(|| {
                HttpError::bad(format!(
                    "Sort by one of: {}.",
                    SORTABLE_COLUMNS
                        .iter()
                        .map(|c| c.name())
                        .collect::<Vec<_>>()
                        .join(", ")
                ))
            })?,
    };
    let direction = match q.get("order") {
        None | Some("desc") => "DESC",
        Some("asc") => "ASC",
        Some(_) => return Err(HttpError::bad("The order must be asc or desc.")),
    };
    let mut filters = Vec::new();
    for column in filterable_columns(mode) {
        if let Some(value) = q.get(&format!("filter[{}]", column.name())) {
            let value = integer(value).ok_or_else(|| {
                HttpError::bad(format!("Invalid numeric filter for: {}", column.name()))
            })?;
            filters.push((column_field(*column), value));
        }
    }
    s.filters = filters;
    let mut count = selected(s.clone());
    count.push(") SELECT count(*) FROM selected");
    let total: i64 = count.build_query_scalar().fetch_one(&state.pool).await?;
    let order = format!("g.{} {direction},g.id DESC", column_field(column));
    Ok(hanabi_protocol::GamePage {
        games: history(state, s, &order).await?,
        offset: hanabi_protocol::Count(offset),
        total: hanabi_protocol::Count(total),
    })
}

/// The public history lists the lobby's `GameHistoryEntry` contract.
fn game_history(row: HistoryRow) -> anyhow::Result<hanabi_protocol::GameHistoryEntry> {
    let g = row.game;
    Ok(hanabi_protocol::GameHistoryEntry {
        game_id: hanabi_protocol::GameId(g.id),
        num_turns: g.turn_count()?,
        options: crate::model::wire_options(&crate::archive::options(&g)?),
        num_games_on_seed: g
            .seed
            .is_some()
            .then(|| hanabi_protocol::Count(i64::from(row.seed_count))),
        seed: g.seed,
        score: hanabi_protocol::Score(i32::from(g.score)),
        end_condition: hanabi_protocol::EndCondition::try_from(i32::from(g.end_condition))
            .map_err(anyhow::Error::msg)
            .context("Invalid stored end condition")?,
        started_at: hanabi_protocol::Timestamp::from(g.datetime_started),
        finished_at: hanabi_protocol::Timestamp::from(g.datetime_finished),
        player_names: row.names.into_iter().map(Into::into).collect(),
        tags: row.tags,
    })
}

/// The selected games, in `order`, which is SQL that sorts `g`.
pub(super) async fn history(
    state: &PublicState,
    s: Selection,
    order: &str,
) -> Result<Vec<hanabi_protocol::GameHistoryEntry>> {
    let tag_user = s.tag_user;
    let page = s.page;
    let mut qb = selected(s);
    qb.push(") SELECT ").push(GAME_COLUMNS);
    // Keep PostgreSQL's existing timestamp text, including fractional-second precision.
    qb.push(", ARRAY(SELECT u.username FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id ORDER BY lower(u.username),u.username) AS names, COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS seed_count, COALESCE((SELECT array_agg(DISTINCT tag ORDER BY tag) FROM game_tags WHERE game_id=g.id");
    if let Some(user) = tag_user {
        qb.push(" AND user_id=").push_bind(user);
    }
    qb.push("),'{}') AS tags FROM selected g ORDER BY ");
    qb.push(order);
    if let Some((size, offset)) = page {
        qb.push(" LIMIT ")
            .push_bind(size)
            .push(" OFFSET ")
            .push_bind(offset);
    }
    Ok(qb
        .build_query_as::<HistoryRow>()
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(game_history)
        .collect::<anyhow::Result<Vec<_>>>()?)
}

pub(super) fn sanitize_tag(value: &str) -> Result<String> {
    if value.len() > crate::model::MAX_TAG_LENGTH {
        return Err(HttpError::not_found(crate::model::tag_too_long()));
    }
    let value: String = value
        .chars()
        .map(|c| if c.is_whitespace() { ' ' } else { c })
        .collect();
    let value = value.trim_matches(' ');
    if value.is_empty() {
        return Err(HttpError::not_found("Tags cannot be blank."));
    }
    Ok(crate::accounts::normalize_string(value))
}

pub(super) async fn tagged(
    state: &PublicState,
    params: &Params,
    search: bool,
) -> Result<Vec<hanabi_protocol::GameHistoryEntry>> {
    let mut s = Selection::default();
    if search {
        let value = params
            .get("tag")
            .filter(|v| !v.is_empty())
            .ok_or_else(|| HttpError::not_found("You must specify a tag."))?;
        s.tag = Some(sanitize_tag(value)?);
    } else {
        s.tag_user = Some(players(state, params, false).await?[0].0);
    }
    history(state, s, FINISHED_ORDER).await
}
