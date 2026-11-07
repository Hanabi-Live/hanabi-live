use super::*;
use crate::accounts::{normalize_username, test_support::TestDb};

fn caller(id: i32, name: &str) -> Caller {
    Caller {
        id,
        name: name.into(),
        normalized_name: normalize_username(name),
        ip: "127.0.0.1".into(),
        generation: 17,
    }
}

fn self_data(effects: &[Effect], command: &str) -> Value {
    effects
        .iter()
        .find_map(|effect| match effect {
            Effect::ToSelf {
                command: actual,
                data,
            } if actual == command => Some(data.clone()),
            _ => None,
        })
        .unwrap_or_else(|| panic!("Missing {command} in {effects:?}"))
}

#[tokio::test]
async fn uptime_is_private_before_history_or_discord_publication_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let user = db.user("Alice").await;
    let who = caller(user, "Alice");
    let before: i64 = sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    let history_before = lobby_history(&db.pool, 100).await.unwrap();
    for room in ["lobby", "table42"] {
        let effects = dispatch_chat(&db.pool, "secret", &who, "/UpTiMe", room, None)
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(effects.as_slice(),
            [Effect::RuntimeChat { command, room: response_room, .. }]
            if command == "uptime" && response_room == room
        ));
    }
    assert!(matches!(classify_chat("/UpTiMe"), Classification::Private));
    assert!(
        external_command(&db.pool, "/uptime")
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        before
    );
    sqlx::query!(
        "INSERT INTO chat_log(user_id,source,message,room) VALUES($1,'user','/UpTiMe','lobby')",
        user
    )
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(lobby_history(&db.pool, 100).await.unwrap(), history_before);
    db.close().await;
}

async fn run(
    pool: &PgPool,
    caller: &Caller,
    online: &[OnlineUser],
    command: &str,
    data: Value,
) -> Vec<Effect> {
    dispatch(
        pool,
        "synthetic-lobby-secret",
        caller,
        online,
        command,
        data,
    )
    .await
    .unwrap()
    .unwrap()
}

#[tokio::test]
async fn lobby_relationships_atomic_settings_and_parameterization_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let a = db.user("Alice").await;
    let b = db.user("Bob").await;
    let who = caller(a, "Alice");
    let data = json!({"name":"bób","room":"lobby"});
    let result = run(&db.pool, &who, &[], "chatFriend", data.clone()).await;
    assert_eq!(self_data(&result, "friends"), json!({"friends":["Bob"]}));
    let repeated = run(&db.pool, &who, &[], "chatFriend", data.clone()).await;
    assert!(
        self_data(&repeated, "warning")["warning"]
            .as_str()
            .unwrap()
            .contains("already")
    );
    let _ = run(&db.pool, &who, &[], "chatUnfriend", data.clone()).await;
    assert!(friends(&db.pool, a).await.unwrap().is_empty());
    let (one, two) = tokio::join!(
        change_friend(&db.pool, a, b, true),
        change_friend(&db.pool, a, b, true)
    );
    assert_ne!(one.unwrap(), two.unwrap());
    let result = run(
        &db.pool,
        &who,
        &[],
        "setting",
        json!({"name":"hyphenatedConventions","setting":"true"}),
    )
    .await;
    assert!(matches!(result.as_slice(), [Effect::Hyphenated(true)]));
    assert_eq!(
        get_settings(&db.pool, a).await.unwrap()["hyphenatedConventions"],
        true
    );
    assert!(set_setting(&db.pool, a, "volume", "101").await.is_err());
    assert!(set_setting(&db.pool, a, "volume", "2.1").await.is_err());
    assert!(
        set_setting(&db.pool, a, "soundTimer", "TRUE")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, a, "createTableTimeBaseMinutes", "NaN")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, a, "volume=0; DROP TABLE users;--", "0")
            .await
            .is_err()
    );
    let literal = "x'; DROP TABLE users; --";
    set_setting(&db.pool, a, "createTableVariant", literal)
        .await
        .unwrap();
    assert_eq!(
        get_settings(&db.pool, a).await.unwrap()["createTableVariant"],
        literal
    );
    let (one, two) = tokio::join!(
        set_setting(&db.pool, b, "soundTimer", "false"),
        set_setting(&db.pool, b, "volume", "25")
    );
    one.unwrap();
    two.unwrap();
    assert_eq!(
        sqlx::query_scalar!(
            "SELECT COUNT(*) AS \"v!\" FROM user_settings WHERE user_id=$1",
            b
        )
        .fetch_one(&db.pool)
        .await
        .unwrap(),
        1
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "chatPlayerInfo",
        json!({"name":"Bob","room":"lobby"}),
    )
    .await;
    assert!(
        self_data(&result, "chat")["msg"]
            .as_str()
            .unwrap()
            .contains("0 non-speedrun")
    );
    let result = run(&db.pool, &who, &[], "inactive", json!({"inactive":true})).await;
    assert!(matches!(result.first(), Some(Effect::Inactive(true))));
    db.close().await;
}

