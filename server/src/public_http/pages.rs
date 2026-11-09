use super::{
    API_PREFIX, Error, HashMap, HeaderMap, IntoResponse, Json, Params, Path, PublicState, Query,
    RawQuery, Response, Result, State, Value, catalog, data, encoded, integer, json, replay,
    strict_query,
};
use axum::response::{Html, Redirect};
use hanabi_engine::EndCondition;

/// The option that a score page names for a best score's stored modifier, if any.
fn shown_modifier(bits: i64) -> Result<Option<&'static str>> {
    Ok(crate::model::ScoreModifier::from_bits(i16::try_from(bits)?).shown())
}

pub(super) fn templates() -> minijinja::Environment<'static> {
    let mut env = minijinja::Environment::new();
    env.add_filter("urlencode", |s: String| encoded(&s));
    env.add_filter("possessive", |s: String| possessive(&s));
    env.add_filter("history_date", |s: String| {
        chrono::DateTime::parse_from_rfc3339(&s)
            .map(|date| {
                date.with_timezone(&chrono::Utc)
                    .format("%Y-%m-%d — %H:%M:%S UTC")
                    .to_string()
            })
            .map_err(|error| {
                minijinja::Error::new(minijinja::ErrorKind::InvalidOperation, error.to_string())
            })
    });
    for (name, source) in [
        ("layout.html", include_str!("../../templates/layout.html")),
        ("logo.html", include_str!("../../templates/logo.html")),
        ("main.html", include_str!("../../templates/main.html")),
        (
            "missing-scores.html",
            include_str!("../../templates/missing-scores.html"),
        ),
        (
            "public-pager.html",
            include_str!("../../templates/public-pager.html"),
        ),
        (
            "public-table-scripts.html",
            include_str!("../../templates/public-table-scripts.html"),
        ),
        (
            "profile-buttons.html",
            include_str!("../../templates/profile-buttons.html"),
        ),
        (
            "public-page.html",
            include_str!("../../templates/public-page.html"),
        ),
    ] {
        env.add_template(name, source)
            .expect("native public template");
    }
    env
}

fn render(state: &PublicState, template: &str, mut values: Value) -> Result<Response> {
    values["projectName"] = json!("Hanab Live");
    values["version"] = json!(&*state.config.client_version);
    values["domain"] = json!(&*state.config.domain);
    values["isDev"] = json!(state.config.is_dev);
    values["useTLS"] = json!(state.config.use_tls);
    values["pagerSizes"] = json!(super::PAGER_SIZES);
    Ok(Html(
        state
            .templates
            .get_template(template)?
            .render(minijinja::value::Serde(values))?,
    )
    .into_response())
}

/// The parameters that the main page's script reads. The client keeps them in the address bar as it
/// moves between the lobby's paths, so every main-page path takes all of them.
const MAIN_PAGE_PARAMETERS: &[&str] = &[
    "dev",
    "login",
    // The table settings of a "/create-table" link.
    "allOrNothing",
    "deckPlays",
    "detrimentalCharacters",
    "emptyClues",
    "name",
    "oneExtraCard",
    "oneLessCard",
    "password",
    "speedrun",
    "timeBase",
    "timed",
    "timePerTurn",
    "variantName",
];

pub(super) async fn main_page(
    State(state): State<PublicState>,
    headers: HeaderMap,
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let q = strict_query(raw.as_deref(), MAIN_PAGE_PARAMETERS)?;
    q.flag("dev").map_err(Error::bad)?;
    q.nonempty("login").map_err(Error::bad)?;
    let user_id = headers
        .get(axum::http::header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (name, value) = cookie.trim().split_once('=')?;
                (name == crate::cookie::NAME).then_some(value)
            })
        })
        .and_then(|cookie| {
            crate::cookie::decode(
                cookie,
                &state.config.session_secret,
                chrono::Utc::now().timestamp(),
            )
            .ok()
        });
    let username = if let Some(id) = user_id {
        sqlx::query_scalar!("SELECT username FROM users WHERE id=$1", id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        None
    };
    render(
        &state,
        "main.html",
        json!({"title":"Main","authenticated":username.is_some(),"sessionUsername":username}),
    )
}

