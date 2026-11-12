use hanabi_engine::ClueType;
use hanabi_protocol::{
    CardEvent, CardIdentity, CardOrder, CardRank, Clue, ClueEvent, ClueRank, ColorIndex, GameEvent,
    GameOverEvent, PlayerIndex, PlayerTimesEvent, SuitIndex, TableId, Turn, TurnEvent,
};

/// A seat that the engine names. The engine only names seats that the game has.
/// A player's clock, which model validation keeps within the integers that clients represent.
pub(super) fn player_clock(ms: i64) -> hanabi_protocol::PlayerClock {
    hanabi_protocol::PlayerClock(ms.clamp(
        -hanabi_protocol::MAX_SAFE_INTEGER,
        hanabi_protocol::MAX_SAFE_INTEGER,
    ))
}

fn seat(index: usize) -> PlayerIndex {
    PlayerIndex::new(index).expect("engine seats are below MAX_PLAYERS")
}

/// A card that the engine names. The engine only names cards that the game has.
fn card(order: usize) -> CardOrder {
    CardOrder::new(order).expect("engine card orders are below the largest deck")
}

/// A suit that the engine names. The engine only names suits that the variant has.
fn suit(index: usize) -> SuitIndex {
    SuitIndex::new(index).expect("engine suits are below MAX_SUITS")
}

/// A card rank that the engine names. The engine only names ranks that the catalog has.
fn rank(rank: i32) -> CardRank {
    CardRank::new(rank).expect("engine card ranks are catalog ranks")
}

/// A card's suit and rank, which the engine names.
pub(super) fn card_identity(suit_index: usize, card_rank: i32) -> CardIdentity {
    CardIdentity {
        suit_index: suit(suit_index),
        rank: rank(card_rank),
    }
}

/// A card's identity, unless the engine hides it from the recipient. The engine hides a card's
/// suit and rank together.
fn identity(suit_index: Option<usize>, card_rank: Option<i32>) -> Option<CardIdentity> {
    Some(card_identity(suit_index?, card_rank?))
}

/// A card event that names the card's identity when the recipient may see it.
fn card_event(
    player_index: usize,
    order: usize,
    suit_index: Option<usize>,
    card_rank: Option<i32>,
) -> CardEvent {
    CardEvent {
        player_index: seat(player_index),
        order: card(order),
        identity: identity(suit_index, card_rank),
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
        } => {
            let card = card_event(player_index, order, suit_index, rank);
            if failed {
                GameEvent::Misplay(card)
            } else {
                GameEvent::Discard(card)
            }
        }
        E::Clue {
            clue,
            giver,
            target,
            ref list,
            turn: _,
        } => GameEvent::Clue(ClueEvent {
            // The wire omits a clue that the recipient may not see.
            clue: clue.map(|clue| match clue.clue_type {
                ClueType::Color => Clue::Color {
                    color: ColorIndex::new(clue.value)
                        .expect("engine clue colors are suit indexes"),
                },
                ClueType::Rank => Clue::Rank {
                    rank: ClueRank::new(clue.value).expect("engine clue ranks are 1 to 5"),
                },
            }),
            player_index: seat(giver),
            receiver_index: seat(target),
            orders: list.iter().copied().map(card).collect(),
            ignore_negative: false,
        }),
        E::Turn {
            num,
            current_player_index,
        } => GameEvent::Turn(TurnEvent {
            turn: Turn::new(num).expect("engine turns are below MAX_GAME_ACTIONS"),
            current_player_index: current_player_index.map(seat),
        }),
        E::GameOver {
            end_condition,
            player_index,
            ref votes,
        } => GameEvent::GameOver(GameOverEvent {
            end_condition,
            player_index: player_index.map(seat),
            voters: votes.iter().flatten().copied().map(seat).collect(),
        }),
        E::PlayerTimes {
            ref player_times,
            duration,
        } => GameEvent::PlayerTimes(PlayerTimesEvent {
            player_times_ms: player_times.iter().copied().map(player_clock).collect(),
            duration_ms: hanabi_protocol::Milliseconds(duration.max(0)),
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

pub(crate) fn game_events(list: &[hanabi_engine::EngineEvent]) -> Vec<GameEvent> {
    list.iter().map(wire_event).collect()
}
