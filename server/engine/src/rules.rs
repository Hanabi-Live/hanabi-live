use crate::{
    Character, EngineCard, EngineEvent, EngineState, PlayerAction, Variant, clue_type, get_variant,
    int, is_card_touched,
};
use std::collections::HashSet;

pub(crate) fn variant_for(state: &EngineState) -> &'static Variant {
    get_variant(&state.options.variant_name).expect("validated engine variant")
}
pub fn clue_cost(state: &EngineState) -> i32 {
    clue_cost_for(variant_for(state))
}

/// The clue tokens that a clue costs in a variant: clue-starved variants count each token twice.
pub fn clue_cost_for(variant: &Variant) -> i32 {
    if variant.clue_starved { 2 } else { 1 }
}

pub fn touched_orders(state: &EngineState, action: &PlayerAction) -> Vec<usize> {
    let Some(player) = usize::try_from(action.target)
        .ok()
        .and_then(|i| state.players.get(i))
    else {
        return vec![];
    };
    player
        .hand
        .iter()
        .copied()
        .filter(|&order| {
            let card = &state.deck[order];
            clue_type(action.action_type).is_some_and(|clue_type| {
                is_card_touched(
                    variant_for(state),
                    clue_type,
                    action.value,
                    card.suit_index,
                    card.rank,
                )
            })
        })
        .collect()
}

pub(crate) fn sees_card(state: &EngineState, viewer: usize, holder: usize, order: usize) -> bool {
    if !state.options.detrimental_characters {
        return true;
    }
    let n = state.players.len();
    match state.players[viewer].character() {
        Some(Character::BlindSpot) if holder == (viewer + 1) % n => false,
        Some(Character::Oblivious) if holder == (viewer + n - 1) % n => false,
        Some(Character::SlowWitted) => state.players[holder].hand.last() != Some(&order),
        _ => true,
    }
}

pub(crate) fn draw_card(state: &mut EngineState, player: usize) {
    if state.deck_index >= state.deck.len() {
        return;
    }
    let card = &state.deck[state.deck_index];
    state.deck_index += 1;
    state.players[player].hand.push(card.order);
    state.events.push(EngineEvent::Draw {
        player_index: player,
        order: card.order,
        suit_index: int(card.suit_index),
        rank: card.rank,
    });
    if state.options.detrimental_characters
        && state.players[player].hand.len() > 1
        && state
            .players
            .iter()
            .any(|p| p.character() == Some(Character::SlowWitted))
    {
        let hand = &state.players[player].hand;
        let previous = &state.deck[hand[hand.len() - 2]];
        state.events.push(EngineEvent::CardIdentity {
            player_index: player,
            order: previous.order,
            suit_index: int(previous.suit_index),
            rank: previous.rank,
        });
    }
    if state.deck_index == state.deck.len() && !state.options.all_or_nothing {
        state.end_turn = state.turn + int(state.players.len()) + 1;
        if state.options.detrimental_characters
            && state
                .players
                .iter()
                .any(|p| p.character() == Some(Character::Contrarian))
        {
            state.end_turn = state.turn + 3;
        }
    }
}

pub(crate) fn remove_card(state: &mut EngineState, player: usize, order: usize) {
    let hand = &mut state.players[player].hand;
    let index = hand
        .iter()
        .position(|&o| o == order)
        .expect("validated hand card");
    state.deck[order].slot = int(hand.len() - index);
    hand.remove(index);
    if state.options.detrimental_characters && state.deck[order].insistent_touched {
        for &remaining in hand.iter() {
            state.deck[remaining].insistent_touched = false;
        }
        if let Some(insistent) = state
            .players
            .iter_mut()
            .find(|p| p.character() == Some(Character::Insistent))
        {
            insistent.character_metadata = -1;
        }
    }
}

fn needed_ranks(state: &EngineState, suit: usize) -> Vec<i32> {
    let v = variant_for(state);
    let stack = state.stacks[suit];
    let direction = state.play_stack_directions[suit];
    if v.has_reversed_suits() {
        return match direction {
            0 => {
                if stack == 0 {
                    vec![1, 5, 7]
                } else {
                    vec![2, 4]
                }
            }
            1 => vec![stack + 1],
            2 => vec![if !v.up_or_down && stack == 0 {
                5
            } else {
                stack - 1
            }],
            _ => vec![],
        };
    }
    if v.sudoku {
        return if direction == 3 {
            vec![]
        } else if stack == 0 {
            v.ranks
                .iter()
                .copied()
                .filter(|r| !state.stack_starts.contains(r))
                .collect()
        } else {
            vec![stack % v.stack_size + 1]
        };
    }
    if stack == 5 { vec![] } else { vec![stack + 1] }
}