pub(super) async fn page(
    State(state): State<PublicState>,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    Path(params): Path<Params>,
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let mode = uri.path().split('/').nth(1).unwrap_or("");
    let accepted: &[&str] = match mode {
        "history" | "tags" | "seed" | "variant" | "tag" => &["api"],
        "shared-missing-scores" => &[
            "excludePlayers",
            "excludeVariants",
            "minEfficiency",
            "maxEfficiency",
        ],
        _ => &[],
    };
    let q = match strict_query(raw.as_deref(), accepted) {
        Ok(q) => q,
        // The replay export is JSON.
        Err(error) if mode == "export" => return Ok(error.json()),
        Err(error) => return Err(error),
    };
    // Redirects to the page's JSON API.
    let api_redirect = q.flag("api").map_err(Error::bad)?;
    let mut v = json!({"title":"History","page":mode,"stats":{},"games":[],"frequencies":[]});
    match mode {
        "export" => {
            return Ok(replay::export(&state, &params)
                .await
                .map_or_else(Error::json, |game| Json(game).into_response()));
        }
        "password-reset" => v["title"] = json!("Password Reset"),
        "stats" => {
            v["title"] = json!("Stats");
            v["namesTitle"] = json!("Global Statistics");
            v["stats"] = aggregate(&state, None, None).await?;
        }
        "scores" | "profile" | "history" | "tags" | "missing-scores" | "shared-missing-scores" => {
            let shared = mode == "shared-missing-scores";
            let n = params.get("numPlayers").and_then(|n| integer(n));
            if shared {
                if n.is_none() {
                    return Err(Error::bad("You must first specify the number of players."));
                }
                if !n.is_some_and(hanabi_protocol::is_player_count) {
                    return Err(Error::bad(format!(
                        "Number of players must be between {} and {}.",
                        hanabi_protocol::MIN_PLAYERS,
                        hanabi_protocol::MAX_PLAYERS
                    )));
                }
            }
            let users = data::players(&state, &params, shared || mode == "history").await?;
            v["name"] = json!(users[0].1);
            match mode {
                "scores" | "profile" => {
                    v["page"] = json!("scores");
                    v["title"] = json!("Scores");
                    let mut statistics = aggregate(&state, Some(users[0].0), None).await?;
                    let summary = score_summary(&state, users[0].0).await?;
                    statistics
                        .as_object_mut()
                        .expect("stats")
                        .extend(summary.as_object().expect("summary").clone());
                    v["stats"] = statistics;
                }
                "history" => {
                    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
                    let api = format!(
                        "{API_PREFIX}/history/{}",
                        names
                            .iter()
                            .map(|n| encoded(n))
                            .collect::<Vec<_>>()
                            .join("/")
                    );
                    if api_redirect {
                        return Ok(Redirect::permanent(&api).into_response());
                    }
                    v["apiPath"] = json!(api);
                    if names.len() > 1 {
                        v["namesTitle"] =
                            json!(format!("Game History for {}", names_title(&names)));
                    }
                }
                "tags" => {
                    if api_redirect {
                        return Ok(Redirect::permanent(&format!(
                            "{API_PREFIX}/tags/{}",
                            encoded(&users[0].1)
                        ))
                        .into_response());
                    }
                    v["title"] = json!("Tagged Games");
                    v["page"] = json!("tagged");
                    v["games"] = json!(data::tagged(&state, &params, false).await?);
                }
                _ => {
                    return missing(
                        &state,
                        users,
                        shared,
                        n.filter(|n| hanabi_protocol::is_player_count(*n)),
                        &q,
                    )
                    .await;
                }
            }
        }
        "seed" => {
            let seed = params
                .get("seed")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::not_found("You must specify a seed."))?;
            let api = format!("{API_PREFIX}/seed/{}", encoded(seed));
            if api_redirect {
                return Ok(Redirect::permanent(&api).into_response());
            }
            v["namesTitle"] = json!(format!("seed: {seed}"));
            v["apiPath"] = json!(api);
            let rows = sqlx::query_scalar!("SELECT jsonb_build_object('score',score,'numTimes',count(*)) AS \"value!\" FROM games WHERE seed=$1 GROUP BY score ORDER BY score", seed)
                .fetch_all(&state.pool)
                .await?
                .into_iter()
                .map(serde_json::from_value)
                .collect::<serde_json::Result<Vec<hanabi_protocol::ScoreFrequency>>>()?;
            v["scoreFreqsJSON"] = json!(serde_json::to_string(&rows)?);
            v["frequencies"] = json!(rows);
        }
        "variant" => {
            let raw = params
                .get("id")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::not_found("You must specify a variant ID."))?;
            let id = integer(raw).ok_or_else(|| Error::bad("The variant ID must be a number."))?;
            let variant = catalog::variant(id)
                .ok_or_else(|| Error::not_found("That variant does not exist."))?;
            let api = format!("{API_PREFIX}/variants/{id}");
            if api_redirect {
                return Ok(Redirect::permanent(&api).into_response());
            }
            v["title"] = json!("Variant Stats");
            v["namesTitle"] = json!(format!("Global Statistics for {}", variant.name));
            v["apiPath"] = json!(api);
            let mut statistics = aggregate(&state, None, Some(id)).await?;
            let row = sqlx::query_as!(
                crate::database::VariantStats,
                "SELECT variant_id,num_games,best_score2,best_score3,best_score4,best_score5,best_score6,
                 num_max_scores FROM variant_stats WHERE variant_id::bigint=$1",
                id
            )
            .fetch_optional(&state.pool)
            .await?
            .map(serde_json::to_value)
            .transpose()?;
            let row = row.unwrap_or(json!({}));
            let games = number(&row, "num_games");
            statistics["numMaxScores"] = json!(number(&row, "num_max_scores"));
            statistics["maxScoreRate"] = json!(percentage(number(&row, "num_max_scores"), games));
            statistics["bestScores"] = json!(
                (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
                    .map(|p| number(&row, &format!("best_score{p}")))
                    .collect::<Vec<_>>()
            );
            statistics["maxScore"] = json!(variant.max_score);
            v["stats"] = statistics;
        }
        "tag" => {
            let raw = params
                .get("tag")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::not_found("You must specify a tag."))?;
            let tag = data::sanitize_tag(raw)?;
            if api_redirect {
                return Ok(
                    Redirect::permanent(&format!("{API_PREFIX}/tag/{}", encoded(&tag)))
                        .into_response(),
                );
            }
            v["page"] = json!("tagged");
            v["namesTitle"] = json!(format!("Games With a Tag of: {tag}"));
            v["games"] = json!(data::tagged(&state, &params, true).await?);
        }
        _ => return Err(Error::not_found("Not found.")),
    }
    render(&state, "public-page.html", v)
}

