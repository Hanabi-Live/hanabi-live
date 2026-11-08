use super::*;
use axum::{
    Form,
    response::{Html, Redirect},
};

pub(super) fn templates() -> minijinja::Environment<'static> {
    let mut env = minijinja::Environment::new();
    env.add_filter("bitand", |a: i64, b: i64| a & b);
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
    Ok(Html(
        state
            .templates
            .get_template(template)?
            .render(minijinja::value::Serde(values))?,
    )
    .into_response())
}

pub(super) async fn main_page(
    State(state): State<PublicState>,
    headers: HeaderMap,
) -> Result<Response> {
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
    let q = query(raw);
    let mode = uri.path().split('/').nth(1).unwrap_or("");
    let mut v = json!({"title":"History","page":mode,"stats":{},"games":[],"frequencies":[]});
    match mode {
        "export" => return Ok(Json(replay::export(&state, &params).await?).into_response()),
        "videos" => v["title"] = json!("Videos"),
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
                    return Err(Error::bad(
                        "Error: You must first specify the number of players.",
                    ));
                }
                if !n.is_some_and(|n| (2..=6).contains(&n)) {
                    return Err(Error::bad(
                        "Error: Number of players must be between 2 and 6.",
                    ));
                }
            }
            let users = data::players(&state, &params, shared || mode == "history").await?;
            v["name"] = json!(users[0].1);
            match mode {
                "scores" | "profile" => {
                    v["page"] = json!("scores");
                    v["title"] = json!("Scores");
                    let mut stats = aggregate(&state, Some(users[0].0), None).await?;
                    let summary = score_summary(&state, users[0].0).await?;
                    stats
                        .as_object_mut()
                        .expect("stats")
                        .extend(summary.as_object().expect("summary").clone());
                    v["stats"] = stats;
                }
                "history" => {
                    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
                    let api = format!(
                        "/api/v1/history/{}",
                        names
                            .iter()
                            .map(|n| encoded(n))
                            .collect::<Vec<_>>()
                            .join("/")
                    );
                    if first(&q, "api").is_some() {
                        return Ok(Redirect::permanent(&api).into_response());
                    }
                    v["apiPath"] = json!(api);
                    if names.len() > 1 {
                        v["namesTitle"] =
                            json!(format!("Game History for {}", names_title(&names)));
                    }
                }
                "tags" => {
                    if first(&q, "api").is_some() {
                        return Ok(Redirect::permanent(&format!(
                            "/api/v1/tags/{}",
                            encoded(&users[0].1)
                        ))
                        .into_response());
                    }
                    v["title"] = json!("Tagged Games");
                    v["page"] = json!("tagged");
                    v["games"] = data::tagged(&state, &params, false).await?;
                }
                _ => {
                    return missing(&state, users, shared, n.filter(|n| (2..=6).contains(n)), &q)
                        .await;
                }
            }
        }
        "seed" => {
            let seed = params
                .get("seed")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::not_found("Error: You must specify a seed."))?;
            let api = format!("/api/v1/seed/{}", encoded(seed));
            if first(&q, "api").is_some() {
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
                .ok_or_else(|| Error::not_found("Error: You must specify a variant ID."))?;
            let id = integer(raw)
                .ok_or_else(|| Error::bad("Error: The variant ID must be a number."))?;
            let variant = catalog::variant(id)
                .ok_or_else(|| Error::bad("Error: That is not a valid variant ID."))?;
            let api = format!("/api/v1/variants/{id}");
            if first(&q, "api").is_some() {
                return Ok(Redirect::permanent(&api).into_response());
            }
            v["title"] = json!("Variant Stats");
            v["namesTitle"] = json!(format!("Global Statistics for {}", variant.name));
            v["apiPath"] = json!(api);
            let mut stats = aggregate(&state, None, Some(id)).await?;
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
            stats["numMaxScores"] = json!(number(&row, "num_max_scores"));
            stats["maxScoreRate"] = json!(percentage(number(&row, "num_max_scores"), games));
            stats["bestScores"] = json!(
                (2..=6)
                    .map(|p| number(&row, &format!("best_score{p}")))
                    .collect::<Vec<_>>()
            );
            stats["maxScore"] = json!(variant.max_score);
            v["stats"] = stats;
        }
        "tag" => {
            let raw = params
                .get("tag")
                .filter(|s| !s.is_empty())
                .ok_or_else(|| Error::not_found("Error: You must specify a tag."))?;
            let tag = data::sanitize_tag(raw)?;
            if first(&q, "api").is_some() {
                return Ok(
                    Redirect::permanent(&format!("/api/v1/tag/{}", encoded(&tag))).into_response(),
                );
            }
            v["page"] = json!("tagged");
            v["namesTitle"] = json!(format!("Games With a Tag of: {tag}"));
            v["games"] = data::tagged(&state, &params, true).await?;
        }
        _ => return Err(Error::not_found("404 not found")),
    }
    render(&state, "public-page.html", v)
}

