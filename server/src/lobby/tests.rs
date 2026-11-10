use super::*;
use crate::accounts::{normalize_username, test_support::TestDb};
use serde_json::{Value, json};

fn caller(id: i32, name: &str) -> Identity {
    Identity {
        user: UserId(id),
        name: name.into(),
        normalized_name: normalize_username(name),
        ip: "127.0.0.1".into(),
        bot: false,
    }
}

fn self_data(effects: &[Effect], command: &str) -> Value {
    effects
        .iter()
        .find_map(|effect| match effect {
            Effect::Publish(Publication::ToSelf(message)) if message.command() == command => {
                Some(message.data().clone())
            }
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
        let message =
            crate::actors::client_message("chat", &json!({"msg":"/UpTiMe","room":room})).unwrap();
        let effects = dispatch(&db.pool, "secret", &who, &[], None, message)
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
            .is_none()
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
    caller: &Identity,
    online: &[OnlineUser],
    command: &str,
    data: Value,
) -> Vec<Effect> {
    dispatch(
        pool,
        "synthetic-lobby-secret",
        caller,
        online,
        None,
        crate::actors::client_message(command, &data).unwrap(),
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
    assert_eq!(
        friends(&db.pool, UserId(a)).await.unwrap(),
        Vec::<String>::new()
    );
    let (one, two) = tokio::join!(
        relationships::change_friend(&db.pool, UserId(a), UserId(b), true),
        relationships::change_friend(&db.pool, UserId(a), UserId(b), true)
    );
    assert_ne!(one.unwrap(), two.unwrap());
    let result = run(
        &db.pool,
        &who,
        &[],
        "setting",
        json!({"name":"hGroupConventions","setting":"true"}),
    )
    .await;
    assert!(matches!(
        result.as_slice(),
        [Effect::Publish(Publication::HGroup(true))]
    ));
    assert_eq!(
        serde_json::to_value(get_settings(&db.pool, UserId(a)).await.unwrap()).unwrap()["hGroupConventions"],
        true
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "setting",
        json!({"name":"hGroupLevel","setting":"5"}),
    )
    .await;
    assert!(matches!(
        result.as_slice(),
        [Effect::Publish(Publication::HGroupLevel(5))]
    ));
    let too_high = (hanabi_protocol::MAX_H_GROUP_LEVEL + 1).to_string();
    assert!(
        set_setting(&db.pool, UserId(a), "hGroupLevel", &too_high)
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, UserId(a), "volume", "101")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, UserId(a), "volume", "2.1")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, UserId(a), "soundTimer", "TRUE")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, UserId(a), "createTableTimeBaseMinutes", "NaN")
            .await
            .is_err()
    );
    assert!(
        set_setting(&db.pool, UserId(a), "volume=0; DROP TABLE users;--", "0")
            .await
            .is_err()
    );
    let literal = "x'; DROP TABLE users; --";
    set_setting(&db.pool, UserId(a), "createTableVariant", literal)
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(get_settings(&db.pool, UserId(a)).await.unwrap()).unwrap()["createTableVariant"],
        literal
    );
    let (one, two) = tokio::join!(
        set_setting(&db.pool, UserId(b), "soundTimer", "false"),
        set_setting(&db.pool, UserId(b), "volume", "25")
    );
    one.unwrap();
    two.unwrap();
    // Concurrent changes to different settings are both kept.
    let settings = serde_json::to_value(get_settings(&db.pool, UserId(b)).await.unwrap()).unwrap();
    assert_eq!(settings["soundTimer"], false);
    assert_eq!(settings["volume"], 25);
    let result = run(&db.pool, &who, &[], "inactive", json!({"inactive":true})).await;
    assert!(matches!(
        result.first(),
        Some(Effect::Publish(Publication::Inactive(true)))
    ));
    db.close().await;
}

