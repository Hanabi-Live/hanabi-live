//! Native authoritative Hanabi rules. `EngineState` contains secret identities;
//! only `events_for_recipient` is safe to send to a player.
//!
//! `create_game` takes already ordered seats and an optional already ordered
//! deck. `prepare_game_order` supports lobby deck/seat shuffling on a shared
//! RNG stream; character assignment intentionally starts an independent stream.
//! `apply_action` and `terminate_game` return owned immutable transitions.
//! Persist the complete state, restore with `parse_engine_state`, and send only
//! recipient-projected events. Pausing and timing accounting belong to the
//! caller; optional completion timing becomes a final event, not wall-clock
//! effects inside the engine.
//!
//! `Interpretation::LegacyReplay` preserves historical pre-interpreted inverted
//! actions and suppresses completion timing. Custom engine decks can be shorter
//! than a catalog deck (the separate public replay-import validator may impose
//! stricter import requirements).
mod catalog;
mod characters;
mod game;
mod restore;
mod rules;
mod setup;
mod types;
mod visibility;

#[path = "../../src/random.rs"]
pub mod random;

pub use anyhow::Result;
pub use catalog::*;
pub use game::*;
pub use restore::{parse_engine_state, validate_engine_state};
pub use rules::{
    calculate_max_score, clue_cost, clue_cost_for, has_remaining_play, touched_orders,
};
pub use setup::*;
pub use types::*;
pub use visibility::*;