fn number(v: &Value, key: &str) -> i64 {
    v[key].as_i64().unwrap_or(0)
}
/// Converts a count to a float for display; counts are far below the 2^53 that floats hold exactly.
#[expect(clippy::cast_precision_loss, reason = "counts are far below 2^53")]
fn float(n: i64) -> f64 {
    n as f64
}
/// The decimal places that a percentage is shown with.
const PERCENTAGE_DECIMALS: usize = 1;
fn percentage(n: i64, total: i64) -> String {
    let s = format!(
        "{:.PERCENTAGE_DECIMALS$}",
        if total == 0 {
            0.0
        } else {
            float(n) * 100.0 / float(total)
        }
    );
    match s.split_once('.') {
        Some((whole, fraction)) if fraction.bytes().all(|b| b == b'0') => whole.to_owned(),
        _ => s,
    }
}
fn duration(seconds: i64) -> String {
    match u64::try_from(seconds) {
        Ok(0) | Err(_) => "-".into(),
        Ok(seconds) => crate::lifecycle::duration(seconds),
    }
}
pub(super) fn possessive(name: &str) -> String {
    if name.ends_with(['s', 'S']) {
        format!("{name}'")
    } else {
        format!("{name}'s")
    }
}

fn names_title(names: &[String]) -> String {
    if names.len() == 1 {
        return names[0].clone();
    }
    format!(
        "{} and {}",
        names[..names.len() - 1].join(", "),
        names.last().expect("names")
    )
}

pub(super) type SiteTotals = HashMap<Option<i64>, (std::time::Instant, Value)>;

