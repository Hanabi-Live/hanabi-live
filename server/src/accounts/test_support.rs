use sqlx::{Connection, Executor, PgConnection, PgPool, postgres::PgConnectOptions};
use std::{
    str::FromStr,
    sync::atomic::{AtomicU64, Ordering},
};

static DATABASE_ID: AtomicU64 = AtomicU64::new(0);

pub(crate) async fn legacy_column_order(pool: &PgPool) -> anyhow::Result<()> {
    for (table, column, definition) in [
        ("chat_log", "source", "TEXT NOT NULL DEFAULT 'user'"),
        ("games", "all_or_nothing", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("games", "one_extra_card", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ("games", "one_less_card", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ] {
        #[expect(
            clippy::disallowed_methods,
            reason = "table and column names cannot be bound parameters"
        )]
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
            "ALTER TABLE {table} RENAME COLUMN {column} TO legacy_column;
             ALTER TABLE {table} ADD COLUMN {column} {definition};
             UPDATE {table} SET {column}=legacy_column;
             ALTER TABLE {table} DROP COLUMN legacy_column"
        )))
        .execute(pool)
        .await?;
    }
    Ok(())
}

pub struct TestDb {
    pub pool: PgPool,
    admin: PgConnection,
    name: String,
}

impl TestDb {
    pub async fn create() -> Option<Self> {
        let Ok(url) = std::env::var("HANABI_TEST_DATABASE_URL") else {
            eprintln!("Skipping disposable PostgreSQL test; set HANABI_TEST_DATABASE_URL.");
            return None;
        };
        let options = PgConnectOptions::from_str(&url).unwrap();
        assert!(
            options.get_host().starts_with('/')
                || matches!(options.get_host(), "localhost" | "127.0.0.1" | "::1"),
            "Tests require a disposable local PostgreSQL instance"
        );
        let mut admin = PgConnection::connect_with(&options).await.unwrap();
        let name = format!(
            "ts_slice_rust_accounts_{}_{}",
            std::process::id(),
            DATABASE_ID.fetch_add(1, Ordering::Relaxed)
        );
        #[expect(
            clippy::disallowed_methods,
            reason = "a database name cannot be a bound parameter"
        )]
        admin
            .execute(sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "CREATE DATABASE {name}"
            ))))
            .await
            .unwrap();
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(6)
            .connect_with(options.database(&name))
            .await
            .unwrap();
        #[expect(
            clippy::disallowed_methods,
            reason = "the schema file has many statements, which the query macros cannot run"
        )]
        sqlx::raw_sql(include_str!("../../../install/database_schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        Some(Self { pool, admin, name })
    }

    pub async fn user(&self, name: &str) -> i32 {
        sqlx::query_scalar!(
            "INSERT INTO users(username,normalized_username,password_hash,last_ip)
             VALUES($1,$2,'test-password-hash','127.0.0.1') RETURNING id",
            name,
            super::normalize_username(name)
        )
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    pub async fn close(mut self) {
        self.pool.close().await;
        #[expect(
            clippy::disallowed_methods,
            reason = "a database name cannot be a bound parameter"
        )]
        self.admin
            .execute(sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
                "DROP DATABASE {} WITH (FORCE)",
                self.name
            ))))
            .await
            .unwrap();
        self.admin.close().await.unwrap();
    }
}

#[tokio::test]
async fn cleanup_handles_late_backend_disconnect_without_touching_other_databases_postgres() {
    let Some(db) = TestDb::create().await else {
        return;
    };
    let other = TestDb::create().await.unwrap();
    let mut backend = PgConnection::connect_with(&db.pool.connect_options())
        .await
        .unwrap();
    db.close().await;
    assert!(backend.execute("SELECT 1").await.is_err());
    assert_eq!(
        sqlx::query_scalar!("SELECT 1 AS \"v!\"")
            .fetch_one(&other.pool)
            .await
            .unwrap(),
        1
    );
    other.close().await;
}