#[tokio::test]
async fn blocked_players_cannot_message_each_other_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let a = db.user("Alice").await;
    let b = db.user("Bob").await;
    let alice = caller(a, "Alice");
    let bob = caller(b, "Bob");
    let online_user = |id, name: &str| OnlineUser {
        identity: Arc::new(caller(id, name)),
        generation: 1,
    };
    let online = vec![online_user(a, "Alice"), online_user(b, "Bob")];
    let warning_of = |effects: &[Effect]| {
        self_data(effects, "warning")["warning"]
            .as_str()
            .unwrap()
            .to_owned()
    };
    let notice_of = |effects: &[Effect]| {
        self_data(effects, "chat")["msg"]
            .as_str()
            .unwrap()
            .to_owned()
    };
    let bob_name = json!({"name":"bob","room":"lobby"});

    let blocked = run(&db.pool, &alice, &[], "chatBlock", bob_name.clone()).await;
    assert!(notice_of(&blocked).contains("Successfully blocked"));
    assert_eq!(self_data(&blocked, "blocked"), json!({"blocked":["Bob"]}));
    let repeated = run(&db.pool, &alice, &[], "chatBlock", bob_name.clone()).await;
    assert!(warning_of(&repeated).contains("already blocked"));
    let list = run(
        &db.pool,
        &alice,
        &[],
        "chatBlocked",
        json!({"room":"lobby"}),
    )
    .await;
    assert_eq!(notice_of(&list), "Currently blocked players: Bob");
    let own = run(&db.pool, &alice, &[], "chatBlock", json!({"name":"Alice"})).await;
    assert!(warning_of(&own).contains("cannot block yourself"));

    // Messages are refused in both directions, and nothing is stored.
    for (from, to) in [(&alice, "Bob"), (&bob, "Alice")] {
        let result = run(
            &db.pool,
            from,
            &online,
            "chatPM",
            json!({"msg":"hello","recipient":to}),
        )
        .await;
        assert!(warning_of(&result).contains("cannot send a private message"));
    }
    let stored: i64 = sqlx::query_scalar!("SELECT COUNT(*) AS \"v!\" FROM chat_log_pm")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(stored, 0);

    let unblocked = run(&db.pool, &alice, &[], "chatUnblock", bob_name.clone()).await;
    assert!(notice_of(&unblocked).contains("Successfully unblocked"));
    assert_eq!(self_data(&unblocked, "blocked"), json!({"blocked":[]}));
    let missing = run(&db.pool, &alice, &[], "chatUnblock", bob_name).await;
    assert!(warning_of(&missing).contains("not blocked"));
    let list = run(
        &db.pool,
        &alice,
        &[],
        "chatBlocked",
        json!({"room":"lobby"}),
    )
    .await;
    assert_eq!(notice_of(&list), "Currently, you have not blocked anyone.");
    let result = run(
        &db.pool,
        &bob,
        &online,
        "chatPM",
        json!({"msg":"hello again","recipient":"Alice"}),
    )
    .await;
    assert_eq!(self_data(&result, "chat")["msg"], "hello again");
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
        identity: Arc::new(caller(b, "Bob")),
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
        Effect::Publish(Publication::ToSelf(_)) => true,
        Effect::Publish(Publication::ToUser { id, .. }) => *id == UserId(b),
        _ => false,
    }));
    assert!(effects.iter().any(
        |e| matches!(e,Effect::Publish(Publication::ToUser {id,generation:29,..}) if *id==UserId(b))
    ));
    let stored = sqlx::query!("SELECT datetime_sent FROM chat_log_pm")
        .fetch_one(&db.pool)
        .await
        .unwrap();
    assert_eq!(
        message["datetime"],
        crate::model::timestamp(stored.datetime_sent)
    );
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
    let carol = caller(c, "Carol");
    let result = run(
        &db.pool,
        &carol,
        &[],
        "chatPMHistoryGet",
        json!({"amount":10,"username":"Alice"}),
    )
    .await;
    assert_eq!(self_data(&result, "chatPMHistory")["list"], json!([]));
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
                .all(|effect| matches!(effect, Effect::Publish(Publication::ToSelf(_))))
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
            None,
            crate::actors::client_message("chat", &json!({"msg":"not lobby","room":"table42"}))
                .unwrap()
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
            None,
            crate::actors::client_message("chat", &json!({"msg":"/findvariant","room":"table42"}))
                .unwrap()
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
            .filter(|e| matches!(e, Effect::Publish(Publication::Broadcast(_))))
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
        result.iter().any(
            |e| matches!(e,Effect::Publish(Publication::Broadcast(message)) if message.data()["msg"]=="&lt;plain&gt;")
        )
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
    assert!(!history.iter().any(|r| r.msg.contains("secret")));
    db.close().await;
}

