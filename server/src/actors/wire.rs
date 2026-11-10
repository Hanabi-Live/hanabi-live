use hanabi_protocol::{CardOrder, CardRank, PlayerIndex, SuitIndex, TableId};

/// A seat that the engine names. The engine only names seats that the game has.
fn seat(index: usize) -> PlayerIndex {
    PlayerIndex::new(index).expect("engine seats are below MAX_PLAYERS")
}

/// A card that the engine names. The engine only names cards that the game has.
fn card(order: usize) -> CardOrder {
    CardOrder::new(order).expect("engine card orders are below the largest deck")
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
            player_index: seat(*player_index),
            order: card(*order),
            suit_index: SuitIndex::new(*suit_index),
            rank: CardRank::new(*rank),
        },
        E::Play {
            player_index,
            order,
            suit_index,
            rank,
        } => G::Play {
            player_index: seat(*player_index),
            order: card(*order),
            suit_index: SuitIndex::new(*suit_index),
            rank: CardRank::new(*rank),
        },
        E::CardIdentity {
            player_index,
            order,
            suit_index,
            rank,
        } => G::CardIdentity {
            player_index: seat(*player_index),
            order: card(*order),
            suit_index: SuitIndex::new(*suit_index),
            rank: CardRank::new(*rank),
        },
        E::Discard {
            player_index,
            order,
            suit_index,
            rank,
            failed,
        } => G::Discard {
            player_index: seat(*player_index),
            order: card(*order),
            suit_index: SuitIndex::new(*suit_index),
            rank: CardRank::new(*rank),
            failed: *failed,
        },
        E::Clue {
            clue,
            giver,
            target,
            list,
            turn,
        } => G::Clue {
            // The wire omits a clue that the recipient may not see.
            clue: clue.clue_type.map(|clue_type| hanabi_protocol::Clue {
                clue_type,
                value: clue.value,
            }),
            giver: seat(*giver),
            target: seat(*target),
            orders: list.iter().copied().map(card).collect(),
            turn: (*turn).into(),
        },
        E::Turn {
            num,
            current_player_index,
        } => G::Turn {
            num: (*num).into(),
            current_player_index: PlayerIndex::new(*current_player_index),
        },
        E::GameOver {
            end_condition,
            player_index,
            votes,
        } => G::GameOver {
            end_condition: *end_condition,
            player_index: PlayerIndex::new(*player_index),
            votes: votes
                .as_ref()
                .map(|votes| votes.iter().copied().map(seat).collect()),
        },
        E::PlayerTimes {
            player_times,
            duration,
        } => G::PlayerTimes {
            player_times_ms: player_times.clone(),
            duration_ms: *duration,
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
        actions: list.iter().map(wire_event).collect(),
    }
}
