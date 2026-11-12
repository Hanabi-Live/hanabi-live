use super::{
    API_PREFIX, HashMap, HeaderMap, HttpError, IntoResponse, Json, Params, Path, PublicState,
    Query, RawQuery, Response, Result, State, Value, catalog, data, encoded, integer, json, replay,
    strict_query,
};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use axum::response::{Html, Redirect};
use hanabi_engine::EndCondition;
use std::sync::Arc;

/// The option that a score page names for a best score's stored modifier, if any.
fn shown_modifier(bits: i16) -> Option<&'static str> {
    crate::model::ScoreModifier::from_bits(bits).shown()
}

pub(super) fn templates() -> minijinja::Environment<'static> {
    let mut env = minijinja::Environment::new();
    env.add_filter("urlencode", |s: String| encoded(&s));
    env.add_filter("possessive", |s: String| possessive(&s));
    // Game lists name a game's variant by its ID.
    env.add_filter("variant_name", |id: u32| {
        hanabi_engine::get_variant_by_id(id)
            .map(|variant| variant.name.clone())
            .map_err(|error| {
                minijinja::Error::new(minijinja::ErrorKind::InvalidOperation, error.to_string())
            })
    });
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
        (
            "theme-init.html",
            include_str!("../../templates/theme-init.html"),
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
    "timeBaseSeconds",
    "timed",
    "timePerTurnSeconds",
    "variantName",
];

