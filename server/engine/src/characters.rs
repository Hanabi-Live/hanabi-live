use crate::{
    Character, CharacterState, Clue, ClueType, EndCondition, EnginePlayer, EngineState, GameEnd,
    PlayerAction, RecordedAction, RecordedActionType, int, is_card_touched, recorded_action_type,
    rules::{clue_cost, touched_by, variant_for},
    types::reject,
};
use anyhow::Result;
use hanabi_protocol::{Clue as WireClue, ClueTurn, MAX_RANK, PANICKY_MAX_CLUES};

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
    let Some(character) = p.character_state else {
        return Ok(());
    };
    let action_type = recorded_action_type(&RecordedAction::from(action));
    let clue = action_type.is_clue();
    let reason = match character {
        CharacterState::Vindictive { clued: true } if !clue => {
            Some("so you must give a clue if you have been given a clue on this go-around.")
        }
        CharacterState::Insistent { cluing: true } if !clue => {
            Some("so you must continue to clue the same card until it is played or discarded.")
        }
        CharacterState::Impulsive {
            slot_one_clued: true,
        } if !matches!(action, PlayerAction::Play(card)
            if p.hand.last() == Some(&card.order.index())) =>
        {
            Some("so you must play your slot 1 card after it has been clued.")
        }
        CharacterState::Indolent { played: true } if action_type == RecordedActionType::Play => {
            Some("so you cannot play a card if you played one in the last round.")
        }
        CharacterState::Stubborn {
            previous_action: Some(previous),
        } if previous == action_type || (clue && previous.is_clue()) => {
            Some("so you cannot perform the same kind of action that the previous player did.")
        }
        CharacterState::Genius {
            second_clue_target: Some(second),
        } => match action {
            PlayerAction::Clue(ClueTurn {
                target,
                clue: WireClue::Rank { .. },
            }) if target.index() == second => None,
            PlayerAction::Clue(ClueTurn {
                clue: WireClue::Rank { .. },
                ..
            }) => Some("so you must give the second clue to the same player."),
            _ => Some("so you must now give a rank clue."),
        },
        CharacterState::Panicky {
            discarding_again: true,
        } if action_type != RecordedActionType::Discard => {
            return reject_character(
                Character::Panicky,
                &format!(
                    "so you must discard again since there are {PANICKY_MAX_CLUES} or less clues available."
                ),
            );
        }
        _ => None,
    };
    match reason {
        Some(reason) => reject_character(character.character(), reason),
        None => Ok(()),
    }
}
pub(crate) fn validate_character_play(
    state: &EngineState,
    actor: usize,
    order: usize,
) -> Result<()> {
    let p = &state.players[actor];
    if state.options.detrimental_characters
        && p.is(Character::Hesitant)
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
    let reason = match p.character() {
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
    if let (Some(reason), Some(character)) = (reason, p.character()) {
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
    let clue = given.clue_type;
    let Some(character) = p.character_state else {
        return validate_clue_target(target, clue, given.value);
    };
    let reason = match character {
        CharacterState::Fuming { color } if clue == ClueType::Color && given.value != color => {
            Some("so you can not give that type of clue.")
        }
        CharacterState::Dumbfounded { rank } if clue == ClueType::Rank && given.value != rank => {
            Some("so you can not give that type of clue.")
        }
        // Inept cannot touch any card that a clue of their color would touch.
        CharacterState::Inept { color }
            if touched.iter().any(|o| {
                let card = &state.deck[*o];
                is_card_touched(
                    variant_for(state),
                    ClueType::Color,
                    color,
                    card.suit_index,
                    card.rank,
                )
            }) =>
        {
            Some("so you cannot give clues that touch cards of a specific color.")
        }
        CharacterState::Awkward { rank } if touched.iter().any(|o| state.deck[*o].rank == rank) => {
            return reject_character(
                Character::Awkward,
                &format!("so you cannot give clues that touch cards with a rank of {rank}."),
            );
        }
        CharacterState::Conservative if touched.len() != 1 => {
            Some("so you can only give clues that touch a single card.")
        }
        CharacterState::Greedy if touched.len() < GREEDY_MIN_TOUCHED => {
            return reject_character(
                Character::Greedy,
                &format!("so you can only give clues that touch {GREEDY_MIN_TOUCHED}+ cards."),
            );
        }
        CharacterState::Picky if (given.value + i32::from(clue == ClueType::Color)) % 2 == 0 => {
            Some("so you can only clue odd numbers or odd colors.")
        }
        CharacterState::Spiteful if target_index == (actor + 1) % state.players.len() => {
            Some("so you cannot clue the player to your left.")
        }
        CharacterState::Insolent
            if target_index == (actor + state.players.len() - 1) % state.players.len() =>
        {
            Some("so you cannot clue the player to your right.")
        }
        CharacterState::Miser if state.clue_tokens < MISER_MIN_CLUES * clue_cost(state) => {
            return reject_character(
                Character::Miser,
                &format!(
                    "so you cannot give a clue unless there are {MISER_MIN_CLUES} or more clues available."
                ),
            );
        }
        CharacterState::Compulsive
            if touched
                .iter()
                .all(|o| Some(o) != target.hand.first() && Some(o) != target.hand.last()) =>
        {
            Some(
                "so you can only give a clue if it touches either the newest or oldest card in a hand.",
            )
        }
        CharacterState::MoodSwings { previous_clue } if previous_clue == Some(clue) => {
            Some("so cannot give the same clue type twice in a row.")
        }
        CharacterState::Insistent { cluing: true }
            if touched.iter().all(|o| !state.deck[*o].insistent_touched) =>
        {
            Some("so you must continue to clue a card until it is played or discarded.")
        }
        CharacterState::Genius {
            second_clue_target: None,
        } if state.clue_tokens < GENIUS_MIN_CLUES * clue_cost(state) => {
            return reject_character(
                Character::Genius,
                &format!(
                    "so there needs to be at least {GENIUS_MIN_CLUES} clues available for you to give a clue."
                ),
            );
        }
        CharacterState::Genius {
            second_clue_target: None,
        } if clue != ClueType::Color => Some("so you must give a color clue first."),
        _ => None,
    };
    if let Some(reason) = reason {
        return reject_character(character.character(), reason);
    }
    validate_clue_target(target, clue, given.value)
}

/// Checks a clue against the character of the player who receives it.
fn validate_clue_target(target: &EnginePlayer, clue: ClueType, value: i32) -> Result<()> {
    if target.is(Character::Vulnerable)
        && clue == ClueType::Rank
        && VULNERABLE_RANKS.contains(&value)
    {
        let [low, high] = VULNERABLE_RANKS;
        return reject(format!(
            "You cannot give a number {low} or number {high} clue to a Vulnerable character."
        ));
    }
    if target.is(Character::ColorBlind) && clue == ClueType::Color {
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
    match &mut state.players[actor].character_state {
        Some(CharacterState::MoodSwings { previous_clue }) => {
            *previous_clue = Some(clue.clue_type);
        }
        Some(CharacterState::Insistent { cluing }) if !*cluing => {
            *cluing = true;
            for o in touched {
                state.deck[*o].insistent_touched = true;
            }
        }
        _ => {}
    }
    let target = &mut state.players[target];
    let slot_one_touched = target.hand.last().is_some_and(|o| touched.contains(o));
    match &mut target.character_state {
        Some(CharacterState::Vindictive { clued }) => *clued = true,
        Some(CharacterState::Impulsive { slot_one_clued }) if slot_one_touched => {
            *slot_one_clued = true;
        }
        _ => {}
    }
}
pub(crate) fn character_post_action(state: &mut EngineState, actor: usize, action: RecordedAction) {
    if !state.options.detrimental_characters {
        return;
    }
    let action_type = recorded_action_type(&action);
    match &mut state.players[actor].character_state {
        Some(CharacterState::Vindictive { clued }) => *clued = false,
        Some(CharacterState::Impulsive { slot_one_clued }) => *slot_one_clued = false,
        Some(CharacterState::Indolent { played }) => {
            *played = action_type == RecordedActionType::Play;
        }
        Some(CharacterState::Contrarian) => state.turns_inverted = !state.turns_inverted,
        _ => {}
    }
    for other in &mut state.players {
        if let Some(CharacterState::Stubborn { previous_action }) = &mut other.character_state {
            *previous_action = Some(action_type);
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
    let low_on_clues = state.clue_tokens <= PANICKY_MAX_CLUES * clue_cost(state);
    match &mut state.players[actor].character_state {
        Some(CharacterState::Genius { second_clue_target }) => match action {
            RecordedAction::Clue(ClueTurn {
                target,
                clue: WireClue::Color { .. },
            }) => {
                *second_clue_target = Some(target.index());
                true
            }
            RecordedAction::Clue(ClueTurn {
                clue: WireClue::Rank { .. },
                ..
            }) => {
                *second_clue_target = None;
                false
            }
            _ => false,
        },
        // The first discard with few clues left needs a second one, which ends the turn.
        Some(CharacterState::Panicky { discarding_again })
            if matches!(action, RecordedAction::Discard(_)) =>
        {
            *discarding_again = !*discarding_again && low_on_clues;
            *discarding_again
        }
        _ => false,
    }
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
        if state.players[active].is(Character::Contrarian) {
            inverted = !inverted;
        }
    }
    true
}
pub(crate) fn check_character_softlock(state: &mut EngineState) {
    let p = &state.players[state.active_player_index];
    if state.options.detrimental_characters
        && state.clue_tokens < clue_cost(state)
        && matches!(
            p.character_state,
            Some(
                CharacterState::Vindictive { clued: true }
                    | CharacterState::Insistent { cluing: true }
            )
        )
    {
        state.end = Some(GameEnd {
            condition: EndCondition::CharacterSoftlock,
            player: Some(p.index),
        });
    }
}
