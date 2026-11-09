use anyhow::{Context, Result, ensure};
use std::{
    collections::HashMap,
    net::IpAddr,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct Config {
    pub root: PathBuf,
    secret: String,
    port: u16,
    listen_host: String,
    pub localhost_port: u16,
    pub domain: String,
    pub tls_cert_file: Option<PathBuf>,
    pub tls_key_file: Option<PathBuf>,
    pub integrations: HashMap<String, String>,
    pub(crate) database: String,
    pub(crate) database_host: String,
    pub(crate) database_port: u16,
    pub(crate) database_user: String,
    pub(crate) database_password: String,
}

/// The plain HTTP port, which redirects to HTTPS when TLS is configured.
pub const HTTP_PORT: u16 = 80;
/// The HTTPS port that the default HTTP port becomes when TLS is configured.
pub const HTTPS_PORT: u16 = 443;
/// The IPv4 loopback address, where the operations HTTP server listens.
pub const LOOPBACK_IPV4: &str = "127.0.0.1";
/// The IPv6 loopback address.
const LOOPBACK_IPV6: &str = "::1";
/// The port of the operations HTTP server when `LOCALHOST_PORT` is unset.
const DEFAULT_LOCALHOST_PORT: u16 = 8081;
/// The PostgreSQL port when `DB_PORT` is unset.
const DEFAULT_DATABASE_PORT: u16 = 5432;
/// The shortest session signing key, in bytes.
const MIN_SESSION_SECRET_LENGTH: usize = 128;
/// The longest label in a domain name.
const MAX_DOMAIN_LABEL_LENGTH: usize = 63;

impl Config {
    /// The settings for connecting to PostgreSQL.
    pub(crate) fn database_options(&self) -> sqlx::postgres::PgConnectOptions {
        sqlx::postgres::PgConnectOptions::new()
            .host(&self.database_host)
            .port(self.database_port)
            .username(&self.database_user)
            .password(&self.database_password)
            .database(&self.database)
            .ssl_mode(sqlx::postgres::PgSslMode::Disable)
    }
    pub fn secret(&self) -> &str {
        &self.secret
    }
    pub fn port(&self) -> u16 {
        if self.use_tls() && self.port == HTTP_PORT {
            HTTPS_PORT
        } else {
            self.port
        }
    }
    pub fn use_tls(&self) -> bool {
        self.tls_cert_file.is_some()
    }
    pub fn is_dev(&self) -> bool {
        matches!(
            self.domain.as_str(),
            "localhost" | LOOPBACK_IPV4 | LOOPBACK_IPV6
        ) || self.domain.starts_with("192.168.")
            || self.domain.starts_with("10.")
    }
    pub fn listen_host(&self) -> &str {
        &self.listen_host
    }

    /// Loads an immutable configuration snapshot; never modifies process environment.
    pub fn load(path: &Path) -> Result<Self> {
        let mut values = dotenvy::from_path_iter(path)?.collect::<Result<HashMap<_, _>, _>>()?;
        values.extend(std::env::vars());
        let root = path
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."))
            .canonicalize()?;
        Self::from_values(&root, &values)
    }

    pub fn from_values(root: &Path, values: &HashMap<String, String>) -> Result<Self> {
        let field = |key: &str, default: &str| {
            values
                .get(key)
                .filter(|s| !s.is_empty())
                .map_or(default, String::as_str)
                .to_owned()
        };
        let domain = field("DOMAIN", "localhost");
        let listen_host = field(
            "LISTEN_HOST",
            match domain.as_str() {
                "localhost" | LOOPBACK_IPV4 => LOOPBACK_IPV4,
                LOOPBACK_IPV6 => LOOPBACK_IPV6,
                _ => "0.0.0.0",
            },
        );
        listen_host
            .parse::<IpAddr>()
            .context("LISTEN_HOST must be an IP address")?;
        ensure!(
            domain.parse::<IpAddr>().is_ok()
                || domain.split('.').all(|part| !part.is_empty()
                    && part.len() <= MAX_DOMAIN_LABEL_LENGTH
                    && !part.starts_with('-')
                    && !part.ends_with('-')
                    && part.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')),
            "Invalid DOMAIN"
        );
        let secret = field("SESSION_SECRET", "");
        ensure!(
            secret.len() >= MIN_SESSION_SECRET_LENGTH,
            "SESSION_SECRET must be at least {MIN_SESSION_SECRET_LENGTH} bytes"
        );
        let cert = field("TLS_CERT_FILE", "");
        let key = field("TLS_KEY_FILE", "");
        ensure!(
            cert.is_empty() == key.is_empty(),
            "TLS_CERT_FILE and TLS_KEY_FILE must both be provided"
        );
        let resolve = |value: &str| {
            if value.is_empty() {
                None
            } else {
                Some(root.join(value))
            }
        };
        let mut integrations = HashMap::new();
        for key in [
            "DISCORD_TOKEN",
            "DISCORD_GUILD_ID",
            "DISCORD_CHANNEL_SYNC_WITH_LOBBY",
            "DISCORD_CHANNEL_WEBSITE_DEVELOPMENT",
            "DISCORD_PING_CREW_ROLE_NAME",
            "DISCORD_TRUSTED_TEACHER_ROLE_NAME",
        ] {
            if let Some(value) = values.get(key).filter(|v| !v.is_empty()) {
                integrations.insert(key.into(), value.clone());
            }
        }
        Ok(Self {
            root: root.to_path_buf(),
            secret,
            port: field("PORT", &HTTP_PORT.to_string())
                .parse()
                .context("Invalid PORT")?,
            localhost_port: field("LOCALHOST_PORT", &DEFAULT_LOCALHOST_PORT.to_string())
                .parse()
                .context("Invalid LOCALHOST_PORT")?,
            domain,
            listen_host,
            tls_cert_file: resolve(&cert),
            tls_key_file: resolve(&key),
            integrations,
            database: field("DB_NAME", "hanabi"),
            database_host: field("DB_HOST", "localhost"),
            database_port: field("DB_PORT", &DEFAULT_DATABASE_PORT.to_string())
                .parse()
                .context("Invalid DB_PORT")?,
            database_user: field("DB_USER", "hanabiuser"),
            database_password: field("DB_PASSWORD", "1234567890"),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_runtime_configuration_without_mutating_environment() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let values: HashMap<String, String> = [
            ("SESSION_SECRET", "synthetic".repeat(32)),
            ("DOMAIN", "example.invalid".into()),
            ("DB_HOST", "database.example.invalid".into()),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v))
        .collect();
        let before = std::env::var("DOMAIN");
        let config = Config::from_values(&root, &values).unwrap();
        assert_eq!(config.listen_host(), "0.0.0.0");
        assert_eq!(config.port(), 80);
        assert_eq!(std::env::var("DOMAIN"), before);
        for (key, value) in [
            ("DOMAIN", "bad/name"),
            ("LISTEN_HOST", "not-an-address"),
            ("PORT", "65536"),
            ("LOCALHOST_PORT", "-1"),
            ("SESSION_SECRET", "short"),
            ("TLS_CERT_FILE", "cert.pem"),
        ] {
            let mut values = values.clone();
            values.insert(key.into(), value.into());
            assert!(Config::from_values(&root, &values).is_err(), "{key}");
        }
        let mut values = values;
        values.insert("DOMAIN".into(), "localhost".into());
        assert_eq!(
            Config::from_values(&root, &values).unwrap().listen_host(),
            "127.0.0.1"
        );
        values.insert("LISTEN_HOST".into(), "0.0.0.0".into());
        assert_eq!(
            Config::from_values(&root, &values).unwrap().listen_host(),
            "0.0.0.0"
        );
        values.insert("TLS_CERT_FILE".into(), "cert.pem".into());
        values.insert("TLS_KEY_FILE".into(), "key.pem".into());
        assert_eq!(Config::from_values(&root, &values).unwrap().port(), 443);
    }
}
