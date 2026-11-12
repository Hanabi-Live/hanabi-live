use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

fn config() -> PublicConfig {
    PublicConfig {
        root: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(".."),
        session_secret: "public-test-secret".into(),
        domain: "localhost".into(),
        use_tls: false,
        client_version: "test-version".into(),
        is_dev: false,
    }
}
async fn request(app: Router, path: &str) -> (StatusCode, String) {
    response(
        app.oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap(),
    )
    .await
}
async fn response(r: Response) -> (StatusCode, String) {
    let status = r.status();
    let body = String::from_utf8(
        to_bytes(r.into_body(), 4 * 1024 * 1024)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap();
    (status, body)
}

#[tokio::test]
async fn rendered_shell_preserves_modal_and_game_container_nesting() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    let divisions = regex!(r"(?s)<!--.*?-->|<script\b[^>]*>.*?</script\s*>|</?div\b[^>]*>");
    let identifiers = regex!(r#"\sid\s*=\s*"([^"]*)""#);
    for development in [false, true] {
        let mut config = config();
        config.is_dev = development;
        let (status, body) = request(router(pool.clone(), &config), "/").await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let mut stack: Vec<Option<String>> = Vec::new();
        let mut parents = HashMap::new();
        for token in divisions.find_iter(&body) {
            let tag = token.as_str();
            if tag.starts_with("<!--") || tag.starts_with("<script") {
                continue;
            }
            if tag.starts_with("</div") {
                assert!(
                    stack.pop().is_some(),
                    "Unexpected closing div at byte {}",
                    token.start()
                );
            } else {
                let id = identifiers
                    .captures(tag)
                    .map(|captures| captures[1].to_owned());
                if let Some(id) = &id {
                    assert!(
                        parents
                            .insert(id.clone(), stack.last().cloned().flatten())
                            .is_none(),
                        "Duplicate div ID: {id}"
                    );
                }
                stack.push(id);
            }
        }
        assert!(stack.is_empty(), "Unclosed div containers: {stack:?}");
        for id in [
            "page-wrapper",
            "modals-container",
            "game",
            "game-chat-modal",
            "domain",
        ] {
            assert_eq!(
                parents.get(id),
                Some(&None),
                "{id} must remain a top-level container"
            );
        }
        for id in ["emoji-modal", "morph-modal"] {
            assert_eq!(parents[id].as_deref(), Some("modals-container"));
        }
        assert_eq!(parents["emoji-picker"].as_deref(), Some("emoji-modal"));
        assert!(body.contains(if development {
            "http://localhost:5173/src/main.ts"
        } else {
            "/public/js/bundles/main.test-version.min.js"
        }));
    }
}

#[tokio::test]
async fn shell_routes_metadata_and_static_files() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused:unused@localhost/unused")
        .unwrap();
    let app = router(pool.clone(), &config());
    for path in [
        "/",
        "/lobby",
        "/game/123/shadow/1",
        "/replay/123/7",
        "/shared-replay/123/8",
        "/replay-json/abc",
        "/shared-replay-json/abc",
        "/create-table",
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        for hook in [
            "id=\"page-wrapper\"",
            "id=\"domain\"",
            "id=\"lobby\"",
            "/public/js/bundles/main.test-version.min.js",
            "data-authenticated=\"false\"",
        ] {
            assert!(body.contains(hook), "{path}: missing {hook}");
        }
    }
    let (status, body) = request(app.clone(), "/api/v1/variants-full").await;
    assert_eq!(status, StatusCode::OK);
    let metadata: Value = serde_json::from_str(&body).unwrap();
    assert!(metadata.as_object().unwrap().len() > 100);
    assert_eq!(metadata["0"]["maxScore"], 25);
    assert!(
        metadata
            .as_object()
            .unwrap()
            .values()
            .any(|v| v["stackSize"] != 5)
    );
    let (status, body) = request(app.clone(), "/public/css/tokens.css").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("data-theme"));
    let immutable = format!("public, max-age={VERSIONED_ASSET_MAX_AGE_SECONDS}, immutable");
    let mut dev_config = config();
    dev_config.is_dev = true;
    for (app, path, expected) in [
        (
            &app,
            "/public/css/tokens.css?test-version",
            Some(immutable.as_str()),
        ),
        (&app, "/public/css/tokens.css", Some("no-cache")),
        (
            &app,
            "/public/css/tokens.css?other-version",
            Some("no-cache"),
        ),
        (
            &app,
            "/public/missing.test-version.min.js",
            Some("no-cache"),
        ),
        (
            &router(pool.clone(), &dev_config),
            "/public/css/tokens.css?test-version",
            Some("no-cache"),
        ),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let cache_control = response.headers().get(axum::http::header::CACHE_CONTROL);
        assert_eq!(
            cache_control.map(|value| value.to_str().unwrap()),
            expected,
            "{path}"
        );
    }
    assert_eq!(
        request(app.clone(), "/public/%2e%2e/install/database_schema.sql")
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    let (status, body) = request(app.clone(), "/password-reset").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("id=\"password-reset-form\""));
    let mut unsafe_config = config();
    unsafe_config.domain = "</div><script>alert(7)</script>".into();
    unsafe_config.client_version = "\"><script>alert(8)</script>".into();
    let app = router(
        PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@localhost/unused")
            .unwrap(),
        &unsafe_config,
    );
    let (status, body) = request(app, "/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(!body.contains("<script>alert(7)</script>"));
    assert!(!body.contains("<script>alert(8)</script>"));
    assert!(body.contains("&lt;script&gt;"));
}

