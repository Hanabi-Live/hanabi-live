use super::{
    HttpError, PAGE_PARAMETERS, Page, Params, PublicState, Query, Result, integer, pagination,
};
use crate::archive::GameRecord;
use hanabi_protocol::GameListColumn as Column;
use sqlx::{Postgres, QueryBuilder};

const GAME_COLUMNS: &str = "g.id,g.name,g.num_players,g.variant_id,
    g.time_base,g.time_per_turn,g.speedrun,g.deck_plays,g.empty_clues,
    g.one_extra_card,g.one_less_card,g.all_or_nothing,g.detrimental_characters,
    g.seed,g.score,g.num_turns,g.end_condition,g.datetime_started,g.datetime_finished";

const SORTABLE_COLUMNS: &[Column] = &[Column::GameId, Column::NumPlayers, Column::Score];

/// Whether a game has an option that changes its score: the options of
/// `crate::model::ScoreModifier`, which keep a score from counting as a normal one, and
/// Detrimental Characters. False sorts first.
const MODIFIED_SCORE: &str = "(g.deck_plays OR g.empty_clues OR g.one_extra_card OR g.one_less_card OR g.all_or_nothing OR g.detrimental_characters)";

const fn column_field(column: Column) -> &'static str {
    match column {
        Column::GameId => "id",
        Column::NumPlayers => "num_players",
        Column::Score => "score",
        Column::VariantId => "variant_id",
    }
}

/// The columns that a game list filters by. The games on a seed share its player count and variant.
const fn filterable_columns(mode: &str) -> &'static [Column] {
    match mode.as_bytes() {
        b"seed" => &[Column::GameId, Column::Score],
        _ => Column::ALL,
    }
}

/// The query parameters that a game list takes: paging, `sort` with a column's name, `order` with
/// `asc` or `desc`, `filter[name]` with a column's value, `filter[variant]` with part of a
/// variant's name, `filter[player]` with parts of players' names (see `TextFilter`), and `start`
/// and `end` with the lowest and highest game ID. The games on a seed share its variant.
pub(super) fn list_parameters(mode: &str) -> Vec<String> {
    let text_filters: &[&str] = if mode == "seed" {
        &[PLAYER_FILTER]
    } else {
        &[VARIANT_FILTER, PLAYER_FILTER]
    };
    PAGE_PARAMETERS
        .into_iter()
        .chain(["sort", "order", "start", "end"])
        .chain(text_filters.iter().copied())
        .map(str::to_owned)
        .chain(
            filterable_columns(mode)
                .iter()
                .map(|&c| format!("filter[{}]", c.name())),
        )
        .collect()
}

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
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub tag: Option<String>,
    pub tag_user: Option<i32>,
    /// Each column's required value.
    pub filters: Vec<(&'static str, i64)>,
    /// The variants whose names contain the text of `filter[variant]`, if it has text.
    pub variant_ids: Option<Vec<i16>>,
    /// The patterns of `filter[player]`. Each game has a player whose name matches each one.
    pub player_patterns: Vec<String>,
}

/// The query parameter that finds games by part of their variant's name, ignoring case.
const VARIANT_FILTER: &str = "filter[variant]";

/// The query parameter that finds games by parts of their players' names, ignoring case. Commas
/// separate the names, and a game must have a player for each one. A player's history leaves out
/// its own players, who are in every game.
const PLAYER_FILTER: &str = "filter[player]";

/// The text of a text filter, which is at most `MAX_GAME_SEARCH_LENGTH` characters. It is None
/// when the request does not have the filter, or when its text is blank.
fn text_filter<'a>(q: &'a Query, name: &str) -> Result<Option<&'a str>> {
    let Some(text) = q.get(name) else {
        return Ok(None);
    };
    if text.chars().count() > hanabi_protocol::MAX_GAME_SEARCH_LENGTH {
        return Err(HttpError::bad(format!(
            "The {name} filter can have at most {} characters.",
            hanabi_protocol::MAX_GAME_SEARCH_LENGTH
        )));
    }
    let text = text.trim();
    Ok((!text.is_empty()).then_some(text))
}

/// The IDs of the variants whose names contain the text, ignoring case.
fn variant_ids(text: &str) -> Vec<i16> {
    let lowercase = text.to_lowercase();
    hanabi_engine::variants()
        .iter()
        .filter(|variant| variant.name.to_lowercase().contains(&lowercase))
        .filter_map(|variant| i16::try_from(variant.id).ok())
        .collect()
}

/// A pattern for `ILIKE` that finds the names that contain the text, with the text's wildcard
/// characters escaped.
fn contains_pattern(text: &str) -> String {
    let mut pattern = String::from("%");
    for c in text.chars() {
        if matches!(c, '\\' | '%' | '_') {
            pattern.push('\\');
        }
        pattern.push(c);
    }
    pattern.push('%');
    pattern
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
                format!("No player is named \"{name}\".")
            } else {
                "That player does not exist in the database.".into()
            })
        })?);
    }
    Ok(users)
}