async fn game(db: &TestDb, user: i32, seed: &str, score: i16) -> i32 {
    let id = sqlx::query_scalar!("INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
            speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,
            all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
         VALUES('test',2,0,false,120,20,false,false,false,false,false,false,false,$1,$2,30,1,NOW(),NOW())
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
    relationships::change_friend(&db.pool, UserId(a), UserId(b), true)
        .await
        .unwrap();
    sqlx::query!(
        "UPDATE games SET datetime_finished='2026-11-04T00:00:00Z' WHERE id=ANY($1)",
        &[own, other, shared][..]
    )
    .execute(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        history_ids(&db.pool, UserId(a), 0, 10).await.unwrap(),
        vec![shared, own]
    );
    assert_eq!(
        history_ids(&db.pool, UserId(a), 1, 1).await.unwrap(),
        vec![own]
    );
    assert_eq!(
        history_ids(&db.pool, UserId(a), 99, 10).await.unwrap(),
        Vec::<i32>::new()
    );
    assert_eq!(
        history_ids(&db.pool, UserId(d), 0, 10).await.unwrap(),
        Vec::<i32>::new()
    );
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
        blocked_seeds(&db.pool, &[UserId(a)], "p2v0s")
            .await
            .unwrap(),
        vec!["p2v0s1"]
    );
    assert_eq!(
        blocked_seeds(&db.pool, &[UserId(c)], "p2v0s")
            .await
            .unwrap(),
        vec!["p2v0s2"]
    );
    assert_eq!(
        blocked_seeds(&db.pool, &[UserId(a)], "p3v0s")
            .await
            .unwrap(),
        Vec::<String>::new()
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
    // A page holds at least one game and at most `MAX_PAGE_SIZE`.
    for amount in [0, hanabi_protocol::MAX_PAGE_SIZE + 1] {
        let result = run(
            &db.pool,
            &who,
            &[],
            "historyGet",
            json!({"offset":0,"amount":amount}),
        )
        .await;
        assert_eq!(
            self_data(&result, "warning")["warning"],
            format!(
                "The amount of games must be between 1 and {}.",
                hanabi_protocol::MAX_PAGE_SIZE
            )
        );
    }
    let result = run(
        &db.pool,
        &who,
        &[],
        "historyGetSeed",
        json!({"seed":"p2v0s1","offset":0,"amount":10}),
    )
    .await;
    let history = self_data(&result, "gameHistoryOtherScores");
    assert_eq!(history["games"][0]["id"], gb);
    assert_eq!(history["games"][1]["id"], ga);
    assert_eq!(
        (&history["offset"], &history["total"]),
        (&json!(0), &json!(2))
    );
    // Later pages continue in the same order, and count every game on the seed.
    let result = run(
        &db.pool,
        &who,
        &[],
        "historyGetSeed",
        json!({"seed":"p2v0s1","offset":1,"amount":1}),
    )
    .await;
    let history = self_data(&result, "gameHistoryOtherScores");
    assert_eq!(history["games"].as_array().unwrap().len(), 1);
    assert_eq!(history["games"][0]["id"], ga);
    assert_eq!(
        (&history["offset"], &history["total"]),
        (&json!(1), &json!(2))
    );
    let result = run(
        &db.pool,
        &who,
        &[],
        "historyGetSeed",
        json!({"seed":"p2v0s1","offset":0,"amount":hanabi_protocol::MAX_PAGE_SIZE + 1}),
    )
    .await;
    assert_eq!(
        self_data(&result, "warning")["warning"],
        format!(
            "The amount of games must be between 1 and {}.",
            hanabi_protocol::MAX_PAGE_SIZE
        )
    );
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
async fn every_setting_round_trips_and_only_changes_are_stored_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let id = db.user("Alice").await;
    let defaults = serde_json::to_value(get_settings(&db.pool, UserId(id)).await.unwrap()).unwrap();
    assert_eq!(defaults, json!(settings::defaults()));
    let stored = || async {
        sqlx::query_scalar!("SELECT settings FROM users WHERE id=$1", id)
            .fetch_one(&db.pool)
            .await
            .unwrap()
    };
    assert_eq!(stored().await, json!({}), "Defaults are not stored");
    for (name, default) in settings::defaults() {
        let (value, expected) = match &default {
            Value::Bool(flag) => ((!flag).to_string(), json!(!flag)),
            Value::Number(number) if number.is_f64() => ("7.5".into(), json!(7.5)),
            Value::Number(_) => ("2".into(), json!(2)),
            _ => ("Rainbow (6 Suits)".into(), json!("Rainbow (6 Suits)")),
        };
        assert_ne!(default, expected, "{name} must change");
        set_setting(&db.pool, UserId(id), &name, &value)
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(get_settings(&db.pool, UserId(id)).await.unwrap()).unwrap()[&name],
            expected,
            "{name}"
        );
        assert_eq!(stored().await[&name], expected, "{name} was not stored");
    }
    // Choosing the default again removes the stored value.
    set_setting(&db.pool, UserId(id), "volume", "50")
        .await
        .unwrap();
    assert!(stored().await.get("volume").is_none());
    assert_eq!(
        serde_json::to_value(get_settings(&db.pool, UserId(id)).await.unwrap()).unwrap()["volume"],
        50
    );
    db.close().await;
}

#[tokio::test]
async fn settings_outside_the_wire_contract_are_not_sent_or_saved_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let id = db.user("Alice").await;
    sqlx::query!(
        "UPDATE users SET settings=$2 WHERE id=$1",
        id,
        json!({"createTableVariant":"","createTableMaxPlayers":7,"volume":70,"removedSetting":true})
    )
    .execute(&db.pool)
    .await
    .unwrap();
    let settings = get_settings(&db.pool, UserId(id)).await.unwrap();
    assert_eq!(settings.create_table_variant, "No Variant");
    assert_eq!(settings.create_table_max_players, 5);
    assert_eq!(settings.volume, 70);
    for (name, value) in [
        ("createTableMaxPlayers", "7"),
        ("soundMove", "3"),
        ("createTableVariant", ""),
    ] {
        assert!(
            set_setting(&db.pool, UserId(id), name, value)
                .await
                .is_err(),
            "{name}={value} was accepted"
        );
    }
    db.close().await;
}