#[tokio::test]
async fn lobby_private_messages_and_command_privacy_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let a = db.user("Alice").await;
    let b = db.user("Bob").await;
    let c = db.user("Carol").await;
    let who = caller(a, "Alice");
    let target = OnlineUser {
        id: b,
        name: "Bob".into(),
        normalized_name: "bob".into(),
        generation: 29,
    };
    let online = vec![target];
    let effects = run(
        &db.pool,
        &who,
        &online,
        "chatPM",
        json!({"msg":" <secret> ","recipient":"bób"}),
    )
    .await;
    let message = self_data(&effects, "chat");
    assert_eq!(message["msg"], "&lt;secret&gt;");
    assert_eq!(message["recipient"], "Bob");
    assert!(message.get("chatID").is_none());
    assert_eq!(effects.len(), 2);
    assert!(effects.iter().all(|effect| match effect {
        Effect::ToSelf { .. } => true,
        Effect::ToUser { id, .. } => *id == b,
        _ => false,
    }));
    assert!(
        effects
            .iter()
            .any(|e| matches!(e,Effect::ToUser {id,generation:29,..} if *id==b))
    );
    let stored = sqlx::query!("SELECT id,datetime_sent FROM chat_log_pm")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(message["pmID"], stored.id);
    assert_eq!(message["datetime"], chat::datetime(stored.datetime_sent));
    sqlx::query!(
        "INSERT INTO chat_log_pm(user_id,recipient_id,message) VALUES($1,$2,'not Alice')",
        b,
        c
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let result = run(
        &db.pool,
        &who,
        &[],
        "chatPMHistoryGet",
        json!({"amount":1,"username":"BOB","room":"pmBob"}),
    )
    .await;
    let history = self_data(&result, "chatPMHistory");
    assert_eq!(history["list"].as_array().unwrap().len(), 1);
    assert_eq!(history["list"][0]["msg"], "&lt;secret&gt;");
    assert_eq!(history["hasMore"], false);
    let carol = caller(c, "Carol");
    let result = run(
        &db.pool,
        &carol,
        &[],
        "chatPMHistoryGet",
        json!({"amount":10,"username":"Alice"}),
    )
    .await;
    assert!(
        self_data(&result, "chatPMHistory")["list"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "chatPMHistoryGet",
        json!({"amount":10,"beforeID":message["pmID"]}),
    )
    .await;
    assert!(
        self_data(&result, "chatPMHistory")["list"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    for text in ["/not-a-command private", "/token extra", "/help"] {
        let result = run(
            &db.pool,
            &who,
            &[],
            "chat",
            json!({"msg":text,"room":"lobby"}),
        )
        .await;
        assert!(
            result
                .iter()
                .all(|effect| matches!(effect, Effect::ToSelf { .. }))
        );
    }
    let result = run(
        &db.pool,
        &who,
        &[],
        "chat",
        json!({"msg":"/ToKeN","room":"table42"}),
    )
    .await;
    assert!(
        self_data(&result, "chat")["msg"]
            .as_str()
            .unwrap()
            .contains("<code>")
    );
    assert!(
        dispatch(
            &db.pool,
            "synthetic-lobby-secret",
            &who,
            &[],
            "chat",
            json!({"msg":"not lobby","room":"table42"})
        )
        .await
        .unwrap()
        .is_none()
    );
    assert!(
        dispatch(
            &db.pool,
            "synthetic-lobby-secret",
            &who,
            &[],
            "chat",
            json!({"msg":"/findvariant","room":"table42"})
        )
        .await
        .unwrap()
        .is_none()
    );
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log WHERE source='user'")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        0
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "chat",
        json!({"msg":"/rules","room":"lobby"}),
    )
    .await;
    assert_eq!(
        result
            .iter()
            .filter(|e| matches!(e, Effect::Broadcast { .. }))
            .count(),
        2
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "chat",
        json!({"msg":"<plain>","room":"lobby"}),
    )
    .await;
    assert!(
        result
            .iter()
            .any(|e| matches!(e,Effect::Broadcast {data,..} if data["msg"]=="&lt;plain&gt;"))
    );
    let before: i64 = sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    sqlx::query!("INSERT INTO muted_ips(ip) VALUES('127.0.0.1')")
        .execute(&db.pool)
        .await
        .unwrap();
    let result = run(
        &db.pool,
        &who,
        &online,
        "chatPM",
        json!({"msg":"muted","recipient":"Bob"}),
    )
    .await;
    assert!(
        self_data(&result, "warning")["warning"]
            .as_str()
            .unwrap()
            .contains("muted")
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "chat",
        json!({"msg":"muted","room":"lobby"}),
    )
    .await;
    assert!(
        self_data(&result, "warning")["warning"]
            .as_str()
            .unwrap()
            .contains("muted")
    );
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        before
    );
    sqlx::query!("INSERT INTO chat_log(user_id,source,message,room) VALUES($1,'user','/token legacy-secret','lobby'),($1,'user','/unknown secret','lobby')", a).execute(&db.pool).await.unwrap();
    let history = lobby_history(&db.pool, 100).await.unwrap();
    assert!(
        !history
            .iter()
            .any(|r| r["msg"].as_str().unwrap().contains("secret"))
    );
    db.close().await;
}

async fn game(db: &TestDb, user: i32, seed: &str, score: i16) -> i32 {
    let id = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
            speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,
            all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
         VALUES('test',2,0,false,120,20,false,false,false,false,false,false,false,false,$1,$2,30,1,NOW(),NOW())
         RETURNING id", seed, score).fetch_one(&db.pool).await.unwrap();
    sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
         VALUES($1,$2,0,0,0)", id, user).execute(&db.pool).await.unwrap();
    id
}

#[tokio::test]
async fn lobby_history_pages_include_only_own_games_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let a = db.user("Alice").await;
    let b = db.user("Bob").await;
    let d = db.user("Donald").await;
    let own = game(&db, a, "p2v0s1", 20).await;
    let other = game(&db, b, "p2v0s2", 20).await;
    let shared = game(&db, a, "p2v0s4", 20).await;
    sqlx::query!("INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata) VALUES($1,$2,1,0,0)", shared, b).execute(&db.pool).await.unwrap();
    change_friend(&db.pool, a, b, true).await.unwrap();
    sqlx::query!(
        "UPDATE games SET datetime_finished='2026-11-04T00:00:00Z' WHERE id=ANY($1)",
        &[own, other, shared][..]
    )
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        history_ids(&db.pool, a, 0, 10).await.unwrap(),
        vec![shared, own]
    );
    assert_eq!(history_ids(&db.pool, a, 1, 1).await.unwrap(), vec![own]);
    assert_eq!(
        history_ids(&db.pool, a, 99, 0).await.unwrap(),
        vec![shared, own]
    );
    assert!(history_ids(&db.pool, a, 99, 10).await.unwrap().is_empty());
    assert!(history_ids(&db.pool, d, 0, 10).await.unwrap().is_empty());
    db.close().await;
}