// Site-wide totals scan the whole games table on a pool with only two connections, so compute
// them at most once per period and make concurrent visitors share the result.
const SITE_TOTALS_LIFETIME: std::time::Duration = if cfg!(test) {
    std::time::Duration::ZERO
} else {
    std::time::Duration::from_mins(5)
};
/// How long a site-wide statistics scan may run, longer than the lobby pool's usual limit.
const AGGREGATE_STATEMENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

async fn aggregate(state: &PublicState, user: Option<i32>, variant: Option<i64>) -> Result<Value> {
    if user.is_some() {
        return compute_aggregate(state, user, variant).await;
    }
    let mut totals = state.site_totals.lock().await;
    if let Some((computed, statistics)) = totals.get(&variant)
        && computed.elapsed() < SITE_TOTALS_LIFETIME
    {
        return Ok(statistics.clone());
    }
    let statistics = compute_aggregate(state, None, variant).await?;
    totals.insert(variant, (std::time::Instant::now(), statistics.clone()));
    Ok(statistics)
}

async fn compute_aggregate(
    state: &PublicState,
    user: Option<i32>,
    variant: Option<i64>,
) -> Result<Value> {
    let mut transaction = state.pool.begin().await?;
    sqlx::query_scalar!(
        "SELECT set_config('statement_timeout',$1,true)",
        AGGREGATE_STATEMENT_TIMEOUT.as_millis().to_string()
    )
    .fetch_one(&mut *transaction)
    .await?;
    let normal_end = EndCondition::Normal as i16;
    // Each case has its own query: a shared `$1 IS NULL OR ...` query gets a generic plan that
    // cannot use an index. The variant is compared as the column's own SMALLINT, because a cast
    // column cannot use its index either. A player's totals start from their own games.
    // Site-wide time counts every player's time, so it is multiplied by the number of players.
    macro_rules! game_totals {
        ($filter:literal $(, $argument:expr)*) => {{
            let row = sqlx::query!(
                "SELECT count(*) FILTER(WHERE NOT speedrun AND end_condition=$1) AS \"normal!\",
                count(*) FILTER(WHERE NOT speedrun AND end_condition<>$1) AS \"other!\",
                count(*) FILTER(WHERE speedrun) AS \"speed!\",
                COALESCE(sum(extract(epoch FROM datetime_finished-datetime_started) * num_players)
                  FILTER(WHERE NOT speedrun),0)::bigint AS \"duration!\",
                COALESCE(sum(extract(epoch FROM datetime_finished-datetime_started) * num_players)
                  FILTER(WHERE speedrun),0)::bigint AS \"speed_duration!\"
                FROM games" + $filter,
                normal_end $(, $argument)*
            )
            .fetch_one(&mut *transaction)
            .await?;
            (row.normal, row.other, row.speed, row.duration, row.speed_duration)
        }};
    }
    let (normal, other, speed, played, speed_played) = match (user, variant) {
        (Some(user), None) => {
            let row = sqlx::query!(
                "SELECT count(*) FILTER(WHERE NOT g.speedrun AND g.end_condition=$1) AS \"normal!\",
                count(*) FILTER(WHERE NOT g.speedrun AND g.end_condition<>$1) AS \"other!\",
                count(*) FILTER(WHERE g.speedrun) AS \"speed!\",
                COALESCE(sum(extract(epoch FROM g.datetime_finished-g.datetime_started))
                  FILTER(WHERE NOT g.speedrun),0)::bigint AS \"duration!\",
                COALESCE(sum(extract(epoch FROM g.datetime_finished-g.datetime_started))
                  FILTER(WHERE g.speedrun),0)::bigint AS \"speed_duration!\"
                FROM game_participants p JOIN games g ON g.id=p.game_id WHERE p.user_id=$2",
                normal_end,
                user
            )
            .fetch_one(&mut *transaction)
            .await?;
            (
                row.normal,
                row.other,
                row.speed,
                row.duration,
                row.speed_duration,
            )
        }
        (None, Some(variant)) => {
            let variant = i16::try_from(variant)
                .map_err(|_| anyhow::anyhow!("Variant ID {variant} is outside the stored range"))?;
            game_totals!(" WHERE variant_id=$2", variant)
        }
        (None, None) => game_totals!(""),
        (Some(_), Some(_)) => {
            return Err(
                anyhow::anyhow!("Per-player statistics are not filtered by variant").into(),
            );
        }
    };
    transaction.commit().await?;
    let mut statistics = json!({"numGamesNormal":normal,"numGamesOther":other,"numGamesTotal":normal+other,
        "numGamesSpeedrun":speed,"timePlayed":duration(played),
        "timePlayedSpeedrun":duration(speed_played)});
    if let Some(user) = user {
        use chrono::Datelike;
        let date: chrono::DateTime<chrono::Utc> =
            sqlx::query_scalar!("SELECT datetime_created FROM users WHERE id=$1", user)
                .fetch_one(&state.pool)
                .await?;
        let suffix = match date.day() {
            1 | 21 | 31 => "st",
            2 | 22 => "nd",
            3 | 23 => "rd",
            _ => "th",
        };
        statistics["dateJoined"] = json!(format!(
            "{} {}{}, {}",
            date.format("%B"),
            date.day(),
            suffix,
            date.year()
        ));
    }
    Ok(statistics)
}

