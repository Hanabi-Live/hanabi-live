use crate::{
    Character, EngineCard, EngineEvent, EngineState, PlayerAction, StackDirection, Variant,
    clue_type, get_variant, int, is_card_touched,
};
use hanabi_protocol::{MAX_RANK, MIN_RANK, NO_VALUE, START_CARD_RANK};
use std::collections::HashSet;

/// The turns left after the last card is drawn when a Contrarian plays.
const CONTRARIAN_FINAL_TURNS: i32 = 2;
/// The fewest stacks that must reach a card's rank before a Follower can play it.
const FOLLOWER_MIN_STACKS: usize = 2;

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
        // Each player gets one more turn, unless a Contrarian shortens the final round.
        let final_turns = if state.options.detrimental_characters
            && state
                .players
                .iter()
                .any(|p| p.character() == Some(Character::Contrarian))
        {
            CONTRARIAN_FINAL_TURNS
        } else {
            int(state.players.len())
        };
        state.end_turn = Some(state.turn + final_turns + 1);
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
            insistent.character_metadata = NO_VALUE;
        }
    }
}

fn needed_ranks(state: &EngineState, suit: usize) -> Vec<i32> {
    let v = variant_for(state);
    let stack = state.stacks[suit];
    let direction = state.play_stack_directions[suit];
    if v.has_reversed_suits() {
        return match direction {
            StackDirection::Undecided => {
                if stack == 0 {
                    vec![MIN_RANK, MAX_RANK, START_CARD_RANK]
                } else {
                    vec![MIN_RANK + 1, MAX_RANK - 1]
                }
            }
            StackDirection::Up => vec![stack + 1],
            StackDirection::Down => vec![if !v.up_or_down && stack == 0 {
                MAX_RANK
            } else {
                stack - 1
            }],
            StackDirection::Finished => vec![],
        };
    }
    if v.sudoku {
        return if direction == StackDirection::Finished {
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
    if stack == MAX_RANK {
        vec![]
    } else {
        vec![stack + 1]
    }
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
            if direction == StackDirection::Finished
                || rank != next_sudoku_rank(stack, v.stack_size)
            {
                return false;
            }
            let final_rank = previous_sudoku_rank(state.stack_starts[suit], v.stack_size);
            if rank == final_rank {
                state.play_stack_directions[suit] = StackDirection::Finished;
            }
        }
        return true;
    }
    if !needed_ranks(state, suit).contains(&rank) {
        return false;
    }
    if v.has_reversed_suits() {
        if direction == StackDirection::Undecided {
            if rank == MIN_RANK || rank == MIN_RANK + 1 {
                state.play_stack_directions[suit] = StackDirection::Up;
            } else if rank == MAX_RANK - 1 || rank == MAX_RANK {
                state.play_stack_directions[suit] = StackDirection::Down;
            }
        } else if (direction == StackDirection::Up && rank == MAX_RANK)
            || (direction == StackDirection::Down && rank == MIN_RANK)
        {
            state.play_stack_directions[suit] = StackDirection::Finished;
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
    reached < FOLLOWER_MIN_STACKS
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
    if !(available.contains(&if down { MAX_RANK } else { MIN_RANK })
        || (up_or_down && available.contains(&START_CARD_RANK)))
    {
        return 0;
    }
    let mut score = 1;
    let mut rank = if down { MAX_RANK - 1 } else { MIN_RANK + 1 };
    while (MIN_RANK..=MAX_RANK).contains(&rank) {
        if !available.contains(&rank) {
            break;
        }
        score += 1;
        rank += if down { -1 } else { 1 };
    }
    score
}
/// The rank after `rank` on a sudoku stack of `size` ranks, which wraps from the top to the bottom.
fn next_sudoku_rank(rank: i32, size: i32) -> i32 {
    (rank - MIN_RANK + 1) % size + MIN_RANK
}
/// The rank before `rank` on a sudoku stack of `size` ranks, which wraps from the bottom to the top.
fn previous_sudoku_rank(rank: i32, size: i32) -> i32 {
    (rank - MIN_RANK + size - 1) % size + MIN_RANK
}
/// The index of a sudoku slot, which counts up from zero.
fn slot(value: i32) -> usize {
    usize::try_from(value).expect("sudoku slots are not negative")
}
fn sudoku_scores(available: &HashSet<i32>, size: i32) -> Vec<i32> {
    let mut scores = vec![size; slot(size)];
    let mut last_dead = None;
    for position in 0..size {
        if !available.contains(&(position + MIN_RANK)) {
            for write in last_dead.map_or(0, |dead| dead + 1)..position {
                scores[slot(write)] = position - write;
            }
            scores[slot(position)] = 0;
            last_dead = Some(position);
        }
    }
    if let Some(dead) = last_dead {
        for write in dead + 1..size {
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
            scores[index][slot(*rank - MIN_RANK)] + best_assignment(scores, &remaining, index + 1)
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
                StackDirection::Undecided => up.max(down),
                StackDirection::Up => up,
                StackDirection::Down => down,
                StackDirection::Finished => v.stack_size,
            };
        } else {
            for rank in MIN_RANK..=MAX_RANK {
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
