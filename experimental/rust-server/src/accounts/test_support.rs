use sqlx::{Connection, Executor, PgConnection, PgPool, postgres::PgConnectOptions};
use std::{
    str::FromStr,
    sync::atomic::{AtomicU64, Ordering},
};

static DATABASE_ID: AtomicU64 = AtomicU64::new(0);

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
        sqlx::raw_sql(include_str!("../../../../install/database_schema.sql"))
            .execute(&pool)
            .await
            .unwrap();
        Some(Self { pool, admin, name })
    }

    pub async fn user(&self, name: &str) -> i32 {
        sqlx::query_scalar(
            "INSERT INTO users(username,normalized_username,password_hash,last_ip)
             VALUES($1,$2,'test-password-hash','127.0.0.1') RETURNING id",
        )
        .bind(name)
        .bind(super::normalize_username(name))
        .fetch_one(&self.pool)
        .await
        .unwrap()
    }

    pub async fn close(mut self) {
        self.pool.close().await;
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
        sqlx::query_scalar::<_, i32>("SELECT 1")
            .fetch_one(&other.pool)
            .await
            .unwrap(),
        1
    );
    other.close().await;
}