pub(super) async fn main_page(
    State(state): State<PublicState>,
    headers: HeaderMap,
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let q = strict_query(raw.as_deref(), MAIN_PAGE_PARAMETERS)?;
    q.flag("dev").map_err(HttpError::bad)?;
    q.nonempty("login").map_err(HttpError::bad)?;
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
        "history" | "tags" | "seed" | "tag" => &["api"],
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
    let api_redirect = q.flag("api").map_err(HttpError::bad)?;
    let mut v = json!({"title":"History","page":mode,"stats":{},"games":[],"frequencies":[]});
    match mode {
        "export" => {
            return Ok(replay::export(&state, &params)
                .await
                .map_or_else(HttpError::json, |game| Json(game).into_response()));
        }
        "password-reset" => v["title"] = json!("Password Reset"),
        "scores" | "profile" | "history" | "tags" | "missing-scores" | "shared-missing-scores" => {
            let shared = mode == "shared-missing-scores";
            let n = params.get("numPlayers").and_then(|n| integer(n));
            if shared {
                if n.is_none() {
                    return Err(HttpError::bad(
                        "You must first specify the number of players.",
                    ));
                }
                if !n.is_some_and(hanabi_protocol::is_player_count) {
                    return Err(HttpError::bad(format!(
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
                    let mut statistics = player_statistics(&state, users[0].0).await?;
                    let mut summary = score_summary(&state, users[0].0).await?;
                    statistics["rows"] = summary["rows"].take();
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
                .ok_or_else(|| HttpError::not_found("You must specify a seed."))?;
            let api = format!("{API_PREFIX}/seed/{}", encoded(seed));
            if api_redirect {
                return Ok(Redirect::permanent(&api).into_response());
            }
            v["namesTitle"] = json!(format!("seed: {seed}"));
            v["apiPath"] = json!(api);
            let rows = sqlx::query_scalar!("SELECT jsonb_build_object('score',score,'numGames',count(*)) AS \"value!\" FROM games WHERE seed=$1 GROUP BY score ORDER BY score", seed)
                .fetch_all(&state.pool)
                .await?
                .into_iter()
                .map(serde_json::from_value)
                .collect::<serde_json::Result<Vec<hanabi_protocol::ScoreFrequency>>>()?;
            v["scoreFreqsJson"] = json!(serde_json::to_string(&rows)?);
            v["stats"] = seed_stats(&state, seed, &rows).await?;
            v["frequencies"] = json!(rows);
        }
        "tag" => {
            let raw = params
                .get("tag")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| HttpError::not_found("You must specify a tag."))?;
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
        _ => return Err(HttpError::not_found("Not found.")),
    }
    render(&state, "public-page.html", v)
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

/// How long the server keeps the average scores of seeds that share a prefix.
const SEED_AVERAGES_LIFETIME: std::time::Duration = if cfg!(test) {
    std::time::Duration::ZERO
} else {
    std::time::Duration::from_mins(5)
};
/// How long a statistics scan may run, longer than the lobby pool's usual limit.
const AGGREGATE_STATEMENT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

/// A transaction for a statistics scan, which may run for up to `AGGREGATE_STATEMENT_TIMEOUT`.
async fn scan(state: &PublicState) -> Result<sqlx::Transaction<'static, sqlx::Postgres>> {
    let mut transaction = state.pool.begin().await?;
    sqlx::query_scalar!(
        "SELECT set_config('statement_timeout',$1,true)",
        AGGREGATE_STATEMENT_TIMEOUT.as_millis().to_string()
    )
    .fetch_one(&mut *transaction)
    .await?;
    Ok(transaction)
}

/// A player's game counts, time played, and the date they joined.
async fn player_statistics(state: &PublicState, user: i32) -> Result<Value> {
    use chrono::Datelike;
    let mut transaction = scan(state).await?;
    let normal_end = crate::archive::end_condition_to_db(EndCondition::Normal);
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
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
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
    Ok(
        json!({"numGamesNormal":row.normal,"numGamesOther":row.other,
        "numGamesTotal":row.normal+row.other,"numGamesSpeedrun":row.speed,
        "timePlayed":duration(row.duration),"timePlayedSpeedrun":duration(row.speed_duration),
        "dateJoined":format!("{} {}{}, {}", date.format("%B"), date.day(), suffix, date.year())}),
    )
}

/// The average scores of the seeds that share a prefix (such as "p2v0s"), sorted from lowest.
pub(super) type SeedAverages = HashMap<String, (std::time::Instant, Arc<[f64]>)>;

/// The statistics of a seed's games, and how hard the seed is compared to the other seeds of its
/// variant, player count, and hand size.
async fn seed_stats(
    state: &PublicState,
    seed: &str,
    frequencies: &[hanabi_protocol::ScoreFrequency],
) -> Result<Value> {
    let games: i64 = frequencies.iter().map(|row| row.num_games.0).sum();
    let Some(game) = sqlx::query!(
        "SELECT variant_id,num_players FROM games WHERE seed=$1 LIMIT 1",
        seed
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(json!({}));
    };
    let Some(variant) = catalog::variant(i64::from(game.variant_id)) else {
        return Ok(json!({}));
    };
    let total: i64 = frequencies
        .iter()
        .map(|row| i64::from(row.score.0) * row.num_games.0)
        .sum();
    let average = float(total) / float(games);
    let max_scores: i64 = frequencies
        .iter()
        .filter(|row| i64::from(row.score.0) == i64::from(variant.max_score))
        .map(|row| row.num_games.0)
        .sum();
    let mut statistics = json!({
        "numGames": games,
        "numMaxScores": max_scores,
        "maxScoreRate": percentage(max_scores, games),
        "averageScore": format!("{average:.AVERAGE_SCORE_DECIMALS$}"),
        "maxScore": variant.max_score,
    });
    let Some(prefix) = regex!(crate::game::SEED_PATTERN)
        .captures(seed)
        .map(|captures| captures[1].to_owned())
    else {
        return Ok(statistics);
    };
    let averages = seed_averages(state, prefix, game.variant_id, game.num_players).await?;
    let lower = averages.partition_point(|other| *other < average);
    let not_higher = averages.partition_point(|other| *other <= average);
    let higher = averages.len() - not_higher;
    // One of the seeds with the same average is normally this seed.
    let ties = (not_higher - lower).saturating_sub(1);
    let others = i64::try_from(lower + ties + higher)?;
    if others > 0 {
        // A seed is harder than each seed with a higher average and half as hard as each tie, as
        // in duplicate bridge's match points.
        statistics["difficulty"] = json!({
            "percentile": format!(
                "{:.0}",
                float(2 * i64::try_from(higher)? + i64::try_from(ties)?) * 50.0 / float(others)
            ),
            "numSeeds": others,
            "numPlayers": game.num_players,
            "variantName": variant.name,
        });
    }
    Ok(statistics)
}
/// The decimal places that a seed's average score is shown with.
const AVERAGE_SCORE_DECIMALS: usize = 1;

/// The sorted average scores of the seeds with a prefix. A large variant has thousands of seeds,
/// so the averages are shared for `SEED_AVERAGES_LIFETIME`.
async fn seed_averages(
    state: &PublicState,
    prefix: String,
    variant: i16,
    num_players: i16,
) -> Result<Arc<[f64]>> {
    let mut cache = state.seed_averages.lock().await;
    if let Some((computed, averages)) = cache.get(&prefix)
        && computed.elapsed() < SEED_AVERAGES_LIFETIME
    {
        return Ok(averages.clone());
    }
    let mut transaction = scan(state).await?;
    // Dividing the integer sums as floats gives the same value as dividing them in Rust.
    let averages: Arc<[f64]> = sqlx::query_scalar!(
        "SELECT sum(score)::float8/count(*) AS \"average!\" FROM games
         WHERE variant_id=$1 AND num_players=$2 AND seed LIKE $3 GROUP BY seed ORDER BY 1",
        variant,
        num_players,
        format!("{prefix}%"),
    )
    .fetch_all(&mut *transaction)
    .await
    .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?
    .into();
    transaction.commit().await?;
    cache.insert(prefix, (std::time::Instant::now(), averages.clone()));
    Ok(averages)
}

/// A user's statistics, by variant ID.
async fn user_stats(
    state: &PublicState,
    id: i32,
) -> Result<HashMap<i64, crate::database::UserStats>> {
    let rows = sqlx::query_as!(
        crate::database::UserStats,
        "SELECT user_id,variant_id,num_games,best_score2,best_score2_mod,best_score3,best_score3_mod,
         best_score4,best_score4_mod,best_score5,best_score5_mod,best_score6,best_score6_mod
         FROM user_stats WHERE user_id=$1",
        id
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| (i64::from(row.variant_id), row))
        .collect())
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
        let row = statistics.get(&i64::from(variant.id));
        let max = i64::from(variant.max_score);
        let mut best = Vec::new();
        let best_scores = row.map_or(
            [None; crate::database::PLAYER_COUNTS],
            crate::database::UserStats::best_scores,
        );
        for (total, score) in totals.iter_mut().zip(best_scores) {
            if score.is_some_and(|(score, _)| i64::from(score) == max) {
                *total += 1;
            }
            best.push(json!({
                "score": score.map(|(score, _)| score),
                "modifierName": score.and_then(|(_, modifier)| shown_modifier(modifier)),
            }));
        }
        // A variant without a row has no games.
        let games = row.map_or(0, |row| i64::from(row.num_games));
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
        return Err(HttpError::not_found(format!(
            "You must specify at least {} players.",
            hanabi_protocol::MIN_PLAYERS
        )));
    }
    // Only the shared page takes these parameters, so they are absent from the others.
    let terms = |key| -> Result<Vec<String>> {
        Ok(q.nonempty(key)
            .map_err(HttpError::bad)?
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
        if let Some(s) = q.nonempty(key).map_err(HttpError::bad)?.map(str::trim) {
            bounds[i] = s.parse::<f64>().ok().filter(|n| n.is_finite());
            if bounds[i].is_none() {
                return Err(HttpError::bad(format!(
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
        return Err(HttpError::bad("You can not exclude every player."));
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
            let seat_count = usize::try_from(p)? - hanabi_protocol::MIN_PLAYERS;
            // The highest score among the users, with the fewest options that make it easier.
            let mut best: Option<(i16, i16)> = None;
            for score in statistics
                .iter()
                .filter_map(|s| s.get(&id)?.best_scores()[seat_count])
            {
                if best
                    .is_none_or(|best| score.0 > best.0 || (score.0 == best.0 && score.1 < best.1))
                {
                    best = Some(score);
                }
            }
            if best.is_some_and(|(score, modifier)| i64::from(score) == max && modifier == 0) {
                continue;
            }
            let cards = i64::try_from(hanabi_engine::create_deck(variant).len())?;
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
            rows.push(json!({"name":name,"numPlayers":p,"score":best.map(|(score, _)| score),"maxScore":max,"modifierName":best.and_then(|(_, modifier)| shown_modifier(modifier)),
                "efficiency":shown,"efficiencyClass":if efficiency<HARD_EFFICIENCY {"normal"}else if efficiency<VERY_HARD_EFFICIENCY {"hard"}else{"very-hard"}}));
        }
    }
    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
    let mut v = json!({"title":"Missing Scores","name":users[0].1,
        "namesTitle":if shared {format!("Missing Scores for {}",names_title(&names))}else{format!("{} Profile",possessive(&users[0].1))},
        "singleMissingScores":!shared,"requestedNumPlayers":num_players,
        "players":players,"rows":rows,"advancedFiltersActive":!excluded_players.is_empty()||!excluded_variants.is_empty()||bounds.iter().any(Option::is_some),
        "excludeVariants":q.get("excludeVariants").unwrap_or(""),
        "minEfficiency":q.get("minEfficiency").unwrap_or(""),"maxEfficiency":q.get("maxEfficiency").unwrap_or("")});
    if !shared {
        v["summary"] = score_summary(state, users[0].0).await?;
    }
    render(state, "missing-scores.html", v)
}
