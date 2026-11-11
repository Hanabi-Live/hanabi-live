use crate::{
    Character, Clue, ClueType, EndCondition, EngineState, GameEnd, PlayerAction, RecordedAction,
    RecordedActionType, int, recorded_action_type,
    rules::{clue_cost, touched_by},
    types::reject,
};
use anyhow::Result;
use hanabi_protocol::{Clue as WireClue, ClueTurn, MAX_RANK, PANICKY_MAX_CLUES};

/// The number that a character's metadata holds for a clue type, for characters that remember the
/// last clue they gave.
const fn clue_type_metadata(clue_type: ClueType) -> i32 {
    match clue_type {
        ClueType::Color => 0,
        ClueType::Rank => 1,
    }
}

/// The clues that a Miser needs before giving one.
const MISER_MIN_CLUES: i32 = 4;
/// The clues that a Genius needs before giving one.
const GENIUS_MIN_CLUES: i32 = 2;
/// The clues at or above which a Wasteful player cannot discard.
const WASTEFUL_MAX_CLUES: i32 = 2;
/// The fewest cards that a Greedy player's clue must touch.
const GREEDY_MIN_TOUCHED: usize = 2;
/// The ranks that a Vulnerable player cannot be clued.
const VULNERABLE_RANKS: [i32; 2] = [2, MAX_RANK];

fn reject_character<T>(character: Character, reason: &str) -> Result<T> {
    reject(format!("You are {}, {reason}", character.name()))
}

