//! Native authoritative Hanabi rules. `EngineState` contains secret identities;
//! only `events_for_recipient` is safe to send to a player.
//!
//! `create_game` takes already ordered seats and an optional already ordered
//! deck. `prepare_game_order` supports lobby deck/seat shuffling on a shared
//! RNG stream; character assignment intentionally starts an independent stream.
//! `apply_action` and `terminate_game` change the state in place and append
//! their events to it. A rejected action or termination leaves the state as it
//! was. Both are deterministic, so a game can be stored as its setup and the
//! actions and terminations applied to it, and rebuilt by replaying them. Send
//! only recipient-projected events. Pausing and timing accounting belong to the
//! caller; optional completion timing becomes a final event, not wall-clock
//! effects inside the engine.
//!
//! `Interpretation::Recorded` applies recorded actions as they are, without
//! swapping inverted-suit plays and discards again, and suppresses completion
//! timing. Custom engine decks can be shorter than a catalog deck (the separate
//! public replay-import validator may impose stricter import requirements).
mod catalog;
mod character;
mod characters;
mod game;
mod rules;
mod setup;
mod types;
mod visibility;

mod random;

pub use anyhow::Result;
pub use catalog::*;
pub use character::{Character, CharacterState};
pub use game::*;
pub use rules::{
    calculate_max_score, clue_cost, clue_cost_for, has_remaining_play, touched_orders,
};
pub use setup::*;
pub use types::*;
pub use visibility::*;