#[tokio::test]
async fn lobby_directed_linked_seeds_and_histories_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let a = db.user("Alice").await;
    let b = db.user("Bob").await;
    let c = db.user("Carol").await;
    let who = caller(a, "Alice");
    let ga = game(&db, a, "p2v0s1", 20).await;
    let gb = game(&db, b, "p2v0s1", 25).await;
    let _gc = game(&db, c, "p2v0s2", 15).await;
    let _ = run(&db.pool, &who, &[], "chatLink", json!({"name":"Bob"})).await;
    let _ = run(
        &db.pool,
        &caller(b, "Bob"),
        &[],
        "chatLink",
        json!({"name":"Carol"}),
    )
    .await;
    assert_eq!(
        blocked_seeds(&db.pool, &[a], "p2v0s").await.unwrap(),
        vec!["p2v0s1"]
    );
    assert_eq!(
        blocked_seeds(&db.pool, &[c], "p2v0s").await.unwrap(),
        vec!["p2v0s2"]
    );
    assert!(
        blocked_seeds(&db.pool, &[a], "p3v0s")
            .await
            .unwrap()
            .is_empty()
    );
    assert!(
        self_data(
            &run(&db.pool, &who, &[], "chatLinked", json!({})).await,
            "chat"
        )["msg"]
            .as_str()
            .unwrap()
            .ends_with("Bob")
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "historyGet",
        json!({"offset":0,"amount":10}),
    )
    .await;
    let history = self_data(&result, "gameHistory");
    assert_eq!(history[0]["id"], ga);
    assert_eq!(history[0]["options"]["variantName"], "No Variant");
    assert_eq!(history[0]["playerNames"], json!(["Alice"]));
    let result = run(
        &db.pool,
        &who,
        &[],
        "historyGetSeed",
        json!({"seed":"p2v0s1"}),
    )
    .await;
    let history = self_data(&result, "gameHistoryOtherScores");
    assert_eq!(history["games"][0]["id"], gb);
    assert_eq!(history["games"][1]["id"], ga);
    sqlx::query!(
        "INSERT INTO game_tags(game_id,user_id,tag) VALUES($1,$2,$3)",
        ga,
        a,
        "x'; delete from users; --"
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let result = run(
        &db.pool,
        &who,
        &[],
        "tagSearch",
        json!({"msg":"x'; delete from users; --","room":"lobby"}),
    )
    .await;
    assert!(
        self_data(&result, "chat")["msg"]
            .as_str()
            .unwrap()
            .ends_with(&ga.to_string())
    );
    assert_eq!(
        sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM users")
            .fetch_one(&db.pool)
            .await
            .unwrap(),
        3
    );
    let _ = run(&db.pool, &who, &[], "chatUnlink", json!({"name":"Bob"})).await;
    assert!(
        self_data(
            &run(&db.pool, &who, &[], "chatLinked", json!({})).await,
            "chat"
        )["msg"]
            .as_str()
            .unwrap()
            .contains("do not have")
    );
    db.close().await;
}

