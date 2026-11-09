//! Moves the live tables of an installation that kept them in Redis into PostgreSQL.

use crate::{
    config::Config,
    model::{Phase, TableSnapshot},
};
use anyhow::{Context, Result, bail, ensure};
use hanabi_engine::EndCondition;
use redis::aio::MultiplexedConnection;
use sqlx::Connection;

/// Reads a Redis command's reply.
async fn query<T: redis::FromRedisValue>(
    redis: &mut MultiplexedConnection,
    command: &str,
    arguments: &[&str],
) -> Result<T> {
    let mut command = redis::cmd(command);
    for argument in arguments {
        command.arg(*argument);
    }
    Ok(command.query_async(redis).await?)
}

/// Whether a checkpoint has work left that only a recovering server finishes.
fn unfinished(table: &TableSnapshot) -> bool {
    table.pending_tag.is_some()
        || table.pending_spawn.is_some()
        || table.chat_archived < table.chat.len()
        || matches!(&table.phase, Phase::Live { snapshot }
            if snapshot.game.end_condition != EndCondition::InProgress)
}

pub async fn run(config: &Config) -> Result<()> {
    let mut database = crate::migrations::connect(config).await?;
    crate::migrations::require_current(&mut database).await?;
    let mut transaction = database.begin().await?;
    let imported = sqlx::query_scalar!("SELECT imported FROM live_state_owner FOR UPDATE")
        .fetch_one(&mut *transaction)
        .await?;
    if imported {
        println!("The live tables are already in PostgreSQL.");
        return Ok(());
    }
    let existing = sqlx::query_scalar!("SELECT count(*) AS \"count!\" FROM live_tables")
        .fetch_one(&mut *transaction)
        .await?;
    ensure!(existing == 0, "PostgreSQL already has live tables");

    let client = redis::Client::open(config.redis_url.as_str()).context("Invalid REDIS_URL")?;
    let mut redis = client
        .get_multiplexed_async_connection()
        .await
        .context("Cannot connect to Redis")?;
    // The namespace that earlier releases derived from the database identity.
    let namespace = serde_json::to_string(&(
        &config.database_host,
        config.database_port,
        &config.database,
    ))?;
    let prefix = format!("hanabi:{{{}}}", hex::encode(namespace));
    let owned: bool = query(&mut redis, "EXISTS", &[&format!("{prefix}:owner")]).await?;
    ensure!(
        !owned,
        "A server still owns the live tables in Redis. Stop it with /gracefulStop first."
    );
    let members: Vec<String> =
        query(&mut redis, "SMEMBERS", &[&format!("{prefix}:states")]).await?;
    let counter: Option<i64> =
        query(&mut redis, "GET", &[&format!("{prefix}:table-counter")]).await?;
    let mut highest = counter.unwrap_or(0);
    let mut count = 0;
    for member in members {
        let id = member
            .strip_prefix("t:")
            .and_then(|id| id.parse::<i64>().ok())
            .with_context(|| format!("Unknown Redis live-table entry: {member}"))?;
        let (revision, payload): (Option<i64>, Option<String>) = query(
            &mut redis,
            "HMGET",
            &[&format!("{prefix}:state:{member}"), "revision", "payload"],
        )
        .await?;
        let (Some(revision), Some(payload)) = (revision, payload) else {
            bail!("Redis lists table {id} without its checkpoint");
        };
        highest = highest.max(id);
        // A reserved table that was never saved.
        if revision == 0 {
            continue;
        }
        let table = TableSnapshot::decode(&payload)
            .with_context(|| format!("Cannot read the checkpoint of table {id}"))?;
        ensure!(
            i64::try_from(table.id).ok() == Some(id),
            "The checkpoint of table {id} names another table"
        );
        ensure!(
            !unfinished(&table),
            "Table {id} has unfinished recovery work. Start the previous release to finish it, stop it with /gracefulStop, and import again."
        );
        sqlx::query!(
            "INSERT INTO live_tables (id, revision, payload, epoch) VALUES ($1, $2, $3, 0)",
            id,
            revision,
            payload
        )
        .execute(&mut *transaction)
        .await?;
        count += 1;
    }
    if highest > 0 {
        sqlx::query_scalar!("SELECT setval('live_table_ids', $1) AS \"value!\"", highest)
            .fetch_one(&mut *transaction)
            .await?;
    }
    sqlx::query!("UPDATE live_state_owner SET imported = TRUE")
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    println!(
        "Imported {count} live tables from Redis. The Redis data is unchanged; delete it once the server runs."
    );
    Ok(())
}
