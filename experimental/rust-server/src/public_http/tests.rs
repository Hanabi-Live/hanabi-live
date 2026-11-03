// cspell:ignore Cscript Ealert Fscript
use super::*;
use axum::{
    body::{Body, to_bytes},
    http::Request,
};
use sqlx::{
    Connection, Executor,
    postgres::{PgConnectOptions, PgConnection, PgPoolOptions},
};
use std::str::FromStr;
use tower::ServiceExt;

fn config() -> PublicConfig {
    PublicConfig {
        root: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.."),
        session_secret: "public-test-secret".into(),
        domain: "localhost".into(),
        use_tls: false,
        client_version: "test-version".into(),
        is_dev: false,
        seeded_deck: |_, _| Ok(json!([{"suitIndex":0,"rank":1},{"suitIndex":1,"rank":2}])),
        deck_size: |_| Ok(50),
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
    let divisions =
        regex::Regex::new(r"(?s)<!--.*?-->|<script\b[^>]*>.*?</script\s*>|</?div\b[^>]*>").unwrap();
    let identifiers = regex::Regex::new(r#"\sid\s*=\s*"([^"]*)""#).unwrap();
    for development in [false, true] {
        let mut config = config();
        config.is_dev = development;
        let (status, body) = request(router(pool.clone(), config), "/").await;
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
            "page-cover",
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
            "/public/js/bundles/main.min.js"
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
    let app = router(pool, config());
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
            "id=\"nav-buttons-lobby\"",
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
    let (status, body) = request(app.clone(), "/public/html/theme-init.html").await;
    assert_eq!(status, StatusCode::OK);
    assert!(body.contains("localStorage"));
    assert_eq!(
        request(app.clone(), "/public/%2e%2e/install/database_schema.sql")
            .await
            .0,
        StatusCode::NOT_FOUND
    );
    assert_eq!(
        request(app.clone(), "/stats").await.0,
        StatusCode::NOT_FOUND
    );
    for (path, hook) in [
        ("/videos", "VrFCekQb4nY"),
        ("/password-reset", "id=\"password-reset-form\""),
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body.contains(hook));
    }
    let mut unsafe_config = config();
    unsafe_config.domain = "</div><script>alert(7)</script>".into();
    unsafe_config.client_version = "\"><script>alert(8)</script>".into();
    let app = router(
        PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@localhost/unused")
            .unwrap(),
        unsafe_config,
    );
    let (status, body) = request(app, "/").await;
    assert_eq!(status, StatusCode::OK);
    assert!(!body.contains("<script>alert(7)</script>"));
    assert!(!body.contains("<script>alert(8)</script>"));
    assert!(body.contains("&lt;script&gt;"));
}

#[test]
fn formatted_templates_preserve_conditional_links_and_selected_options() {
    let templates = pages::templates();
    let buttons = templates
        .get_template("profile-buttons.html")
        .unwrap()
        .render(json!({"name":"Alice","title":"Tagged Games"}))
        .unwrap();
    let anchors = regex::Regex::new(r"(?s)<a\b([^>]*)>(.*?)</a>").unwrap();
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
        .render(json!({
            "projectName":"Hanab Live","version":"1","isDev":false,"title":"Missing Scores",
            "name":"Alice","namesTitle":"Alice's Profile","singleMissingScores":true,
            "summary":{"perType":[],"total":0,"percentage":"0"},
            "requestedNumPlayers":3,"players":[],"rows":[]
        }))
        .unwrap();
    let options = regex::Regex::new(r"(?s)<option\b([^>]*)>.*?</option>").unwrap();
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

struct Database {
    admin: PgConnection,
    pool: PgPool,
    name: String,
}
impl Database {
    async fn create() -> Option<Self> {
        let Ok(uri) = std::env::var("HANABI_TEST_DATABASE_URL") else {
            eprintln!("Skipping public HTTP database tests; set local HANABI_TEST_DATABASE_URL.");
            return None;
        };
        let parsed = url::Url::parse(&uri).expect("test database URI");
        assert!(
            matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")),
            "Test database must be local"
        );
        for (key, value) in parsed.query_pairs() {
            if key == "host" {
                assert!(
                    value.starts_with('/') || matches!(&*value, "localhost" | "127.0.0.1" | "::1"),
                    "Test database host must be local"
                );
            }
        }
        let options = PgConnectOptions::from_str(&uri).unwrap();
        let mut admin = PgConnection::connect_with(&options).await.unwrap();
        let name = format!("ts_slice_rust_public_{:016x}", rand::random::<u64>());
        admin
            .execute(format!("CREATE DATABASE {name}").as_str())
            .await
            .unwrap();
        let pool = PgPoolOptions::new()
            .max_connections(3)
            .connect_with(options.database(&name))
            .await
            .unwrap();
        sqlx::raw_sql(include_str!("../../../../install/database_schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        Some(Self { admin, pool, name })
    }
    async fn close(mut self) {
        self.pool.close().await;
        self.admin
            .execute(format!("DROP DATABASE {} WITH (FORCE)", self.name).as_str())
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn public_database_routes_filters_privacy_exports_and_html() {
    let Some(db) = Database::create().await else {
        return;
    };
    sqlx::raw_sql(
        "INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES
        (1,'Alice','alice','test','127.0.0.1'),(2,'Bob','bob','test','127.0.0.1'),
        (3,'<script>alert(1)</script>','<script>alert(1)</script>','test','127.0.0.1');
        INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,
          card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,
          seed,score,num_turns,end_condition,datetime_started,datetime_finished)
        SELECT id,'test',2,CASE WHEN id=3 THEN 1 ELSE 0 END,id=3,120,20,id=3,
          id=3,id=3,id=3,id=3,id=3,id=3,id=3,
          CASE WHEN id=3 THEN 'custom-seed' ELSE 'same' END,
          CASE WHEN id=1 THEN 25 WHEN id=2 THEN 15 ELSE 0 END,10,CASE WHEN id=2 THEN 2 ELSE 1 END,
          '2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T01:00:00Z'::timestamptz FROM generate_series(1,3) id;
        INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
          VALUES(1,1,0,-1,0),(1,2,1,-1,0),(2,1,0,-1,0),(2,3,1,-1,0),(3,1,0,0,2),(3,2,1,-1,0);
        INSERT INTO seeds(seed,num_games) VALUES('same',2),('custom-seed',1);
        INSERT INTO game_tags(game_id,user_id,tag) VALUES(1,1,'mine'),(1,2,'other'),(3,1,'mine');
        INSERT INTO game_actions(game_id,turn,type,target,value) VALUES(3,0,0,4,0),(3,1,4,0,1);
        INSERT INTO game_custom_decks(game_id,deck) VALUES(3,decode('82090a','hex'));
        INSERT INTO game_participant_notes(game_participant_id,card_order,note)
          SELECT id,0,'<note>' FROM game_participants WHERE game_id=3 AND user_id=1;
        INSERT INTO user_stats(user_id,variant_id,num_games,best_score2,best_score2_mod) VALUES(1,0,2,25,0);
        INSERT INTO variant_stats(variant_id,num_games,best_score2,num_max_scores) VALUES(0,2,25,1);")
        .execute(&db.pool).await.unwrap();
    let app = router(db.pool.clone(), config());
    for (path, total, len) in [
        ("/api/v1/history/Alice?size=1", 3, 1),
        ("/api/v1/history/Alice/Bob?fcol%5B2%5D=25", 1, 1),
        ("/api/v1/history/Alice?fcol%5B3%5D=1", 1, 1),
        ("/api/v1/seed/same?fcol%5B2%5D=15", 1, 1),
        ("/api/v1/variants/0?fcol%5B2%5D=25", 1, 1),
        ("/api/v1/history/Alice?size=0", 3, 0),
        ("/api/v1/history/Alice?page=2&size=2", 3, 0),
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        let value: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(value["total_rows"], total, "{path}");
        assert_eq!(value["rows"].as_array().unwrap().len(), len, "{path}");
    }
    let (status, body) = request(app.clone(), "/api/v1/history/Alice?col%5B2%5D=0&size=1").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        serde_json::from_str::<Value>(&body).unwrap()["rows"][0]["id"],
        3
    );
    let (_, body) = request(app.clone(), "/api/v1/history-full/Alice?start=3&end=3").await;
    let full: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(full.as_array().unwrap().len(), 1);
    for key in [
        "timed",
        "speedrun",
        "cardCycle",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
        "detrimentalCharacters",
    ] {
        assert_eq!(full[0]["options"][key], true);
    }
    assert_eq!(full[0]["options"]["variantName"], "6 Suits");
    let (_, body) = request(app.clone(), "/api/v1/tags/Alice").await;
    let tagged: Value = serde_json::from_str(&body).unwrap();
    assert_eq!(tagged.as_array().unwrap().len(), 2);
    assert!(
        tagged
            .as_array()
            .unwrap()
            .iter()
            .all(|g| g["tags"] == "mine")
    );
    let (_, body) = request(app.clone(), "/api/v1/tag/%20MINE%20").await;
    assert_eq!(
        serde_json::from_str::<Value>(&body)
            .unwrap()
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let (status, body) = request(app.clone(), "/export/3").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let export: Value = serde_json::from_str(&body).unwrap();
    assert!(export.get("seed").is_none());
    assert_eq!(
        export["deck"],
        json!([{"suitIndex":1,"rank":1},{"suitIndex":1,"rank":2}])
    );
    assert_eq!(export["actions"].as_array().unwrap().len(), 2);
    assert_eq!(export["notes"], json!([["<note>"], []]));
    assert_eq!(
        export["characters"][0],
        json!({"name":"Fuming","metadata":1})
    );
    assert_eq!(export["options"]["variant"], "6 Suits");
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
        "/variant/0",
        "/tag/mine",
        "/missing-scores/Alice/2",
        "/shared-missing-scores/2/Alice/Bob",
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{path}: {body}");
        assert!(body.contains("id=\"main\""), "{path}");
    }
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
    let (_, body) = request(app.clone(), "/variant/0").await;
    assert!(body.contains("4 hours and 0 minutes"), "{body}");
    for (path, status, text) in [
        ("/scores", 404, "specify a player"),
        ("/history/Missing/Alice/alice", 404, "does not exist"),
        ("/api/v1/history/Alice/alice", 404, "same player twice"),
        (
            "/api/v1/history/Alice?fcol%5B2%5D=no",
            400,
            "Invalid numeric filter",
        ),
        (
            "/api/v1/history/Alice?page=9223372036854775807&size=100",
            400,
            "offset is too large",
        ),
        ("/variant/no", 400, "must be a number"),
        ("/variant/99999", 400, "not a valid variant"),
        ("/export", 404, "specify a database"),
        ("/export/no", 400, "not a valid database"),
        ("/export/99999", 404, "does not exist"),
        ("/shared-missing-scores/2/Alice", 404, "at least two"),
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
    sqlx::query("INSERT INTO banned_ips(ip) VALUES('127.0.0.5')")
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
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body.contains("banned"));
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
    let req = Request::builder()
        .method("POST")
        .uri("/password-reset")
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(Body::from("password=secret"))
        .unwrap();
    let (status, body) = response(app.clone().oneshot(req).await.unwrap()).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    use argon2::PasswordVerifier;
    argon2::Argon2::default()
        .verify_password(b"secret", &argon2::PasswordHash::new(&body).unwrap())
        .unwrap();
    sqlx::raw_sql(
        "INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
        SELECT id,'Player'||id,'player'||id,'test','127.0.0.1' FROM generate_series(4,8) id;
        INSERT INTO games SELECT 4,name,6,starting_player,variant_id,timed,time_base,time_per_turn,
        speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,
        detrimental_characters,'six-player',score,num_turns,end_condition,datetime_started,datetime_finished
        FROM games WHERE id=1;
        INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
        SELECT 4,id,id-3,-1,0 FROM generate_series(4,8) id;
        INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata) VALUES(4,1,0,-1,0);")
        .execute(&db.pool).await.unwrap();
    for path in [
        "/api/v1/history/Alice/Player4/Player5/Player6/Player7/Player8",
        "/api/v1/history-full/Alice/Player4/Player5/Player6/Player7/Player8",
    ] {
        let (status, body) = request(app.clone(), path).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        let value: Value = serde_json::from_str(&body).unwrap();
        if value.is_array() {
            assert_eq!(value[0]["id"], 4);
        } else {
            assert_eq!(value["total_rows"], 1);
        }
    }
    let (status, body) = request(
        app.clone(),
        "/shared-missing-scores/6/Alice/Player4/Player5/Player6/Player7/Player8",
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body.contains("missing-scores-row-players-6"));
    let variant = hanabi_engine::get_variant("Up or Down (5 Suits)").unwrap();
    let mut deck = hanabi_engine::create_deck(variant);
    deck.truncate(11);
    assert!(deck.iter().any(|card| card.rank == 7));
    sqlx::query("UPDATE games SET variant_id=$1 WHERE id=3")
        .bind(variant.id as i16)
        .execute(&db.pool)
        .await
        .unwrap();
    sqlx::query("UPDATE game_custom_decks SET deck=$1 WHERE game_id=3")
        .bind(crate::game::encode_deck(&deck).unwrap())
        .execute(&db.pool)
        .await
        .unwrap();
    let (status, body) = request(app.clone(), "/export/3").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        serde_json::from_str::<Value>(&body).unwrap()["deck"],
        json!(deck)
    );
    for encoded in ["813f", "8106"] {
        sqlx::query("UPDATE game_custom_decks SET deck=decode($1,'hex') WHERE game_id=3")
            .bind(encoded)
            .execute(&db.pool)
            .await
            .unwrap();
        let (status, body) = request(app.clone(), "/export/3").await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR, "{body}");
    }
    sqlx::query("UPDATE game_participants SET seat=3 WHERE game_id=1 AND user_id=2")
        .execute(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        request(app, "/export/1").await.0,
        StatusCode::INTERNAL_SERVER_ERROR
    );
    db.close().await;
}
