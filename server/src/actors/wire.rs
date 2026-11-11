use hanabi_engine::ClueType;
use hanabi_protocol::{
    CardEvent, CardOrder, CardRank, Clue, ClueEvent, ColorIndex, DiscardEvent, GameEvent,
    GameOverEvent, PlayerIndex, PlayerTimesEvent, RankClueNumber, SuitIndex, TableId, TurnEvent,
};

/// A seat that the engine names. The engine only names seats that the game has.
fn seat(index: usize) -> PlayerIndex {
    PlayerIndex::new(index).expect("engine seats are below MAX_PLAYERS")
}

/// A card that the engine names. The engine only names cards that the game has.
fn card(order: usize) -> CardOrder {
    CardOrder::new(order).expect("engine card orders are below the largest deck")
}

/// A card event that names the card's identity when the recipient may see it.
fn card_event(player_index: usize, order: usize, suit_index: i32, rank: i32) -> CardEvent {
    CardEvent {
        player_index: seat(player_index),
        order: card(order),
        suit_index: SuitIndex::new(suit_index),
        rank: CardRank::new(rank),
    }
}

/// The wire form of an engine event, which serializes identically.
pub(super) fn wire_event(event: &hanabi_engine::EngineEvent) -> GameEvent {
    use hanabi_engine::EngineEvent as E;
    match *event {
        E::Draw {
            player_index,
            order,
            suit_index,
            rank,
        } => GameEvent::Draw(card_event(player_index, order, suit_index, rank)),
        E::Play {
            player_index,
            order,
            suit_index,
            rank,
        } => GameEvent::Play(card_event(player_index, order, suit_index, rank)),
        E::CardIdentity {
            player_index,
            order,
            suit_index,
            rank,
        } => GameEvent::CardIdentity(card_event(player_index, order, suit_index, rank)),
        E::Discard {
            player_index,
            order,
            suit_index,
            rank,
            failed,
        } => GameEvent::Discard(DiscardEvent {
            player_index: seat(player_index),
            order: card(order),
            suit_index: SuitIndex::new(suit_index),
            rank: CardRank::new(rank),
            failed,
        }),
        E::Clue {
            ref clue,
            giver,
            target,
            ref list,
            turn: _,
        } => GameEvent::Clue(ClueEvent {
            // The wire omits a clue that the recipient may not see.
            clue: clue.clue_type.map(|clue_type| match clue_type {
                ClueType::Color => Clue::Color {
                    value: ColorIndex::new(clue.value)
                        .expect("engine clue colors are suit indexes"),
                },
                ClueType::Rank => Clue::Rank {
                    value: RankClueNumber::new(clue.value).expect("engine clue ranks are 1 to 5"),
                },
            }),
            giver: seat(giver),
            target: seat(target),
            orders: list.iter().copied().map(card).collect(),
        }),
        E::Turn {
            num,
            current_player_index,
        } => GameEvent::Turn(TurnEvent {
            num: num.into(),
            current_player_index: PlayerIndex::new(current_player_index),
        }),
        E::GameOver {
            end_condition,
            player_index,
            ref votes,
        } => GameEvent::GameOver(GameOverEvent {
            end_condition,
            player_index: PlayerIndex::new(player_index),
            votes: votes
                .as_ref()
                .map(|votes| votes.iter().copied().map(seat).collect()),
        }),
        E::PlayerTimes {
            ref player_times,
            duration,
        } => GameEvent::PlayerTimes(PlayerTimesEvent {
            player_times_ms: player_times.clone(),
            duration_ms: duration,
        }),
    }
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

pub(crate) fn game_event_list(
    table: TableId,
    list: &[hanabi_engine::EngineEvent],
) -> hanabi_protocol::GameEventList {
    hanabi_protocol::GameEventList {
        table_id: table,
        events: list.iter().map(wire_event).collect(),
    }
}
