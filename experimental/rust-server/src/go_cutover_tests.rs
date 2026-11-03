//! Temporary migration regression suite; remove with the cutover bridge.
use super::*;
use crate::{go_cutover, test_redis::RedisFixture};
use sqlx::{Connection, postgres::PgConnection};
use std::str::FromStr;

fn corpus() -> BTreeMap<String, Value> {
    serde_json::from_str(include_str!(
        "../../../server/src/testdata/go_rust_cutover.json"
    ))
    .unwrap()
}

#[test]
fn go_checkpoints_preserve_full_engine_runtime_and_private_state() -> Result<()> {
    for (name, source) in corpus() {
        let id = source["Game"]["DatabaseID"].as_i64().unwrap() as i32;
        let table = go_cutover::convert(&source.to_string(), id).with_context(|| name.clone())?;
        let game = table.game().unwrap();
        assert_eq!(
            game.game.turn as i64,
            source["Game"]["Turn"].as_i64().unwrap()
        );
        assert_eq!(game.notes[0][0], "preserved private note");
        assert_eq!(table.receipts.len(), 2);
        assert!(game.queued_pauses[1] && game.votes[0]);
        assert_eq!(game.tags[0].tag, "cutover");
        assert_eq!(game.idle_remaining, 1_798_000);
        let active = game.game.active_player_index;
        let expected = if game.game.paused || game.game.end_condition != EndCondition::InProgress {
            590_000
        } else {
            588_750
        };
        assert_eq!(game.clocks[active], expected);
        if game.game.end_condition == EndCondition::InProgress {
            let visible = game.game.projected(Some(0), 0);
            assert!(visible.iter().any(|event| matches!(
                event,
                hanabi_engine::EngineEvent::Draw {
                    player_index: 0,
                    rank: -1,
                    ..
                }
            )));
        }
        let mut invalid = source.clone();
        invalid["Game"]["Players"][0]["Hand"][0]["Order"] = json!(999);
        assert!(go_cutover::convert(&invalid.to_string(), id).is_err());
        invalid = source.clone();
        invalid["SnapshotVersion"] = json!(99);
        assert!(go_cutover::convert(&invalid.to_string(), id).is_err());
        assert!(go_cutover::convert(&source.to_string(), id + 1000).is_err());
    }
    Ok(())
}

#[tokio::test]
async fn import_recovers_staged_and_partially_promoted_games_without_source_loss() -> Result<()> {
    let Ok(url) = std::env::var("HANABI_TEST_DATABASE_URL") else {
        return Ok(());
    };
    let options = PgConnectOptions::from_str(&url)?;
    let mut admin = PgConnection::connect_with(&options).await?;
    let database = format!("rust_cutover_{:032x}", rand::random::<u128>());
    sqlx::query(&format!("CREATE DATABASE {database}"))
        .execute(&mut admin)
        .await?;
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect_with(
            options
                .clone()
                .database(&database)
                .application_name("rust-cutover-test"),
        )
        .await?;
    sqlx::raw_sql(include_str!("../../../install/database_schema.sql"))
        .execute(&pool)
        .await?;
    sqlx::query("CREATE TABLE schema_version(version integer PRIMARY KEY);")
        .execute(&pool)
        .await?;
    sqlx::query("INSERT INTO schema_version VALUES(5)")
        .execute(&pool)
        .await?;
    for (id, name) in ["Alice", "Bob", "Cathy", "Donald"].iter().enumerate() {
        sqlx::query("INSERT INTO users(id,username,normalized_username,password_hash,last_ip) VALUES($1,$2,$3,'fixture','127.0.0.1')")
            .bind(id as i32+1).bind(name).bind(name.to_lowercase()).execute(&pool).await?;
    }
    for source in corpus().values() {
        sqlx::query("INSERT INTO active_games(game_id,revision,checkpoint) VALUES($1,10,$2)")
            .bind(source["Game"]["DatabaseID"].as_i64().unwrap() as i32)
            .bind(source.to_string())
            .execute(&pool)
            .await?;
    }
    sqlx::query("SELECT setval('games_id_seq',103)")
        .execute(&pool)
        .await?;
    let redis = RedisFixture::start(true).await?;
    let state = RedisState::connect(&redis.url, "cutover-test").await?;
    let mut store = Store::fixture(pool.clone(), state.clone());
    store.primary_name = "rust-cutover-test".into();
    store.archive_name = "rust-cutover-test".into();
    let result = async {
        let outsider = PgConnection::connect_with(&options.clone().database(&database)).await?;
        assert!(go_cutover::import(&store).await.is_err());
        outsider.close().await?;
        sqlx::raw_sql("CREATE FUNCTION reject_cutover() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'blocked cutover'; END $$;
            CREATE TRIGGER reject_cutover BEFORE DELETE ON active_games FOR EACH ROW EXECUTE FUNCTION reject_cutover();")
            .execute(&pool).await?;
        assert!(go_cutover::import(&store).await.is_err());
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM active_games").fetch_one(&pool).await?,3);
        let stages = state.load().await?;
        assert_eq!(stages.len(),3);
        assert!(store.load().await.is_err());
        sqlx::query("DROP TRIGGER reject_cutover ON active_games").execute(&pool).await?;
        // Simulate interruption after source commit and one durable target promotion.
        sqlx::query("DELETE FROM active_games").execute(&pool).await?;
        let stage: Value = serde_json::from_str(&stages[0].payload)?;
        let table: TableSnapshot = serde_json::from_value(stage["table"].clone())?;
        state.reserve(StateId::Table(table.id)).await?;
        store.save(&table,0).await?;
        assert!(store.load().await.is_err());
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM games").fetch_one(&pool).await?,0);
        assert_eq!(go_cutover::import(&store).await?,3);
        assert_eq!(go_cutover::import(&store).await?,0);
        let restored = store.load().await?;
        assert_eq!(restored.len(),3);
        assert!(state.load().await?.iter().all(|record| matches!(record.id,StateId::Table(_))));
        assert!(state.allocate_table().await? > 42);
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM games").fetch_one(&pool).await?,1);
        assert_eq!(sqlx::query_scalar::<_,i64>("SELECT count(*) FROM chat_log WHERE message='preserved Go chat'").fetch_one(&pool).await?,3);
        Ok::<(),anyhow::Error>(())
    }.await;
    store.close().await?;
    sqlx::query(&format!("DROP DATABASE {database} WITH (FORCE)"))
        .execute(&mut admin)
        .await?;
    admin.close().await?;
    result
}
