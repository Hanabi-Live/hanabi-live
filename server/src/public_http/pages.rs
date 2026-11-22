use super::{
    AGGREGATE_STATEMENT_TIMEOUT, API_PREFIX, HashMap, HttpError, IntoResponse, Json, Params, Path,
    PublicState, Query, RawQuery, Response, Result, State, Value, catalog, data, encoded, integer,
    json, replay, scan, strict_query,
};
use crate::errors::StatementLimit;
use anyhow::Context as _;
use axum::response::{Html, Redirect};
use hanabi_engine::EndCondition;
use hanabi_protocol::{
    Count, Difficulty, MaxScoreCount, MaxScoreSummary, MissingScore, MissingScoresFilters,
    MissingScoresPlayer, NumPlayers, PlayerScores, PlayerStatistics, PublicGameList,
    PublicPageTable, Score, ScoreModifierOption, SeedDifficulty, SeedStatistics, VariantId,
};
use std::sync::Arc;

/// The option that a score page names for a best score's stored modifier, if any.
fn shown_modifier(bits: i16) -> Option<ScoreModifierOption> {
    crate::model::ScoreModifier::from_bits(bits).shown()
}

/// Gives a page the data of its table, which the page's script draws.
fn set_table(values: &mut Value, table: &PublicPageTable) -> Result<()> {
    values["table"] = json!(serde_json::to_string(table)?);
    Ok(())
}

pub(super) fn templates() -> minijinja::Environment<'static> {
    let mut env = minijinja::Environment::new();
    env.add_filter("urlencode", |s: String| encoded(&s));
    env.add_filter("possessive", |s: String| possessive(&s));
    for (name, source) in [
        ("layout.html", include_str!("../../templates/layout.html")),
        ("logo.html", include_str!("../../templates/logo.html")),
        ("main.html", include_str!("../../templates/main.html")),
        (
            "missing-scores.html",
            include_str!("../../templates/missing-scores.html"),
        ),
        (
            "public-page-scripts.html",
            include_str!("../../templates/public-page-scripts.html"),
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
        (
            "vite-dev.html",
            include_str!("../../templates/vite-dev.html"),
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
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let q = strict_query(raw.as_deref(), MAIN_PAGE_PARAMETERS)?;
    q.flag("dev").map_err(HttpError::bad)?;
    q.nonempty("login").map_err(HttpError::bad)?;
    render(&state, "main.html", json!({"title":"Main"}))
}

pub(super) async fn page(
    State(state): State<PublicState>,
    axum::extract::OriginalUri(uri): axum::extract::OriginalUri,
    Path(params): Path<Params>,
    RawQuery(raw): RawQuery,
) -> Result<Response> {
    let mode = uri.path().split('/').nth(1).unwrap_or("");
    let accepted: &[&str] = match mode {
        "history" | "tags" | "seed" | "tag" | "scores" | "profile" => &["api"],
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
    let mut v = json!({"title":"History","page":mode,"stats":{}});
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
                    if api_redirect {
                        return Ok(Redirect::permanent(&format!(
                            "{API_PREFIX}/scores/{}",
                            encoded(&users[0].1)
                        ))
                        .into_response());
                    }
                    v["page"] = json!("scores");
                    v["title"] = json!("Scores");
                    let (statistics, joined) = player_statistics(&state, users[0].0).await?;
                    v["stats"] = statistics_value(&statistics, joined);
                    let achievements = achievements(&state, users[0].0).await?;
                    set_table(&mut v, &PublicPageTable::Achievements { achievements })?;
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
                    set_table(
                        &mut v,
                        &PublicPageTable::Games {
                            list: PublicGameList::History,
                            api_path: api,
                            frequencies: Vec::new(),
                            players: names.iter().cloned().map(Into::into).collect(),
                            statistics: None,
                        },
                    )?;
                    if names.len() > 1 {
                        v["namesTitle"] =
                            json!(format!("Game History for {}", names_title(&names)));
                    }
                }
                "tags" => {
                    let api = format!("{API_PREFIX}/tags/{}", encoded(&users[0].1));
                    if api_redirect {
                        return Ok(Redirect::permanent(&api).into_response());
                    }
                    v["title"] = json!("Tagged Games");
                    let selection = data::selection(&state, &params, mode).await?;
                    let total = data::count(&state, selection).await?;
                    v["total"] = json!(total);
                    if total.get() > 0 {
                        set_table(
                            &mut v,
                            &PublicPageTable::Games {
                                list: PublicGameList::Tags,
                                api_path: api,
                                frequencies: Vec::new(),
                                players: vec![users[0].1.clone().into()],
                                statistics: None,
                            },
                        )?;
                    }
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
            let rows = score_frequencies(&state, seed).await?;
            let statistics = seed_stats(&state, seed, &rows).await?;
            set_table(
                &mut v,
                &PublicPageTable::Games {
                    list: PublicGameList::Seed,
                    api_path: api,
                    frequencies: rows,
                    players: Vec::new(),
                    statistics,
                },
            )?;
        }
        "tag" => {
            let raw = params
                .get("tag")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| HttpError::not_found("You must specify a tag."))?;
            let tag = crate::model::normalize_tag(raw).map_err(HttpError::not_found)?;
            if api_redirect {
                return Ok(
                    Redirect::permanent(&format!("{API_PREFIX}/tag/{}", encoded(&tag)))
                        .into_response(),
                );
            }
            v["namesTitle"] = json!(format!("Games With a Tag of: {tag}"));
            let selection = data::selection(&state, &params, mode).await?;
            let total = data::count(&state, selection).await?;
            v["total"] = json!(total);
            if total.get() > 0 {
                set_table(
                    &mut v,
                    &PublicPageTable::Games {
                        list: PublicGameList::Tag,
                        api_path: format!("{API_PREFIX}/tag/{}", encoded(&tag)),
                        frequencies: Vec::new(),
                        players: Vec::new(),
                        statistics: None,
                    },
                )?;
            }
        }
        _ => return Err(HttpError::not_found("Not found.")),
    }
    render(&state, "public-page.html", v)
}