async fn user_stats(state: &PublicState, id: i32) -> Result<HashMap<i64, Value>> {
    let rows = sqlx::query_as!(
        crate::database::UserStats,
        "SELECT user_id,variant_id,num_games,best_score2,best_score2_mod,best_score3,best_score3_mod,
         best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,best_score6_mod
         FROM user_stats WHERE user_id=$1",
        id
    )
    .fetch_all(&state.pool)
    .await?;
    rows.into_iter()
        .map(|row| Ok((i64::from(row.variant_id), serde_json::to_value(row)?)))
        .collect()
}
/// The decimal places that a missing score's clue efficiency is shown and filtered with.
const EFFICIENCY_DECIMALS: usize = 2;
/// The clue efficiency from which a missing score is shown as hard.
const HARD_EFFICIENCY: f64 = 1.33;
/// The clue efficiency from which a missing score is shown as very hard.
const VERY_HARD_EFFICIENCY: f64 = 1.5;

async fn score_summary(state: &PublicState, id: i32) -> Result<Value> {
    let statistics = user_stats(state, id).await?;
    let mut totals = [0; crate::database::PLAYER_COUNTS];
    let mut rows = Vec::new();
    for variant in catalog::variants() {
        let row = statistics
            .get(&i64::from(variant.id))
            .cloned()
            .unwrap_or(json!({}));
        let max = i64::from(variant.max_score);
        let mut best = Vec::new();
        for p in hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS {
            let score = number(&row, &format!("best_score{p}"));
            if score == max {
                totals[p - hanabi_protocol::MIN_PLAYERS] += 1;
            }
            let modifier = number(&row, &format!("best_score{p}_mod"));
            best.push(json!({"score":score,"modifierName":shown_modifier(modifier)?}));
        }
        let games = number(&row, "num_games");
        rows.push(
            json!({"id":variant.id,"name":variant.name,"maxScore":max,"numGames":games,
            "bestScores":best}),
        );
    }
    let total: i64 = totals.iter().sum();
    let variants = i64::try_from(catalog::variants().len())?;
    Ok(
        json!({"rows":rows,"total":total,"percentage":percentage(total,variants*i64::try_from(crate::database::PLAYER_COUNTS)?),
        "perType":totals.iter().map(|t| json!({"total":t,"percentage":percentage(*t,variants)})).collect::<Vec<_>>()}),
    )
}