#[tokio::test]
async fn seed_database_failure_is_not_an_empty_success() {
    let pool = PgPoolOptions::new()
        .connect_lazy("postgres://unused@127.0.0.1/unused")
        .unwrap();
    pool.close().await;
    let (status, body) = request(router(pool, &config()), "/seed/same").await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(body.contains("GET /seed/{seed} failed"), "{body}");
    assert!(body.contains("database connection pool is closed"));
    assert!(body.contains("Reference:"));
}

#[test]
fn profile_titles_use_possessive_names() {
    assert_eq!(pages::possessive("Alice"), "Alice's");
    assert_eq!(pages::possessive("James"), "James'");
}

#[test]
fn formatted_templates_preserve_conditional_links_and_selected_options() {
    let templates = pages::templates();
    let buttons = templates
        .get_template("profile-buttons.html")
        .unwrap()
        .render(minijinja::value::Serde(
            json!({"name":"Alice","title":"Tagged Games"}),
        ))
        .unwrap();
    let anchors = regex!(r"(?s)<a\b([^>]*)>(.*?)</a>");
    let tagged = anchors
        .captures_iter(&buttons)
        .find(|link| link[2].trim() == "Tagged Games")
        .expect("Tagged Games profile button");
    assert!(tagged[1].contains("disabled"));
    assert!(
        !tagged[1].contains("href="),
        "The selected profile button must not link to itself"
    );

    let missing = templates
        .get_template("missing-scores.html")
        .unwrap()
        .render(minijinja::value::Serde(json!({
            "projectName":"Hanab Live","version":"1","isDev":false,"title":"Missing Scores",
            "name":"Alice","namesTitle":"Alice's Profile","singleMissingScores":true,
            "summary":{"perType":[],"total":0,"percentage":"0"},
            "requestedNumPlayers":3,"players":[],"rows":[]
        })))
        .unwrap();
    let options = regex!(r"(?s)<option\b([^>]*)>.*?</option>");
    let selected = options
        .captures_iter(&missing)
        .filter(|option| option[1].contains("selected"))
        .map(|option| option[1].to_owned())
        .collect::<Vec<_>>();
    assert_eq!(
        selected.len(),
        1,
        "Only the requested player count should be selected"
    );
    assert!(selected[0].contains(r#"value="3""#));
}

#[tokio::test]
async fn public_database_routes_filters_privacy_exports_and_html() {
    let Some(db) = crate::accounts::test_support::TestDb::create().await else {
        return;
    };
    let app = router(db.pool.clone(), &config());
    let stat_pattern =
        regex!(r#"(?s)<li>\s*<span class="stat-description"\s*>(.*?)</span\s*>\s*(.*?)\s*</li>"#);
    let normalize = |text: &str| text.split_whitespace().collect::<Vec<_>>().join(" ");
    let stats_values = |html: &str| {
        stat_pattern
            .captures_iter(html)
            .map(|item| normalize(&item[2]))
            .collect::<Vec<_>>()
    };
    #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
    sqlx::raw_sql(
        "INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES
        (1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1'),
        (3,'<script>alert(1)</script>','<script>alert(1)</script>','test','127.0.0.1');
        INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
          deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
          seed,score,num_turns,end_condition,datetime_started,datetime_finished)
        SELECT id,'test',2,CASE WHEN id=3 THEN 1 ELSE 0 END,id=3,
          CASE WHEN id=3 THEN 120 END,CASE WHEN id=3 THEN 20 END,id=3,
          id=3,id=3,id=3,id=3,id=3,id=3,
          CASE WHEN id=3 THEN 'custom-seed' ELSE 'same' END,
          CASE WHEN id=1 THEN 25 WHEN id=2 THEN 15 ELSE 0 END,10,CASE WHEN id=2 THEN 2 ELSE 1 END,
          '2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T01:00:00Z'::timestamptz FROM generate_series(1,3) id;
        INSERT INTO game_participants(game_id,user_id,seat,character_id,assigned_metadata)
          VALUES(1,1,0,NULL,NULL),(1,2,1,NULL,NULL),(2,1,0,NULL,NULL),(2,3,1,NULL,NULL),(3,1,0,0,1),(3,2,1,19,NULL);
        INSERT INTO seeds(seed,num_games) VALUES('same',2),('custom-seed',1);
        INSERT INTO game_tags(game_id,user_id,tag) VALUES(1,1,'mine'),(1,2,'other'),(3,1,'mine');
        INSERT INTO game_actions(game_id,turn,type,target,value) VALUES(3,0,0,4,NULL),(3,1,4,0,1);
        INSERT INTO game_participant_notes(game_participant_id,card_order,note)
          SELECT id,0,'<note>' FROM game_participants WHERE game_id=3 AND user_id=1;
        INSERT INTO user_stats(user_id,variant_id,num_games,best_score2,best_score2_mod) VALUES(1,0,2,25,0);")
        .execute(&db.pool).await.unwrap();
    sqlx::query!("UPDATE games SET datetime_started='2026-01-01T00:00:00.12345Z' WHERE id=3")
        .execute(&db.pool)
        .await
        .unwrap();
    for (path, total, len) in [
        ("/api/v1/history/Alice?limit=1", 3, 1),
        ("/api/v1/history/Alice/Bob?filter[score]=25", 1, 1),
        ("/api/v1/history/Alice?filter[variantId]=1", 1, 1),
        ("/api/v1/seed/same?filter[score]=15", 1, 1),
        ("/api/v1/history/Alice?offset=4&limit=2", 3, 0),
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        let value: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["total"], total, "{path}");
        assert_eq!(value["games"].as_array().unwrap().len(), len, "{path}");
    }
    // Each sort column, direction, and filter assembles different SQL; exercise every one.
    for (path, total, first) in [
        ("/api/v1/history/Alice?sort=gameId&order=asc", 3, Some(1)),
        ("/api/v1/history/Alice?sort=gameId&order=desc", 3, Some(3)),
        (
            "/api/v1/history/Alice?sort=numPlayers&order=asc",
            3,
            Some(3),
        ),
        (
            "/api/v1/history/Alice?sort=numPlayers&order=desc",
            3,
            Some(3),
        ),
        ("/api/v1/history/Alice?sort=score&order=asc", 3, Some(3)),
        ("/api/v1/history/Alice?sort=score&order=desc", 3, Some(1)),
        ("/api/v1/history/Alice?filter[gameId]=2", 1, Some(2)),
        ("/api/v1/history/Alice?filter[numPlayers]=2", 3, Some(3)),
        ("/api/v1/history/Alice?filter[numPlayers]=3", 0, None),
        ("/api/v1/history/Alice?filter[score]=15", 1, Some(2)),
        ("/api/v1/history/Alice?filter[variantId]=0", 2, Some(2)),
        ("/api/v1/seed/same?sort=score&order=asc", 2, Some(2)),
        ("/api/v1/seed/same?filter[gameId]=1", 1, Some(1)),
        // Values outside a column's type match nothing instead of failing in PostgreSQL.
        ("/api/v1/history/Alice?filter[score]=70000", 0, None),
        ("/api/v1/history/Alice?filter[gameId]=99999999999", 0, None),
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        let value: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["total"], total, "{path}");
        assert_eq!(value["games"][0]["gameId"].as_i64(), first, "{path}");
    }
    // Responses match their wire contracts, timestamps included.
    let (_, body) = request(app.clone(), "/api/v1/history/Alice").await;
    hanabi_protocol::validate::<hanabi_protocol::GamePage>(&serde_json::from_str(&body).unwrap())
        .unwrap();
    for (path, ids) in [
        ("/api/v1/history/Alice?start=2", vec![3, 2]),
        ("/api/v1/history/Alice?end=1", vec![1]),
        ("/api/v1/history/Alice?start=-99999999999", vec![3, 2, 1]),
        ("/api/v1/history/Alice?start=99999999999", vec![]),
        ("/api/v1/history/Alice?end=99999999999", vec![3, 2, 1]),
        ("/api/v1/history/Alice?end=-99999999999", vec![]),
        ("/api/v1/seed/same?start=2", vec![2]),
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        let value: Value = serde_json::from_str(&body).unwrap();
        let actual: Vec<_> = value["games"]
            .as_array()
            .unwrap()
            .iter()
            .map(|game| game["gameId"].as_i64().unwrap())
            .collect();
        assert_eq!(value["total"], actual.len(), "{path}");
        assert_eq!(actual, ids, "{path}");
    }
    let (status, body) = request(
        app.clone(),
        "/api/v1/history/Alice?sort=score&order=asc&limit=1",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        serde_json::from_str::<Value>(&body).unwrap()["games"][0]["gameId"],
        3
    );
    let (_, body) = request(app.clone(), "/api/v1/history/Alice?start=3&end=3").await;
    let full = serde_json::from_str::<Value>(&body).unwrap()["games"].take();
    assert_eq!(full.as_array().unwrap().len(), 1);
    assert_eq!(full[0]["startedAt"], "2026-01-01T00:00:00.123Z");
    assert_eq!(full[0]["finishedAt"], "2026-01-01T01:00:00.000Z");
    for (page, expected) in [(0, vec![1]), (1, vec![2]), (2, vec![])] {
        let (status, body) = request(
            app.clone(),
            &format!("/api/v1/seed/same?limit=1&offset={page}"),
        )
        .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let games: Vec<Value> =
            serde_json::from_value(serde_json::from_str::<Value>(&body).unwrap()["games"].take())
                .unwrap();
        assert_eq!(
            games
                .iter()
                .map(|game| game["gameId"].as_i64().unwrap())
                .collect::<Vec<_>>(),
            expected
        );
        for game in games {
            assert_eq!(game["playerNames"].as_array().unwrap().len(), 2);
            assert!(game["options"]["variantId"].is_u64());
        }
    }
    let (status, body) = request(app.clone(), "/api/v1/seed/same").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["total"], 2);
    assert!(full[0]["options"]["timeControl"].is_object());
    for key in [
        "speedrun",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
        "detrimentalCharacters",
    ] {
        assert_eq!(full[0]["options"][key], true);
    }
    assert_eq!(full[0]["options"]["variantId"], 1);
    let (_, body) = request(app.clone(), "/api/v1/tags/Alice").await;
    let tagged: Value = serde_json::from_str(&body).unwrap();
    hanabi_protocol::validate::<hanabi_protocol::GamePage>(&tagged).unwrap();
    assert_eq!(tagged["total"], 2);
    assert!(
        tagged["games"]
            .as_array()
            .unwrap()
            .iter()
            .all(|g| g["tags"] == json!(["mine"]))
    );
    // The tagged games are paged like the other game lists.
    let (_, body) = request(app.clone(), "/api/v1/tags/Alice?limit=1&offset=1").await;
    let page: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(page["games"].as_array().unwrap().len(), 1);
    assert_eq!(
        (page["offset"].clone(), page["total"].clone()),
        (json!(1), json!(2))
    );
    let (_, body) = request(app.clone(), "/api/v1/tag/%20MINE%20").await;
    assert_eq!(serde_json::from_str::<Value>(&body).unwrap()["total"], 2);
    let (status, body) = request(app.clone(), "/export/3").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let export: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(export["seed"], "custom-seed");
    // Game 3 is in variant 1.
    assert_eq!(
        export["deck"],
        serde_json::to_value(crate::game::seeded_deck(1, "custom-seed").unwrap()).unwrap()
    );
    assert_eq!(export["actions"].as_array().unwrap().len(), 2);
    assert_eq!(export["notes"], json!([["<note>"], []]));
    assert_eq!(
        export["characters"],
        json!([{"type":"color","characterId":0,"color":1},{"type":"plain","characterId":19}])
    );
    assert_eq!(export["options"]["variantId"], 1);
    let (_, body) = request(app.clone(), "/export/1").await;
    assert_eq!(
        serde_json::from_str::<Value>(&body).unwrap()["seed"],
        "same"
    );
    for path in [
        "/scores/Alice",
        "/profile/Alice",
        "/history/Alice/Bob",
        "/tags/Alice",
        "/seed/same",
        "/tag/mine",
        "/missing-scores/Alice/2",
        "/shared-missing-scores/2/Alice/Bob",
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        assert!(body.contains("id=\"main\""), "{path}");
    }
    // The tagged games pages count the games and load them from the API.
    let (_, body) = request(app.clone(), "/tags/Alice").await;
    assert!(
        body.contains("data-api-path=\"&#x2f;api&#x2f;v1&#x2f;tags&#x2f;Alice\""),
        "{body}"
    );
    assert!(
        body.contains("<span id=\"total-number-of-games\">2</span>"),
        "{body}"
    );
    let (_, body) = request(app.clone(), "/tag/mine").await;
    assert!(
        body.contains("data-api-path=\"&#x2f;api&#x2f;v1&#x2f;tag&#x2f;mine\""),
        "{body}"
    );
    let (_, body) = request(app.clone(), "/history/Alice").await;
    assert!(body.contains("id=\"history-table\""), "{body}");
    // A max score shows the option that kept it from counting normally, or a check.
    let (_, body) = request(app.clone(), "/scores/Alice").await;
    assert!(body.contains("fa-check score-modifier green"), "{body}");
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state or failures directly"
    )]
    sqlx::raw_sql("UPDATE user_stats SET best_score2_mod=4 WHERE user_id=1")
        .execute(&db.pool)
        .await
        .unwrap();
    let (_, body) = request(app.clone(), "/scores/Alice").await;
    assert!(body.contains("#modifier-oneextracard"), "{body}");
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state or failures directly"
    )]
    sqlx::raw_sql("UPDATE user_stats SET best_score2_mod=0 WHERE user_id=1")
        .execute(&db.pool)
        .await
        .unwrap();
    // A player's time counts each game once rather than once per player.
    let (_, body) = request(app.clone(), "/scores/Alice").await;
    let values = stats_values(&body);
    assert_eq!(
        values[1..5],
        [
            "2 (1 normally finished)",
            "2 hours and 0 minutes",
            "1",
            "1 hour and 0 minutes",
        ],
        "{values:?}"
    );
    let (status, body) = request(
        app.clone(),
        "/scores/%3Cscript%3Ealert%281%29%3C%2Fscript%3E",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!body.contains("<script>alert(1)</script>"));
    assert!(body.contains("&lt;script&gt;"));
    assert!(body.contains("/history/%3Cscript%3Ealert%281%29%3C%2Fscript%3E"));
    let (_, body) = request(app.clone(), "/missing-scores/Alice/2").await;
    assert!(!body.contains("<td>No Variant</td>"));
    let (_, body) = request(
        app.clone(),
        "/shared-missing-scores/2/Alice/Bob?excludePlayers=Alice",
    )
    .await;
    assert!(body.contains("<td>No Variant</td>"));
    for (path, status, text) in [
        ("/scores", 404, "specify a player"),
        ("/history/Missing/Alice/alice", 404, "does not exist"),
        ("/api/v1/history/Alice/alice", 404, "same player twice"),
        (
            "/api/v1/history/Alice?filter[score]=no",
            400,
            "Invalid numeric filter",
        ),
        (
            "/api/v1/history/Alice?offset=9007199254740992&limit=100",
            400,
            "The offset must be",
        ),
        ("/api/v1/seed/same?limit=0", 400, "The limit must be"),
        // Every URL rejects a parameter that it does not take, or one repeated.
        ("/api/v1/history/Alice?limit=0", 400, "The limit must be"),
        ("/api/v1/history/Alice?offset=-1", 400, "The offset must be"),
        (
            "/api/v1/history/Alice?utm_source=x",
            400,
            "This URL takes: offset",
        ),
        (
            "/api/v1/history/Alice?limit=1&limit=2",
            400,
            "more than once",
        ),
        ("/api/v1/history/Alice?order=up", 400, "asc or desc"),
        ("/api/v1/history/Alice?sort=variant", 400, "Sort by one of"),
        (
            "/api/v1/history/Alice?filter[score]=",
            400,
            "Invalid numeric filter",
        ),
        (
            "/api/v1/seed/same?filter[numPlayers]=2",
            400,
            "Unknown query parameter",
        ),
        ("/api/v1/variants?offset=1", 400, "takes no parameters"),
        ("/api/v1/history/Alice?start=x", 400, "must be an integer"),
        ("/history/Alice?api=1", 400, "takes no value"),
        ("/scores/Alice?api", 400, "takes no parameters"),
        ("/lobby?utm_source=x", 400, "Unknown query parameter"),
        ("/lobby?login=", 400, "cannot be empty"),
        (
            "/missing-scores/Alice?excludePlayers=Bob",
            400,
            "takes no parameters",
        ),
        ("/api/v1/seed/same?limit=101", 400, "The limit must be"),
        ("/api/v1/seed/same?offset=-1", 400, "The offset must be"),
        (
            "/api/v1/seed/same?limit=100&offset=9223372036854775807",
            400,
            "offset",
        ),
        ("/api/v1/history-full/Alice", 404, ""),
        ("/export", 404, "specify a database"),
        ("/export/no", 400, "not a valid database"),
        ("/export/99999", 404, "does not exist"),
        ("/shared-missing-scores/2/Alice", 404, "specify at least"),
        (
            "/shared-missing-scores/2/Alice/Bob?excludePlayers=Alice,Bob",
            400,
            "exclude every",
        ),
        (
            "/shared-missing-scores/2/Alice/Bob?minEfficiency=nan",
            400,
            "minimum efficiency",
        ),
        ("/api/v1/tag/%20", 404, "cannot be blank"),
    ] {
        let (actual, body) = request(app.clone(), path).await;
        assert_eq!(actual.as_u16(), status, "{path}: {body}");
        assert!(body.contains(text), "{path}: {body}");
    }
    sqlx::query!("INSERT INTO banned_ips(ip) VALUES('127.0.0.5')")
        .execute(&db.pool)
        .await
        .unwrap();
    let mut req = Request::builder()
        .uri("/api/v1/variants")
        .body(Body::empty())
        .unwrap();
    req.extensions_mut()
        .insert(ConnectInfo("127.0.0.5:9999".parse::<SocketAddr>().unwrap()));
    let (status, body) = response(app.clone().oneshot(req).await.unwrap()).await;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let error: hanabi_protocol::Notice = serde_json::from_str(&body).unwrap();
    assert!(error.message.contains("banned"));
    let redirect = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/history/Alice/Bob?api")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(redirect.status(), StatusCode::PERMANENT_REDIRECT);
    assert_eq!(redirect.headers()["location"], "/api/v1/history/Alice/Bob");
    let cookie =
        crate::cookie::encode(1, "public-test-secret", chrono::Utc::now().timestamp()).unwrap();
    let req = Request::builder()
        .uri("/")
        .header("Cookie", format!("hanabi.sid={cookie}"))
        .body(Body::empty())
        .unwrap();
    let (status, body) = response(app.clone().oneshot(req).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("data-authenticated=\"true\""));
    #[expect(clippy::disallowed_methods, reason = "test SQL that sets up database state or failures directly")]
    sqlx::raw_sql(
        "INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
        SELECT id,'Player'||id,'player'||id,'test','127.0.0.1' FROM generate_series(4,8) id;
        INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,
        speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
        detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
        SELECT 4,name,6,variant_id,timed,time_base,time_per_turn,
        speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
        detrimental_characters,'six-player',score,num_turns,end_condition,datetime_started,datetime_finished
        FROM games WHERE id=1;
        INSERT INTO game_participants(game_id,user_id,seat)
        SELECT 4,id,id-3 FROM generate_series(4,8) id;
        INSERT INTO game_participants(game_id,user_id,seat) VALUES(4,1,0);")
        .execute(&db.pool).await.unwrap();
    let (status, body) = request(
        app.clone(),
        "/api/v1/history/Alice/Player4/Player5/Player6/Player7/Player8",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let value: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(value["total"], 1);
    assert_eq!(value["games"][0]["gameId"], 4);
    let (status, body) = request(
        app.clone(),
        "/shared-missing-scores/6/Alice/Player4/Player5/Player6/Player7/Player8",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("missing-scores-row-players-6"));
    sqlx::query!("UPDATE game_participants SET seat=3 WHERE game_id=1 AND user_id=2")
        .execute(&db.pool)
        .await
        .unwrap();
    let (status, body) = request(app, "/export/1").await;
    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    assert!(body.contains("players do not match its seats: 1"), "{body}");
    db.close().await;
}

#[tokio::test]
async fn seed_page_ranks_the_seed_among_seeds_with_its_prefix() {
    let Some(db) = crate::accounts::test_support::TestDb::create().await else {
        return;
    };
    // The seeds' averages are 25, 20, 20, and 10. The "e" seed has another hand size, so it is not
    // compared.
    #[expect(
        clippy::disallowed_methods,
        reason = "test SQL that sets up database state directly"
    )]
    sqlx::raw_sql(
        "INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
          deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
          seed,score,num_turns,end_condition,datetime_started,datetime_finished)
        SELECT id,'test',2,0,false,NULL,NULL,false,false,false,false,false,false,false,seed,score,10,1,
          '2026-01-01T00:00:00Z','2026-01-01T01:00:00Z'
        FROM (VALUES(1,'p2v0s1',25),(2,'p2v0s2',15),(3,'p2v0s2',25),(4,'p2v0s3',20),(5,'p2v0s4',10),
          (6,'p2v0e1',0)) AS g(id,seed,score);",
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let app = router(db.pool.clone(), &config());
    let (status, body) = request(app, "/seed/p2v0s2").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let text = body.split_whitespace().collect::<Vec<_>>().join(" ");
    for expected in [
        "1 / 2 &nbsp;(50%)",
        "20.0 / 25",
        // Harder than the seed that averages 25, and tied with the other seed that averages 20.
        "harder than 50% of the 3 other 2-player seeds of No Variant",
    ] {
        assert!(text.contains(expected), "{expected}: {text}");
    }
}
