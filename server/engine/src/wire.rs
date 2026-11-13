//! The wire form of the engine's events, which the server sends to clients.

use crate::{ClueType, EngineEvent, types::seat};
use hanabi_protocol::{
    CardEvent, CardIdentity, CardOrder, CardRank, Clue, ClueEvent, ClueRank, ColorIndex, GameEvent,
    GameOverEvent, PlayerTimesEvent, SuitIndex, Turn, TurnEvent,
};

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
pub fn card_identity(suit_index: usize, card_rank: i32) -> CardIdentity {
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

/// The wire form of an engine event, as the server sends it to clients.
pub fn wire_event(event: &EngineEvent) -> GameEvent {
    use EngineEvent as E;
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
            clue_type,
            giver,
            target,
            ref list,
            turn: _,
        } => GameEvent::Clue(ClueEvent {
            // The wire omits a clue, or its value, that the recipient may not see.
            clue: clue
                .map(|clue| {
                    match clue.clue_type {
                        ClueType::Color => Clue::Color {
                            color: ColorIndex::new(clue.value)
                                .expect("engine clue colors are suit indexes"),
                        },
                        ClueType::Rank => Clue::Rank {
                            rank: ClueRank::new(clue.value).expect("engine clue ranks are 1 to 5"),
                        },
                    }
                    .into()
                })
                .or_else(|| clue_type.map(Into::into)),
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
            player_times_ms: player_times
                .iter()
                .copied()
                .map(hanabi_protocol::PlayerClock::saturating)
                .collect(),
            duration_ms: hanabi_protocol::Milliseconds::saturating(duration),
        }),
    }
}