#[tokio::test]
async fn every_setting_round_trips_through_its_column_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let id = db.user("Alice").await;
    let defaults = get_settings(&db.pool, id).await.unwrap();
    let names: Vec<_> = defaults.as_object().unwrap().keys().cloned().collect();
    let mut expected: Vec<_> = settings::FIELDS
        .iter()
        .map(|(name, _)| (*name).to_owned())
        .collect();
    expected.sort();
    assert_eq!(names, expected, "Stored settings and setting names differ");
    for (name, kind) in settings::FIELDS {
        let (value, stored) = match kind {
            settings::Kind::Bool => {
                let flipped = !defaults[name].as_bool().unwrap();
                (flipped.to_string(), json!(flipped))
            }
            settings::Kind::SmallInt | settings::Kind::Int => ("7".into(), json!(7)),
            settings::Kind::Float => ("7.5".into(), json!(7.5)),
            settings::Kind::Text => ("Rainbow (6 Suits)".into(), json!("Rainbow (6 Suits)")),
        };
        assert_ne!(defaults[name], stored, "{name} must change");
        set_setting(&db.pool, id, name, &value).await.unwrap();
        assert_eq!(
            get_settings(&db.pool, id).await.unwrap()[name],
            stored,
            "{name}"
        );
    }
    db.close().await;
}