/// The games that a list shows: a player's history, the games on a seed, a player's tagged games,
/// or the games with a tag.
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
        "seed" => {
            s.seed = p.get("seed").filter(|v| !v.is_empty()).cloned();
            if s.seed.is_none() {
                return Err(HttpError::not_found("You must specify a seed."));
            }
        }
        "tags" => s.tag_user = Some(players(state, p, false).await?[0].0),
        _ => {
            let tag = p
                .get("tag")
                .filter(|v| !v.is_empty())
                .ok_or_else(|| HttpError::not_found("You must specify a tag."))?;
            s.tag = Some(crate::model::normalize_tag(tag).map_err(HttpError::not_found)?);
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
    for &id in &s.users {
        qb.push(
            " AND EXISTS (SELECT 1 FROM game_participants gp WHERE gp.game_id=g.id AND gp.user_id=",
        )
        .push_bind(id)
        .push(")");
    }
    if let Some(seed) = s.seed {
        qb.push(" AND g.seed=").push_bind(seed);
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
    if let Some(ids) = s.variant_ids {
        qb.push(" AND g.variant_id=ANY(").push_bind(ids).push(")");
    }
    for pattern in s.player_patterns {
        qb.push(" AND EXISTS(SELECT 1 FROM game_participants o JOIN users u ON u.id=o.user_id WHERE o.game_id=g.id AND u.username ILIKE ")
            .push_bind(pattern);
        if !s.users.is_empty() {
            qb.push(" AND o.user_id<>ALL(")
                .push_bind(s.users.clone())
                .push(")");
        }
        qb.push(")");
    }
    qb
}

pub(super) async fn list(
    state: &PublicState,
    mut s: Selection,
    q: &Query,
    mode: &str,
) -> Result<hanabi_protocol::GamePage> {
    let page = pagination(q)?;
    let column = match q.get("sort") {
        None if mode == "seed" => Column::Score,
        None => Column::GameId,
        Some(name) => Column::from_name(name)
            .filter(|column| SORTABLE_COLUMNS.contains(column))
            .ok_or_else(|| {
                HttpError::bad(format!(
                    "Sort by one of: {}",
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
    if mode != "seed" {
        s.variant_ids = text_filter(q, VARIANT_FILTER)?.map(variant_ids);
    }
    if let Some(text) = text_filter(q, PLAYER_FILTER)? {
        s.player_patterns = text
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(contains_pattern)
            .collect();
    }
    for (name, bound) in [("start", &mut s.start), ("end", &mut s.end)] {
        *bound = q
            .get(name)
            .map(|value| {
                integer(value).ok_or_else(|| {
                    HttpError::bad(format!("The {name} game ID must be an integer."))
                })
            })
            .transpose()?;
    }
    let total = count(state, s.clone()).await?;
    // A score that an option changed, such as one with an extra card, does not compare with a normal
    // one, so those games come after the others.
    let modified = if column == Column::Score {
        format!("{MODIFIED_SCORE},")
    } else {
        String::new()
    };
    let order = format!("{modified}g.{} {direction},g.id DESC", column_field(column));
    Ok(hanabi_protocol::GamePage {
        games: history(state, s, &order, page).await?,
        total,
    })
}

/// How many games the selection has.
pub(super) async fn count(state: &PublicState, s: Selection) -> Result<hanabi_protocol::Count> {
    let mut qb = selected(s);
    qb.push(") SELECT count(*) FROM selected");
    let total: i64 = qb.build_query_scalar().fetch_one(&state.pool).await?;
    Ok(hanabi_protocol::Count::try_from(total)?)
}

/// A page of the selected games, in `order`, which is SQL that sorts `g`.
async fn history(
    state: &PublicState,
    s: Selection,
    order: &str,
    page: Page,
) -> Result<Vec<hanabi_protocol::GameSummary>> {
    let tag_user = s.tag_user;
    let mut qb = selected(s);
    qb.push(") SELECT ").push(GAME_COLUMNS);
    // Keep PostgreSQL's existing timestamp text, including fractional-second precision.
    qb.push(", ARRAY(SELECT u.username FROM game_participants gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=g.id ORDER BY gp.seat) AS names, COALESCE((SELECT num_games FROM seeds WHERE seed=g.seed),0) AS seed_count, COALESCE((SELECT array_agg(DISTINCT tag ORDER BY tag) FROM game_tags WHERE game_id=g.id");
    if let Some(user) = tag_user {
        qb.push(" AND user_id=").push_bind(user);
    }
    qb.push("),'{}') AS tags FROM selected g ORDER BY ");
    qb.push(order)
        .push(" LIMIT ")
        .push_bind(page.limit)
        .push(" OFFSET ")
        .push_bind(page.offset);
    Ok(qb
        .build_query_as::<HistoryRow>()
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(|row| row.game.summary(row.names, row.tags, row.seed_count))
        .collect::<anyhow::Result<Vec<_>>>()?)
}
