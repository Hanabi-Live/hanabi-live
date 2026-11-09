use hanabi_protocol::{NO_VALUE, SafeInteger, TableId};

pub(super) fn int(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

/// The wire form of an engine event, which serializes identically.
pub(super) fn wire_event(event: &hanabi_engine::EngineEvent) -> hanabi_protocol::GameEvent {
    use hanabi_engine::EngineEvent as E;
    use hanabi_protocol::GameEvent as G;
    match event {
        E::Draw {
            player_index,
            order,
            suit_index,
            rank,
        } => G::Draw {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::Play {
            player_index,
            order,
            suit_index,
            rank,
        } => G::Play {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::CardIdentity {
            player_index,
            order,
            suit_index,
            rank,
        } => G::CardIdentity {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
        },
        E::Discard {
            player_index,
            order,
            suit_index,
            rank,
            failed,
        } => G::Discard {
            player_index: int(*player_index),
            order: int(*order),
            suit_index: (*suit_index).into(),
            rank: (*rank).into(),
            failed: *failed,
        },
        E::Clue {
            clue,
            giver,
            target,
            list,
            turn,
        } => G::Clue {
            clue: hanabi_protocol::Clue {
                // The wire marks a clue that the recipient may not see with NO_VALUE.
                clue_type: clue.clue_type.map_or(NO_VALUE, i32::from),
                value: clue.value,
            },
            giver: int(*giver),
            target: int(*target),
            list: list.iter().map(|&order| SafeInteger(int(order))).collect(),
            turn: (*turn).into(),
        },
        E::Turn {
            num,
            current_player_index,
        } => G::Turn {
            num: (*num).into(),
            current_player_index: (*current_player_index).into(),
        },
        E::GameOver {
            end_condition,
            player_index,
            votes,
        } => G::GameOver {
            end_condition: *end_condition,
            player_index: (*player_index).into(),
            votes: votes
                .as_ref()
                .map(|votes| votes.iter().map(|&vote| SafeInteger(int(vote))).collect()),
        },
        E::PlayerTimes {
            player_times,
            duration,
        } => G::PlayerTimes {
            player_times: player_times.iter().copied().map(SafeInteger).collect(),
            duration: *duration,
        },
    }
}

pub(crate) fn game_action(
    table: TableId,
    event: &hanabi_engine::EngineEvent,
) -> hanabi_protocol::GameAction {
    hanabi_protocol::GameAction {
        table_id: table,
        action: wire_event(event),
    }
}

pub(crate) fn game_action_list(
    table: TableId,
    list: &[hanabi_engine::EngineEvent],
) -> hanabi_protocol::GameActionList {
    hanabi_protocol::GameActionList {
        table_id: table,
        list: list.iter().map(wire_event).collect(),
    }
}
