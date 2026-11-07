/// Returns a regex compiled once, on first use. Compiling a `Regex` is expensive, so
/// `clippy.toml` disallows calling `Regex::new` anywhere else.
macro_rules! regex {
    ($pattern:expr) => {{
        #[allow(clippy::disallowed_methods)]
        static REGEX: std::sync::LazyLock<regex::Regex> =
            std::sync::LazyLock::new(|| regex::Regex::new($pattern).expect("valid regex"));
        &*REGEX
    }};
}

pub mod accounts;
pub mod actors;
mod archive;
pub mod config;
pub mod cookie;
mod database;
pub mod errors;
pub mod game;
pub mod integrations;
pub mod lifecycle;
pub mod lobby;
pub mod metrics;
pub mod model;
pub mod operations;
#[cfg(test)]
mod operations_tests;
pub mod public_http;
pub mod random;
pub mod release;
pub mod restart;
pub mod server_info;
pub mod state;
pub mod store;
#[cfg(test)]
pub(crate) mod test_redis;
pub mod tls;
pub mod transport;
pub mod web;
