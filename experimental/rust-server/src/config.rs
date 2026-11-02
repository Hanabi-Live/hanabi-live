// cspell:words hexdigit
use anyhow::{Context, Result, ensure};
use std::{collections::HashMap, path::Path};

pub struct Config {
    secret: String,
    port: u16,
    pub(crate) database: String,
    pub(crate) database_host: String,
    pub(crate) database_port: u16,
    pub(crate) database_user: String,
    pub(crate) database_password: String,
}

impl Config {
    pub fn secret(&self) -> &str {
        &self.secret
    }
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn load(path: &Path) -> Result<Self> {
        let values = dotenvy::from_path_iter(path)?.collect::<Result<HashMap<_, _>, _>>()?;
        Self::parse(values)
    }

    fn parse(values: HashMap<String, String>) -> Result<Self> {
        let field = |key: &str| {
            values
                .get(key)
                .cloned()
                .with_context(|| format!("Missing {key}"))
        };
        ensure!(
            matches!(field("DOMAIN")?.as_str(), "localhost" | "127.0.0.1"),
            "The Rust PoC requires a local benchmark fixture"
        );
        let database = field("DB_NAME")?;
        ensure!(
            database.starts_with("ts_slice_")
                && database.len() == 41
                && database[9..].bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Rust PoC refuses non-benchmark databases"
        );
        let database_host = field("DB_HOST")?;
        ensure!(
            database_host.starts_with('/')
                || matches!(database_host.as_str(), "localhost" | "127.0.0.1"),
            "Rust PoC requires local PostgreSQL"
        );
        let secret = field("SESSION_SECRET")?;
        ensure!(secret.len() >= 128, "Session signing key is too short");
        Ok(Self {
            secret,
            port: field("PORT")?.parse().context("Invalid PORT")?,
            database,
            database_host,
            database_port: field("DB_PORT")?.parse().context("Invalid DB_PORT")?,
            database_user: field("DB_USER")?,
            database_password: field("DB_PASSWORD")?,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_production_and_remote_databases_without_mutating_the_environment() {
        let values: HashMap<String, String> = [
            ("DOMAIN", "localhost"),
            ("DB_NAME", "ts_slice_00000000000000000000000000000000"),
            ("DB_HOST", "127.0.0.1"),
            ("DB_PORT", "5432"),
            ("DB_USER", "test"),
            ("DB_PASSWORD", "test"),
            ("PORT", "0"),
            ("SESSION_SECRET", &"synthetic".repeat(32)),
        ]
        .into_iter()
        .map(|(key, value)| (key.into(), value.into()))
        .collect();
        assert!(Config::parse(values.clone()).is_ok());
        for (key, value) in [
            ("DOMAIN", "hanab.live"),
            ("DB_NAME", "production"),
            ("DB_HOST", "remote.invalid"),
        ] {
            let mut invalid = values.clone();
            invalid.insert(key.into(), value.into());
            assert!(Config::parse(invalid).is_err());
        }
        let before = std::env::var("DB_NAME");
        let path =
            std::env::temp_dir().join(format!("hanabi-poc-config-{:032x}", rand::random::<u128>()));
        std::fs::write(
            &path,
            values
                .iter()
                .map(|(key, value)| format!("{key}={value}\n"))
                .collect::<String>(),
        )
        .unwrap();
        let loaded = Config::load(&path);
        std::fs::remove_file(path).unwrap();
        assert!(loaded.is_ok());
        assert_eq!(std::env::var("DB_NAME"), before);
    }
}