async fn missing(
    state: &PublicState,
    users: Vec<(i32, String)>,
    shared: bool,
    num_players: Option<i64>,
    q: &Query,
) -> Result<Response> {
    if shared && users.len() < hanabi_protocol::MIN_PLAYERS {
        return Err(Error::not_found(format!(
            "You must specify at least {} players.",
            hanabi_protocol::MIN_PLAYERS
        )));
    }
    // Only the shared page takes these parameters, so they are absent from the others.
    let terms = |key| -> Result<Vec<String>> {
        Ok(q.nonempty(key)
            .map_err(Error::bad)?
            .unwrap_or("")
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(crate::accounts::normalize_string)
            .collect())
    };
    let excluded_players = terms("excludePlayers")?;
    let excluded_variants = terms("excludeVariants")?;
    let mut bounds = [None, None];
    for (i, key) in ["minEfficiency", "maxEfficiency"].iter().enumerate() {
        if let Some(s) = q.nonempty(key).map_err(Error::bad)?.map(str::trim) {
            bounds[i] = s.parse::<f64>().ok().filter(|n| n.is_finite());
            if bounds[i].is_none() {
                return Err(Error::bad(format!(
                    "The {} efficiency must be a number.",
                    if i == 0 { "minimum" } else { "maximum" }
                )));
            }
        }
    }
    let players: Vec<Value> = users.iter().map(|u| json!({"name":u.1,"excluded":excluded_players.contains(&crate::accounts::normalize_string(&u.1))})).collect();
    let mut statistics = Vec::new();
    for (index, user) in users.iter().enumerate() {
        if players[index]["excluded"] == false {
            statistics.push(user_stats(state, user.0).await?);
        }
    }
    if statistics.is_empty() {
        return Err(Error::bad("You can not exclude every player."));
    }
    let counts = num_players.map_or_else(
        || {
            (hanabi_protocol::MIN_PLAYERS..=hanabi_protocol::MAX_PLAYERS)
                .filter_map(|p| i64::try_from(p).ok())
                .collect::<Vec<_>>()
        },
        |p| vec![p],
    );
    let mut rows = Vec::new();
    for p in counts {
        for variant in catalog::variants() {
            let name = variant.name.as_str();
            if excluded_variants
                .iter()
                .any(|term| crate::accounts::normalize_string(name).contains(term))
            {
                continue;
            }
            let id = i64::from(variant.id);
            let max = i64::from(variant.max_score);
            let mut best = (0, 0);
            for (index, s) in statistics.iter().enumerate() {
                if let Some(row) = s.get(&id) {
                    let score = (
                        number(row, &format!("best_score{p}")),
                        number(row, &format!("best_score{p}_mod")),
                    );
                    if index == 0 || score.0 > best.0 || score.0 == best.0 && score.1 < best.1 {
                        best = score;
                    }
                }
            }
            if best == (max, 0) {
                continue;
            }
            let cards = i64::try_from((state.config.deck_size)(i32::try_from(id)?)?)?;
            let hand = i64::try_from(hanabi_engine::normal_hand_size(usize::try_from(p)?))?;
            let stacks = i64::try_from(variant.suits.len())?;
            let multiplier = i64::from(hanabi_engine::clue_cost_for(variant));
            let finished = if variant.throw_it_in_a_hole {
                0
            } else {
                stacks - p / i64::from(variant.stack_size) - 1
            };
            let clues = (i64::from(hanabi_protocol::MAX_CLUES) * multiplier + finished + cards
                - (hand - 1) * p
                - max)
                / multiplier;
            let efficiency = float(max) / float(clues);
            // Filter on the value that is shown, so the bounds match what the user reads.
            let shown = format!("{efficiency:.EFFICIENCY_DECIMALS$}");
            let rounded: f64 = shown.parse()?;
            if bounds[0].is_some_and(|min| rounded < min)
                || bounds[1].is_some_and(|max| rounded > max)
            {
                continue;
            }
            rows.push(json!({"name":name,"numPlayers":p,"score":best.0,"maxScore":max,"modifierName":shown_modifier(best.1)?,
                "efficiency":shown,"efficiencyClass":if efficiency<HARD_EFFICIENCY {"normal"}else if efficiency<VERY_HARD_EFFICIENCY {"hard"}else{"very-hard"}}));
        }
    }
    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
    let mut v = json!({"title":"Missing Scores","name":users[0].1,
        "namesTitle":if shared {format!("Missing Scores for {}",names_title(&names))}else{format!("{} Profile",possessive(&users[0].1))},
        "singleMissingScores":!shared,"requestedNumPlayers":num_players.unwrap_or(0),
        "players":players,"rows":rows,"advancedFiltersActive":!excluded_players.is_empty()||!excluded_variants.is_empty()||bounds.iter().any(Option::is_some),
        "excludeVariants":q.get("excludeVariants").unwrap_or(""),
        "minEfficiency":q.get("minEfficiency").unwrap_or(""),"maxEfficiency":q.get("maxEfficiency").unwrap_or("")});
    if !shared {
        v["summary"] = score_summary(state, users[0].0).await?;
    }
    render(state, "missing-scores.html", v)
}