fn number(v: &Value, key: &str) -> i64 {
    v[key].as_i64().unwrap_or(0)
}
fn percentage(n: i64, total: i64) -> String {
    let s = format!(
        "{:.1}",
        if total == 0 {
            0.0
        } else {
            n as f64 * 100.0 / total as f64
        }
    );
    s.strip_suffix(".0").unwrap_or(&s).to_owned()
}
fn duration(seconds: i64) -> String {
    fn unit(n: i64, label: &str) -> String {
        format!("{n} {label}{}", if n == 1 { "" } else { "s" })
    }
    if seconds == 0 {
        return "-".into();
    }
    if seconds < 60 {
        return unit(seconds, "second");
    }
    if seconds < 3600 {
        return unit((seconds as f64 / 60.0).round() as i64, "minute");
    }
    let hours = seconds / 3600;
    let days = ((hours - 1) / 24).max(0);
    let minutes = seconds / 60 - hours * 60;
    if days > 0 {
        format!(
            "{}, {}, and {}",
            unit(days, "day"),
            unit(hours - days * 24, "hour"),
            unit(minutes, "minute")
        )
    } else {
        format!("{} and {}", unit(hours, "hour"), unit(minutes, "minute"))
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
    std::time::Duration::from_secs(300)
};

async fn aggregate(state: &PublicState, user: Option<i32>, variant: Option<i64>) -> Result<Value> {
    if user.is_some() {
        return compute_aggregate(state, user, variant).await;
    }
    let mut totals = state.site_totals.lock().await;
    if let Some((computed, stats)) = totals.get(&variant)
        && computed.elapsed() < SITE_TOTALS_LIFETIME
    {
        return Ok(stats.clone());
    }
    let stats = compute_aggregate(state, None, variant).await?;
    totals.insert(variant, (std::time::Instant::now(), stats.clone()));
    Ok(stats)
}

async fn compute_aggregate(
    state: &PublicState,
    user: Option<i32>,
    variant: Option<i64>,
) -> Result<Value> {
    let mut transaction = state.pool.begin().await?;
    // This scan can legitimately take longer than the pool's usual 2 second limit.
    sqlx::query_scalar!("SELECT set_config('statement_timeout','20000',true)")
        .fetch_one(&mut *transaction)
        .await?;
    // Each case has its own query: a shared `$1 IS NULL OR ...` query gets a generic plan that
    // cannot use an index. The variant is compared as the column's own SMALLINT, because a cast
    // column cannot use its index either. A player's totals start from their own games.
    // Site-wide time counts every player's time, so it is multiplied by the number of players.
    macro_rules! game_totals {
        ($filter:literal $(, $argument:expr)*) => {{
            let row = sqlx::query!(
                "SELECT count(*) FILTER(WHERE NOT speedrun AND end_condition=1) AS \"normal!\",
                count(*) FILTER(WHERE NOT speedrun AND end_condition<>1) AS \"other!\",
                count(*) FILTER(WHERE speedrun) AS \"speed!\",
                COALESCE(sum(extract(epoch FROM datetime_finished-datetime_started) * num_players)
                  FILTER(WHERE NOT speedrun),0)::bigint AS \"duration!\",
                COALESCE(sum(extract(epoch FROM datetime_finished-datetime_started) * num_players)
                  FILTER(WHERE speedrun),0)::bigint AS \"speed_duration!\"
                FROM games" + $filter $(, $argument)*
            )
            .fetch_one(&mut *transaction)
            .await?;
            (row.normal, row.other, row.speed, row.duration, row.speed_duration)
        }};
    }
    let (normal, other, speed, played, speed_played) = match (user, variant) {
        (Some(user), None) => {
            let row = sqlx::query!(
                "SELECT count(*) FILTER(WHERE NOT g.speedrun AND g.end_condition=1) AS \"normal!\",
                count(*) FILTER(WHERE NOT g.speedrun AND g.end_condition<>1) AS \"other!\",
                count(*) FILTER(WHERE g.speedrun) AS \"speed!\",
                COALESCE(sum(extract(epoch FROM g.datetime_finished-g.datetime_started))
                  FILTER(WHERE NOT g.speedrun),0)::bigint AS \"duration!\",
                COALESCE(sum(extract(epoch FROM g.datetime_finished-g.datetime_started))
                  FILTER(WHERE g.speedrun),0)::bigint AS \"speed_duration!\"
                FROM game_participants p JOIN games g ON g.id=p.game_id WHERE p.user_id=$1",
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
            game_totals!(" WHERE variant_id=$1", variant)
        }
        (None, None) => game_totals!(""),
        (Some(_), Some(_)) => {
            return Err(
                anyhow::anyhow!("Per-player statistics are not filtered by variant").into(),
            );
        }
    };
    transaction.commit().await?;
    let mut stats = json!({"numGamesNormal":normal,"numGamesOther":other,"numGamesTotal":normal+other,
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
        stats["dateJoined"] = json!(format!(
            "{} {}{}, {}",
            date.format("%B"),
            date.day(),
            suffix,
            date.year()
        ));
    }
    Ok(stats)
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
async fn score_summary(state: &PublicState, id: i32) -> Result<Value> {
    let stats = user_stats(state, id).await?;
    let mut totals = [0; 5];
    let mut rows = Vec::new();
    for variant in catalog::variants() {
        let row = stats
            .get(&i64::from(variant.id))
            .cloned()
            .unwrap_or(json!({}));
        let max = i64::from(variant.max_score);
        let mut best = Vec::new();
        for p in 2..=6 {
            let score = number(&row, &format!("best_score{p}"));
            if score == max {
                totals[p - 2] += 1;
            }
            best.push(json!({"score":score,"modifier":number(&row,&format!("best_score{p}_mod"))}));
        }
        let games = number(&row, "num_games");
        rows.push(
            json!({"id":variant.id,"name":variant.name,"maxScore":max,"numGames":games,
            "bestScores":best}),
        );
    }
    let total: i64 = totals.iter().sum();
    Ok(
        json!({"rows":rows,"total":total,"percentage":percentage(total,catalog::variants().len() as i64*5),
        "perType":totals.iter().map(|t| json!({"total":t,"percentage":percentage(*t,catalog::variants().len() as i64)})).collect::<Vec<_>>()}),
    )
}

async fn missing(
    state: &PublicState,
    users: Vec<(i32, String)>,
    shared: bool,
    num_players: Option<i64>,
    q: &Query,
) -> Result<Response> {
    if shared && users.len() < 2 {
        return Err(Error::not_found(
            "Error: You must specify at least two players.",
        ));
    }
    let terms = |key| {
        first(q, key)
            .unwrap_or("")
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(crate::accounts::normalize_string)
            .collect::<Vec<_>>()
    };
    let excluded_players = if shared {
        terms("excludePlayers")
    } else {
        Vec::new()
    };
    let excluded_variants = if shared {
        terms("excludeVariants")
    } else {
        Vec::new()
    };
    let mut bounds = [None, None];
    for (i, key) in ["minEfficiency", "maxEfficiency"].iter().enumerate() {
        if shared && let Some(s) = first(q, key).map(str::trim).filter(|s| !s.is_empty()) {
            bounds[i] = s.parse::<f64>().ok().filter(|n| n.is_finite());
            if bounds[i].is_none() {
                return Err(Error::bad(format!(
                    "Error: The {} efficiency must be a number.",
                    if i == 0 { "minimum" } else { "maximum" }
                )));
            }
        }
    }
    let players: Vec<Value> = users.iter().map(|u| json!({"name":u.1,"excluded":excluded_players.contains(&crate::accounts::normalize_string(&u.1))})).collect();
    let mut stats = Vec::new();
    for (index, user) in users.iter().enumerate() {
        if players[index]["excluded"] == false {
            stats.push(user_stats(state, user.0).await?);
        }
    }
    if stats.is_empty() {
        return Err(Error::bad("Error: You can not exclude every player."));
    }
    let counts = num_players.map_or_else(|| (2..=6).collect::<Vec<_>>(), |p| vec![p]);
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
            for (index, s) in stats.iter().enumerate() {
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
            let cards = (state.config.deck_size)(id as i32)? as i64;
            let hand = match p {
                2 | 3 => 5,
                4 | 5 => 4,
                _ => 3,
            };
            let stacks = variant.suits.len() as i64;
            let multiplier = if variant.clue_starved { 2 } else { 1 };
            let finished = if variant.throw_it_in_a_hole {
                0
            } else {
                stacks - p / i64::from(variant.stack_size) - 1
            };
            let clues = (8 * multiplier + finished + cards - (hand - 1) * p - max) / multiplier;
            let efficiency = max as f64 / clues as f64;
            let rounded = (efficiency * 100.0).round() / 100.0;
            if bounds[0].is_some_and(|min| rounded < min)
                || bounds[1].is_some_and(|max| rounded > max)
            {
                continue;
            }
            rows.push(json!({"name":name,"numPlayers":p,"score":best.0,"maxScore":max,"modifier":best.1,
                "efficiency":format!("{efficiency:.2}"),"efficiencyClass":if efficiency<1.33 {"normal"}else if efficiency<1.5 {"hard"}else{"very-hard"}}));
        }
    }
    let names: Vec<_> = users.iter().map(|u| u.1.clone()).collect();
    let mut v = json!({"title":"Missing Scores","name":users[0].1,
        "namesTitle":if shared {format!("Missing Scores for {}",names_title(&names))}else{format!("{} Profile",possessive(&users[0].1))},
        "singleMissingScores":!shared,"requestedNumPlayers":num_players.unwrap_or(0),
        "players":players,"rows":rows,"advancedFiltersActive":!excluded_players.is_empty()||!excluded_variants.is_empty()||bounds.iter().any(Option::is_some),
        "excludeVariants":first(q,"excludeVariants").unwrap_or(""),
        "minEfficiency":first(q,"minEfficiency").unwrap_or(""),"maxEfficiency":first(q,"maxEfficiency").unwrap_or("")});
    if !shared {
        v["summary"] = score_summary(state, users[0].0).await?;
    }
    render(state, "missing-scores.html", v)
}

pub(super) async fn password_hash(
    ConnectInfo(address): ConnectInfo<SocketAddr>,
    Form(form): Form<HashMap<String, String>>,
) -> Result<Response> {
    let password = form
        .get("password")
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::bad("Error: You must specify a username."))?
        .clone();
    let hash = crate::accounts::hash_password(&address.ip().to_string(), password).await?;
    Ok(hash.into_response())
}
