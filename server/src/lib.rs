/// Returns a regex compiled once, on first use. Compiling a `Regex` is expensive, so
/// `clippy.toml` disallows calling `Regex::new` anywhere else.
macro_rules! regex {
    ($pattern:expr) => {{
        #[expect(
            clippy::disallowed_methods,
            reason = "this macro is the one place that compiles a regex"
        )]
        static REGEX: std::sync::LazyLock<regex::Regex> =
            std::sync::LazyLock::new(|| regex::Regex::new($pattern).expect("valid regex"));
        &*REGEX
    }};
}

/// A rejection of a player's request (`CommandError::Rejected`), built like `anyhow!`.
macro_rules! rejection {
    ($($message:tt)+) => {
        $crate::errors::CommandError::rejected(format!($($message)+))
    };
}

/// An unexpected failure of a player's request (`CommandError::Internal`), built like `anyhow!`.
macro_rules! internal {
    ($($message:tt)+) => {
        $crate::errors::CommandError::Internal(anyhow::anyhow!($($message)+))
    };
}

/// Returns an unexpected failure of a player's request, like `bail!`.
macro_rules! bail_internal {
    ($($message:tt)+) => {
        return Err(internal!($($message)+))
    };
}

/// Returns an unexpected failure of a player's request unless a condition holds, like `ensure!`.
macro_rules! ensure_internal {
    ($condition:expr, $($message:tt)+) => {
        if $condition {
        } else {
            bail_internal!($($message)+);
        }
    };
}

/// Returns a rejection of a player's request, like `bail!`.
macro_rules! reject {
    ($($message:tt)+) => {
        return Err(rejection!($($message)+))
    };
}

/// Returns a rejection of a player's request unless a condition holds, like `ensure!`.
macro_rules! ensure_or_reject {
    ($condition:expr, $($message:tt)+) => {
        if $condition {
        } else {
            reject!($($message)+);
        }
    };
}

/// The bytes in a KiB.
pub const KIB: usize = 1024;
/// The bytes in a MiB.
pub const MIB: usize = 1024 * KIB;

mod accounts;
mod actors;
mod archive;
mod checkpoint;
mod config;
mod cookie;
mod database;
mod errors;
mod game;
mod git;
mod integrations;
mod lifecycle;
mod lobby;
mod metrics;
mod migrations;
mod model;
mod operations;
#[cfg(test)]
mod operations_tests;
mod public_http;
mod query;
mod release;
mod restart;
mod routing;
mod server;
mod server_info;
mod state;
mod stats;
mod store;
mod tls;
mod transport;
mod web;

pub use server::main;