pub(crate) fn validate_character_action(
    state: &EngineState,
    actor: usize,
    action: PlayerAction,
) -> Result<()> {
    if !state.options.detrimental_characters {
        return Ok(());
    }
    let p = &state.players[actor];
    let action_type = recorded_action_type(&RecordedAction::from(action));
    let clue = action_type.is_clue();
    let m = p.character_metadata;
    let previous = m.and_then(|m| RecordedActionType::try_from(m).ok());
    let reason = match p.character {
        Some(Character::Vindictive) if m == Some(0) && !clue => {
            Some("so you must give a clue if you have been given a clue on this go-around.")
        }
        Some(Character::Insistent) if m.is_some() && !clue => {
            Some("so you must continue to clue the same card until it is played or discarded.")
        }
        Some(Character::Impulsive)
            if m == Some(0)
                && !matches!(action, PlayerAction::Play(card)
                    if p.hand.last() == Some(&card.order.index())) =>
        {
            Some("so you must play your slot 1 card after it has been clued.")
        }
        Some(Character::Indolent) if action_type == RecordedActionType::Play && m == Some(0) => {
            Some("so you cannot play a card if you played one in the last round.")
        }
        // The metadata is the type of the previous player's action, and every clue counts as one.
        Some(Character::Stubborn)
            if previous == Some(action_type)
                || (clue && previous.is_some_and(RecordedActionType::is_clue)) =>
        {
            Some("so you cannot perform the same kind of action that the previous player did.")
        }
        _ => None,
    };
    if let (Some(reason), Some(character)) = (reason, p.character) {
        return reject_character(character, reason);
    }
    if let Some(m) = m {
        if p.character == Some(Character::Genius) {
            let PlayerAction::Clue(ClueTurn {
                target,
                clue: WireClue::Rank { .. },
            }) = action
            else {
                return reject_character(Character::Genius, "so you must now give a rank clue.");
            };
            if int(target.index()) != m {
                return reject_character(
                    Character::Genius,
                    "so you must give the second clue to the same player.",
                );
            }
        } else if p.character == Some(Character::Panicky)
            && action_type != RecordedActionType::Discard
        {
            return reject_character(
                Character::Panicky,
                &format!(
                    "so you must discard again since there are {PANICKY_MAX_CLUES} or less clues available."
                ),
            );
        }
    }
    Ok(())
}
pub(crate) fn validate_character_play(
    state: &EngineState,
    actor: usize,
    order: usize,
) -> Result<()> {
    let p = &state.players[actor];
    if state.options.detrimental_characters
        && p.character == Some(Character::Hesitant)
        && p.hand.last() == Some(&order)
    {
        return reject("You cannot play that card since you are a Hesitant character.");
    }
    Ok(())
}
pub(crate) fn validate_character_discard(state: &EngineState, actor: usize) -> Result<()> {
    if !state.options.detrimental_characters {
        return Ok(());
    }
    let p = &state.players[actor];
    let reason = match p.character {
        Some(Character::Anxious) if state.clue_tokens % 2 == 0 => {
            Some("so you cannot discard when there is an even number of clues available.")
        }
        Some(Character::Traumatized) if state.clue_tokens % 2 == 1 => {
            Some("so you cannot discard when there is an odd number of clues available.")
        }
        Some(Character::Wasteful) if state.clue_tokens >= WASTEFUL_MAX_CLUES * clue_cost(state) => {
            return reject_character(
                Character::Wasteful,
                &format!(
                    "so you cannot discard if there are {WASTEFUL_MAX_CLUES} or more clues available."
                ),
            );
        }
        _ => None,
    };
    if let (Some(reason), Some(character)) = (reason, p.character) {
        return reject_character(character, reason);
    }
    Ok(())
}
pub(crate) fn validate_character_clue(
    state: &EngineState,
    actor: usize,
    target_index: usize,
    given: Clue,
) -> Result<()> {
    if !state.options.detrimental_characters {
        return Ok(());
    }
    let p = &state.players[actor];
    let target = &state.players[target_index];
    let touched = touched_by(state, target_index, given);
    let m = p.character_metadata;
    let clue = given.clue_type;
    let reason = match p.character {
        Some(Character::Fuming) if clue == ClueType::Color && Some(given.value) != m => {
            Some("so you can not give that type of clue.")
        }
        Some(Character::Dumbfounded) if clue == ClueType::Rank && Some(given.value) != m => {
            Some("so you can not give that type of clue.")
        }
        Some(Character::Inept)
            if touched
                .iter()
                .any(|o| Some(int(state.deck[*o].suit_index)) == m) =>
        {
            Some("so you cannot give clues that touch a specific suit.")
        }
        Some(Character::Awkward) => match m {
            Some(rank) if touched.iter().any(|o| state.deck[*o].rank == rank) => {
                return reject_character(
                    Character::Awkward,
                    &format!("so you cannot give clues that touch cards with a rank of {rank}."),
                );
            }
            _ => None,
        },
        Some(Character::Conservative) if touched.len() != 1 => {
            Some("so you can only give clues that touch a single card.")
        }
        Some(Character::Greedy) if touched.len() < GREEDY_MIN_TOUCHED => {
            return reject_character(
                Character::Greedy,
                &format!("so you can only give clues that touch {GREEDY_MIN_TOUCHED}+ cards."),
            );
        }
        Some(Character::Picky) if (given.value + i32::from(clue == ClueType::Color)) % 2 == 0 => {
            Some("so you can only clue odd numbers or odd colors.")
        }
        Some(Character::Spiteful) if target_index == (actor + 1) % state.players.len() => {
            Some("so you cannot clue the player to your left.")
        }
        Some(Character::Insolent)
            if target_index == (actor + state.players.len() - 1) % state.players.len() =>
        {
            Some("so you cannot clue the player to your right.")
        }
        Some(Character::Miser) if state.clue_tokens < MISER_MIN_CLUES * clue_cost(state) => {
            return reject_character(
                Character::Miser,
                &format!(
                    "so you cannot give a clue unless there are {MISER_MIN_CLUES} or more clues available."
                ),
            );
        }
        Some(Character::Compulsive)
            if touched
                .iter()
                .all(|o| Some(o) != target.hand.first() && Some(o) != target.hand.last()) =>
        {
            Some(
                "so you can only give a clue if it touches either the newest or oldest card in a hand.",
            )
        }
        // The metadata is the type of the player's previous clue.
        Some(Character::MoodSwings) if Some(clue_type_metadata(clue)) == m => {
            Some("so cannot give the same clue type twice in a row.")
        }
        Some(Character::Insistent)
            if m.is_some() && touched.iter().all(|o| !state.deck[*o].insistent_touched) =>
        {
            Some("so you must continue to clue a card until it is played or discarded.")
        }
        Some(Character::Genius)
            if m.is_none() && state.clue_tokens < GENIUS_MIN_CLUES * clue_cost(state) =>
        {
            return reject_character(
                Character::Genius,
                &format!(
                    "so there needs to be at least {GENIUS_MIN_CLUES} clues available for you to give a clue."
                ),
            );
        }
        Some(Character::Genius) if m.is_none() && clue != ClueType::Color => {
            Some("so you must give a color clue first.")
        }
        _ => None,
    };
    if let (Some(reason), Some(character)) = (reason, p.character) {
        return reject_character(character, reason);
    }
    if target.character == Some(Character::Vulnerable)
        && clue == ClueType::Rank
        && VULNERABLE_RANKS.contains(&given.value)
    {
        let [low, high] = VULNERABLE_RANKS;
        return reject(format!(
            "You cannot give a number {low} or number {high} clue to a Vulnerable character."
        ));
    }
    if target.character == Some(Character::ColorBlind) && clue == ClueType::Color {
        return reject("You cannot give that color clue to a Color-Blind character.");
    }
    Ok(())
}
pub(crate) fn character_post_clue(
    state: &mut EngineState,
    actor: usize,
    target: usize,
    clue: Clue,
    touched: &[usize],
) {
    if !state.options.detrimental_characters {
        return;
    }
    let p = &mut state.players[actor];
    if p.character == Some(Character::MoodSwings) {
        p.character_metadata = Some(clue_type_metadata(clue.clue_type));
    } else if p.character == Some(Character::Insistent) && p.character_metadata.is_none() {
        for o in touched {
            state.deck[*o].insistent_touched = true;
        }
        p.character_metadata = Some(0);
    }
    let target = &mut state.players[target];
    if target.character == Some(Character::Vindictive)
        || (target.character == Some(Character::Impulsive)
            && target.hand.last().is_some_and(|o| touched.contains(o)))
    {
        target.character_metadata = Some(0);
    }
}
pub(crate) fn character_post_action(state: &mut EngineState, actor: usize, action: RecordedAction) {
    if !state.options.detrimental_characters {
        return;
    }
    let action_type = recorded_action_type(&action);
    let p = &mut state.players[actor];
    match p.character {
        Some(Character::Vindictive | Character::Impulsive) => p.character_metadata = None,
        Some(Character::Indolent) => {
            p.character_metadata = (action_type == RecordedActionType::Play).then_some(0);
        }
        Some(Character::Contrarian) => state.turns_inverted = !state.turns_inverted,
        _ => {}
    }
    for other in &mut state.players {
        if other.character == Some(Character::Stubborn) {
            other.character_metadata = Some(i32::from(action_type));
        }
    }
}
pub(crate) fn needs_second_action(
    state: &mut EngineState,
    actor: usize,
    action: RecordedAction,
) -> bool {
    if !state.options.detrimental_characters {
        return false;
    }
    let cost = clue_cost(state);
    let p = &mut state.players[actor];
    if p.character == Some(Character::Genius) {
        if let RecordedAction::Clue(ClueTurn {
            target,
            clue: WireClue::Color { .. },
        }) = action
        {
            p.character_metadata = Some(int(target.index()));
            return true;
        }
        if matches!(
            action,
            RecordedAction::Clue(ClueTurn {
                clue: WireClue::Rank { .. },
                ..
            })
        ) {
            p.character_metadata = None;
        }
    } else if p.character == Some(Character::Panicky)
        && matches!(action, RecordedAction::Discard(_))
    {
        if p.character_metadata.is_none() && state.clue_tokens <= PANICKY_MAX_CLUES * cost {
            p.character_metadata = Some(0);
            return true;
        }
        if p.character_metadata == Some(0) {
            p.character_metadata = None;
        }
    }
    false
}
pub(crate) fn has_taken_last_turn(state: &EngineState) -> bool {
    let Some(end_turn) = state.end_turn else {
        return false;
    };
    if !state.options.detrimental_characters {
        return end_turn != state.turn + int(state.players.len()) + 1;
    }
    let mut active = state.active_player_index;
    let mut inverted = state.turns_inverted;
    for _ in state.turn + 1..=end_turn {
        active =
            (active + state.players.len() + if inverted { state.players.len() - 1 } else { 1 })
                % state.players.len();
        if active == state.active_player_index {
            return false;
        }
        if state.players[active].character == Some(Character::Contrarian) {
            inverted = !inverted;
        }
    }
    true
}
pub(crate) fn check_character_softlock(state: &mut EngineState) {
    let p = &state.players[state.active_player_index];
    if state.options.detrimental_characters
        && state.clue_tokens < clue_cost(state)
        && p.character_metadata == Some(0)
        && (p.character == Some(Character::Vindictive) || p.character == Some(Character::Insistent))
    {
        state.end = Some(GameEnd {
            condition: EndCondition::CharacterSoftlock,
            player: Some(p.index),
        });
    }
}
