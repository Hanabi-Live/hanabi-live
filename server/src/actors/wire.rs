use hanabi_engine::wire_event;
use hanabi_protocol::{GameEvent, TableId};

/// A player's clock, which model validation keeps within the integers that clients represent.
pub(super) fn player_clock(ms: i64) -> hanabi_protocol::PlayerClock {
    hanabi_protocol::PlayerClock::saturating(ms)
}

pub(crate) fn game_event(
    table: TableId,
    event: &hanabi_engine::EngineEvent,
) -> hanabi_protocol::GameEventMessage {
    hanabi_protocol::GameEventMessage {
        table_id: table,
        event: wire_event(event),
    }
}

pub(crate) fn game_events(list: &[hanabi_engine::EngineEvent]) -> Vec<GameEvent> {
    list.iter().map(wire_event).collect()
}