pub(crate) fn try_play(state: &mut EngineState, order: usize) -> bool {
    let v = variant_for(state);
    let card = &state.deck[order];
    let suit = card.suit_index;
    let rank = card.rank;
    let stack = state.stacks[suit];
    let direction = state.play_stack_directions[suit];
    if v.sudoku {
        if stack == 0 {
            if state.stack_starts.contains(&rank) {
                return false;
            }
            state.stack_starts[suit] = rank;
        } else {
            if direction == 3 || rank != stack % v.stack_size + 1 {
                return false;
            }
            let final_rank = (state.stack_starts[suit] + v.stack_size - 2) % v.stack_size + 1;
            if rank == final_rank {
                state.play_stack_directions[suit] = 3;
            }
        }
        return true;
    }
    if !needed_ranks(state, suit).contains(&rank) {
        return false;
    }
    if v.has_reversed_suits() {
        if direction == 0 {
            if rank == 1 || rank == 2 {
                state.play_stack_directions[suit] = 1;
            } else if rank == 4 || rank == 5 {
                state.play_stack_directions[suit] = 2;
            }
        } else if (direction == 1 && rank == 5) || (direction == 2 && rank == 1) {
            state.play_stack_directions[suit] = 3;
        }
    }
    true
}

pub(crate) fn follower_misplays(state: &EngineState, player: usize, card: &EngineCard) -> bool {
    if !state.options.detrimental_characters
        || state.players[player].character() != Some(Character::Follower)
    {
        return false;
    }
    let v = variant_for(state);
    let size = int(v.ranks.len());
    let reached = state
        .stacks
        .iter()
        .enumerate()
        .filter(|&(suit, &stack)| {
            if v.sudoku {
                stack != 0
                    && (stack - state.stack_starts[suit] + size) % size
                        >= (card.rank - state.stack_starts[suit] + size) % size
            } else {
                stack >= card.rank
            }
        })
        .count();
    reached < 2
}

fn available_ranks(state: &EngineState, suit: usize) -> HashSet<i32> {
    state
        .deck
        .iter()
        .filter(|c| c.suit_index == suit && !c.discarded)
        .map(|c| c.rank)
        .collect()
}
fn reversible_walk(available: &HashSet<i32>, up_or_down: bool, down: bool) -> i32 {
    if !(available.contains(&if down { 5 } else { 1 }) || (up_or_down && available.contains(&7))) {
        return 0;
    }
    let mut score = 1;
    let mut rank = if down { 4 } else { 2 };
    while (1..=5).contains(&rank) {
        if !available.contains(&rank) {
            break;
        }
        score += 1;
        rank += if down { -1 } else { 1 };
    }
    score
}
/// The index of a sudoku slot, which counts up from zero.
fn slot(value: i32) -> usize {
    usize::try_from(value).expect("sudoku slots are not negative")
}
fn sudoku_scores(available: &HashSet<i32>, size: i32) -> Vec<i32> {
    let mut scores = vec![size; 5];
    let mut last_dead = -1;
    for rank in 0..size {
        if !available.contains(&(rank + 1)) {
            for write in last_dead + 1..rank {
                scores[slot(write)] = rank - write;
            }
            scores[slot(rank)] = 0;
            last_dead = rank;
        }
    }
    if last_dead != -1 {
        for write in last_dead + 1..size {
            scores[slot(write)] = (scores[0] + size - write).min(size);
        }
    }
    scores
}
fn best_assignment(scores: &[Vec<i32>], free: &[i32], index: usize) -> i32 {
    if index == scores.len() {
        return 0;
    }
    free.iter()
        .map(|rank| {
            let remaining: Vec<i32> = free.iter().copied().filter(|r| r != rank).collect();
            scores[index][slot(*rank - 1)] + best_assignment(scores, &remaining, index + 1)
        })
        .max()
        .unwrap_or(0)
}
pub fn calculate_max_score(state: &EngineState) -> i32 {
    let v = variant_for(state);
    if v.sudoku && !v.has_reversed_suits() {
        let mut independent = 0;
        let mut unassigned = vec![];
        for (suit, &start) in state.stack_starts.iter().enumerate() {
            let scores = sudoku_scores(&available_ranks(state, suit), v.stack_size);
            if scores.iter().all(|s| *s == v.stack_size) {
                independent += v.stack_size;
            } else if start == 0 {
                unassigned.push(scores);
            } else {
                independent += scores[slot(start - 1)];
            }
        }
        let free: Vec<i32> = v
            .ranks
            .iter()
            .copied()
            .filter(|r| !state.stack_starts.contains(r))
            .collect();
        return independent + best_assignment(&unassigned, &free, 0);
    }
    let mut score = 0;
    for (suit, &direction) in state.play_stack_directions.iter().enumerate() {
        let available = available_ranks(state, suit);
        if v.has_reversed_suits() {
            let up = reversible_walk(&available, v.up_or_down, false);
            let down = reversible_walk(&available, v.up_or_down, true);
            score += match direction {
                0 => up.max(down),
                1 => up,
                2 => down,
                3 => v.stack_size,
                _ => unreachable!("validated direction"),
            };
        } else {
            for rank in 1..=5 {
                if !available.contains(&rank) {
                    break;
                }
                score += 1;
            }
        }
    }
    score
}
pub fn has_remaining_play(state: &EngineState) -> bool {
    state.stacks.iter().enumerate().any(|(suit, _)| {
        let ranks = needed_ranks(state, suit);
        state.deck.iter().any(|card| {
            card.suit_index == suit
                && ranks.contains(&card.rank)
                && !card.discarded
                && !card.cannot_be_played
        })
    })
}