/// A player's progress toward each achievement, and how many players have each one.
async fn achievements(state: &PublicState, user: i32) -> Result<Vec<hanabi_protocol::Achievement>> {
    let mut transaction = scan(state).await?;
    let achievements = crate::achievements::achievements(&mut transaction, user)
        .await
        .context(StatementLimit(AGGREGATE_STATEMENT_TIMEOUT))?;
    transaction.commit().await?;
    Ok(achievements)
}

/// Converts a count to a float for display; counts are far below the 2^53 that floats hold exactly.
#[expect(clippy::cast_precision_loss, reason = "counts are far below 2^53")]
fn float(n: i64) -> f64 {
    n as f64
}
/// `n` as a percentage of `total`, or 0 when `total` is 0.
fn percentage(n: i64, total: i64) -> f64 {
    if total == 0 {
        0.0
    } else {
        float(n) * 100.0 / float(total)
    }
}
/// The decimal places that a percentage is shown with.
const PERCENTAGE_DECIMALS: usize = 1;
/// A percentage as the pages show it, without a fraction of zeros.
fn format_percentage(percentage: f64) -> String {
    let s = format!("{percentage:.PERCENTAGE_DECIMALS$}");
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
/// A player's game counts, time played, and the date they joined. The date is also returned as a
/// time, so that the profile can show it in words.
async fn player_statistics(
    state: &PublicState,
    user: i32,
) -> Result<(PlayerStatistics, time::OffsetDateTime)> {
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
    let account = sqlx::query!(
        "SELECT datetime_created,seconds_reviewing FROM users WHERE id=$1",
        user
    )
    .fetch_one(&state.pool)
    .await?;
    let statistics = PlayerStatistics {
        num_games_normal: Count::try_from(row.normal)?,
        num_games_other: Count::try_from(row.other)?,
        num_games_total: Count::try_from(row.normal + row.other)?,
        num_games_speedrun: Count::try_from(row.speed)?,
        time_played_seconds: Count::try_from(row.duration)?,
        time_played_speedrun_seconds: Count::try_from(row.speed_duration)?,
        time_reviewed_seconds: Count::try_from(account.seconds_reviewing)?,
        time_total_seconds: Count::try_from(
            row.duration
                .saturating_add(row.speed_duration)
                .saturating_add(account.seconds_reviewing),
        )?,
        date_joined: account.datetime_created.into(),
    };
    Ok((statistics, account.datetime_created))
}

/// A player's statistics as their profile shows them, with durations and the joined date in words.
fn statistics_value(statistics: &PlayerStatistics, date: time::OffsetDateTime) -> Value {
    let suffix = match date.day() {
        1 | 21 | 31 => "st",
        2 | 22 => "nd",
        3 | 23 => "rd",
        _ => "th",
    };
    json!({
        "numGamesNormal": statistics.num_games_normal,
        "numGamesOther": statistics.num_games_other,
        "numGamesTotal": statistics.num_games_total,
        "numGamesSpeedrun": statistics.num_games_speedrun,
        "timePlayed": duration(statistics.time_played_seconds.get()),
        "timePlayedSpeedrun": duration(statistics.time_played_speedrun_seconds.get()),
        "timeReviewed": duration(statistics.time_reviewed_seconds.get()),
        "timeTotal": duration(statistics.time_total_seconds.get()),
        "dateJoined": format!("{} {}{}, {}", date.month(), date.day(), suffix, date.year()),
    })
}

/// A player's statistics, max scores, and achievements, for `/api/v1/scores/{username}`.
pub(super) async fn player_scores(
    state: &PublicState,
    user: i32,
    name: &str,
) -> Result<PlayerScores> {
    let (statistics, _) = player_statistics(state, user).await?;
    Ok(PlayerScores {
        name: name.into(),
        statistics,
        max_scores: score_summary(state, user).await?,
        achievements: achievements(state, user).await?,
    })
}

/// The average scores of the seeds that share a prefix (such as "p2v0s"), sorted from lowest, and
/// when they were computed. Each prefix has its own lock, so that a slow query for one prefix does
/// not delay the others, and so that requests for the same prefix wait for one query.
pub(super) type SeedAverages =
    HashMap<String, Arc<tokio::sync::Mutex<Option<(std::time::Instant, Arc<[f64]>)>>>>;

/// How many games reached each score on a seed.
pub(super) async fn score_frequencies(
    state: &PublicState,
    seed: &str,
) -> Result<Vec<hanabi_protocol::ScoreFrequency>> {
    Ok(sqlx::query_scalar!("SELECT jsonb_build_object('score',score,'numGames',count(*)) AS \"value!\" FROM games WHERE seed=$1 GROUP BY score ORDER BY score", seed)
        .fetch_all(&state.pool)
        .await?
        .into_iter()
        .map(serde_json::from_value)
        .collect::<serde_json::Result<Vec<hanabi_protocol::ScoreFrequency>>>()?)
}

/// The statistics of a seed's games, or `None` when the seed has no games.
pub(super) async fn seed_statistics(
    state: &PublicState,
    seed: &str,
) -> Result<Option<SeedStatistics>> {
    let frequencies = score_frequencies(state, seed).await?;
    seed_stats(state, seed, &frequencies).await
}

/// The statistics of a seed's games, and how hard the seed is compared to the other seeds of its
/// variant, player count, and hand size.
async fn seed_stats(
    state: &PublicState,
    seed: &str,
    frequencies: &[hanabi_protocol::ScoreFrequency],
) -> Result<Option<SeedStatistics>> {
    let games: i64 = frequencies.iter().map(|row| row.num_games.get()).sum();
    let Some(game) = sqlx::query!(
        "SELECT variant_id,num_players FROM games WHERE seed=$1 LIMIT 1",
        seed
    )
    .fetch_optional(&state.pool)
    .await?
    else {
        return Ok(None);
    };
    let Some(variant) = catalog::variant(i64::from(game.variant_id)) else {
        return Ok(None);
    };
    let total: i64 = frequencies
        .iter()
        .map(|row| i64::from(row.score.get()) * row.num_games.get())
        .sum();
    let average = float(total) / float(games);
    let max_scores: i64 = frequencies
        .iter()
        .filter(|row| i64::from(row.score.get()) == i64::from(variant.max_score))
        .map(|row| row.num_games.get())
        .sum();
    let mut statistics = SeedStatistics {
        variant_id: VariantId::try_from(game.variant_id)?,
        num_players: NumPlayers::try_from(game.num_players)?,
        num_games: Count::try_from(games)?,
        num_max_scores: Count::try_from(max_scores)?,
        max_score_rate: percentage(max_scores, games),
        average_score: average,
        max_score: Score::try_from(variant.max_score)?,
        difficulty: None,
    };
    let Some(prefix) = regex!(crate::game::SEED_PATTERN)
        .captures(seed)
        .map(|captures| captures[1].to_owned())
    else {
        return Ok(Some(statistics));
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
        statistics.difficulty = Some(SeedDifficulty {
            percentile: float(2 * i64::try_from(higher)? + i64::try_from(ties)?) * 50.0
                / float(others),
            num_seeds: Count::try_from(others)?,
            num_players: NumPlayers::try_from(game.num_players)?,
            variant_name: variant.name.clone(),
        });
    }
    Ok(Some(statistics))
}
/// The sorted average scores of the seeds with a prefix. A large variant has thousands of seeds,
/// so the averages are shared for `SEED_AVERAGES_LIFETIME`.
async fn seed_averages(
    state: &PublicState,
    prefix: String,
    variant: i16,
    num_players: i16,
) -> Result<Arc<[f64]>> {
    let entry = state
        .seed_averages
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .entry(prefix.clone())
        .or_default()
        .clone();
    let mut cache = entry.lock().await;
    if let Some((computed, averages)) = &*cache
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
    *cache = Some((std::time::Instant::now(), averages.clone()));
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

/// A player's count of max scores at each player count.
async fn score_summary(state: &PublicState, id: i32) -> Result<MaxScoreSummary> {
    let statistics = user_stats(state, id).await?;
    let mut totals = [0; crate::database::PLAYER_COUNTS];
    for variant in catalog::variants() {
        // A variant without a row has no games.
        let Some(row) = statistics.get(&i64::from(variant.id)) else {
            continue;
        };
        let max = i64::from(variant.max_score);
        for (total, score) in totals.iter_mut().zip(row.best_scores()) {
            if score.is_some_and(|(score, _)| i64::from(score) == max) {
                *total += 1;
            }
        }
    }
    let total: i64 = totals.iter().sum();
    let variants = i64::try_from(catalog::variants().len())?;
    let per_type = totals
        .iter()
        .map(|&total| {
            Ok(MaxScoreCount {
                total: Count::try_from(total)?,
                percentage: percentage(total, variants),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(MaxScoreSummary {
        total: Count::try_from(total)?,
        percentage: percentage(
            total,
            variants * i64::try_from(crate::database::PLAYER_COUNTS)?,
        ),
        per_type,
    })
}

/// A player's max scores as their profile shows them, with rounded percentages.
fn summary_value(summary: &MaxScoreSummary) -> Result<Value> {
    let mut v = serde_json::to_value(summary)?;
    v["percentage"] = json!(format_percentage(summary.percentage));
    for (row, count) in summary.per_type.iter().enumerate() {
        v["perType"][row]["percentage"] = json!(format_percentage(count.percentage));
    }
    Ok(v)
}

/// The most comma-separated names that a missing-scores filter, such as `excludeVariants`, takes.
pub(super) const MAX_FILTER_TERMS: usize = 100;
/// The most characters that a missing-scores filter, such as `excludeVariants`, takes.
pub(super) const MAX_FILTER_LENGTH: usize = 1000;

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
        let value = q.nonempty(key).map_err(HttpError::bad)?.unwrap_or("");
        let terms: Vec<&str> = value
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect();
        if value.chars().count() > MAX_FILTER_LENGTH || terms.len() > MAX_FILTER_TERMS {
            return Err(HttpError::bad(format!(
                "The {key} filter can have at most {MAX_FILTER_TERMS} names and \
                 {MAX_FILTER_LENGTH} characters."
            )));
        }
        Ok(terms
            .into_iter()
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
    let players: Vec<MissingScoresPlayer> = users
        .iter()
        .map(|u| MissingScoresPlayer {
            name: u.1.as_str().into(),
            excluded: excluded_players.contains(&crate::accounts::normalize_string(&u.1)),
        })
        .collect();
    let mut statistics = Vec::new();
    for (index, user) in users.iter().enumerate() {
        if !players[index].excluded {
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
    // Each variant name is normalized once, not once for each term and player count.
    let variants: Vec<_> = catalog::variants()
        .iter()
        .filter(|variant| {
            let name = crate::accounts::normalize_string(&variant.name);
            !excluded_variants.iter().any(|term| name.contains(term))
        })
        .collect();
    let mut rows = Vec::new();
    for p in counts {
        for variant in variants.iter().copied() {
            let name = variant.name.as_str();
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
            rows.push(MissingScore {
                variant_name: name.to_owned(),
                num_players: NumPlayers::try_from(p)?,
                score: best.map(|(score, _)| Score::try_from(score)).transpose()?,
                max_score: Score::try_from(max)?,
                modifier: best.and_then(|(_, modifier)| shown_modifier(modifier)),
                efficiency: shown,
                difficulty: if efficiency < HARD_EFFICIENCY {
                    Difficulty::Normal
                } else if efficiency < VERY_HARD_EFFICIENCY {
                    Difficulty::Hard
                } else {
                    Difficulty::VeryHard
                },
            });
        }
    }
    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
    let filters = if shared {
        MissingScoresFilters::Shared {
            players,
            exclude_variants: q.get("excludeVariants").unwrap_or("").to_owned(),
            min_efficiency: q.get("minEfficiency").unwrap_or("").to_owned(),
            max_efficiency: q.get("maxEfficiency").unwrap_or("").to_owned(),
            active: !excluded_players.is_empty()
                || !excluded_variants.is_empty()
                || bounds.iter().any(Option::is_some),
        }
    } else {
        MissingScoresFilters::Player {
            name: users[0].1.as_str().into(),
            num_players: num_players.map(NumPlayers::try_from).transpose()?,
        }
    };
    let mut v = json!({"title":"Missing Scores","name":users[0].1,
        "namesTitle":if shared {format!("Missing Scores for {}",names_title(&names))}else{format!("{} Profile",possessive(&users[0].1))},
        "singleMissingScores":!shared});
    if !shared {
        v["summary"] = summary_value(&score_summary(state, users[0].0).await?)?;
    }
    set_table(&mut v, &PublicPageTable::MissingScores { rows, filters })?;
    render(state, "missing-scores.html", v)
}
