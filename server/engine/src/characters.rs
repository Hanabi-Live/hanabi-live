use crate::{
    Character, ClueType, EndCondition, EnginePlayer, EngineState, PlayerAction, RecordedAction,
    RecordedActionType, clue_type, index, int,
    rules::{clue_cost, touched_orders},
    types::reject,
};
use anyhow::Result;

/// The clues at or below which a Panicky player must discard twice.
const PANICKY_MAX_CLUES: i32 = 4;
/// The clues that a Miser needs before giving one.
const MISER_MIN_CLUES: i32 = 4;

fn reject_character<T>(player: &EnginePlayer, reason: &str) -> Result<T> {
    reject(format!("You are {}, {reason}", player.character))
}

pub(crate) fn validate_character_action(
    state: &EngineState,
    actor: usize,
    action: &PlayerAction,
) -> Result<()> {
    if !state.options.detrimental_characters {
        return Ok(());
    }
    let p = &state.players[actor];
    let clue = action.action_type.is_clue();
    let m = p.character_metadata;
    let previous = RecordedActionType::try_from(m);
    let reason = match p.character() {
        Some(Character::Vindictive) if m == 0 && !clue => {
            Some("so you must give a clue if you have been given a clue on this go-around.")
        }
        Some(Character::Insistent) if m != -1 && !clue => {
            Some("so you must continue to clue the same card until it is played or discarded.")
        }
        Some(Character::Impulsive)
            if m == 0
                && (action.action_type != RecordedActionType::Play
                    || p.hand.last().copied().map(int) != Some(action.target)) =>
        {
            Some("so you must play your slot 1 card after it has been clued.")
        }
        Some(Character::Indolent) if action.action_type == RecordedActionType::Play && m == 0 => {
            Some("so you cannot play a card if you played one in the last round.")
        }
        // The metadata is the type of the previous player's action, and every clue counts as one.
        Some(Character::Stubborn)
            if previous == Ok(action.action_type)
                || (clue && previous.is_ok_and(RecordedActionType::is_clue)) =>
        {
            Some("so you cannot perform the same kind of action that the previous player did.")
        }
        _ => None,
    };
    if let Some(reason) = reason {
        return reject_character(p, reason);
    }
    if m != -1 {
        if p.character() == Some(Character::Genius) {
            if action.action_type != RecordedActionType::RankClue {
                return reject_character(p, "so you must now give a rank clue.");
            }
            if action.target != m {
                return reject_character(p, "so you must give the second clue to the same player.");
            }
        } else if p.character() == Some(Character::Panicky)
            && action.action_type != RecordedActionType::Discard
        {
            return reject_character(
                p,
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
    action: &PlayerAction,
) -> Result<()> {
    let p = &state.players[actor];
    if state.options.detrimental_characters
        && p.character() == Some(Character::Hesitant)
        && p.hand.last().copied().map(int) == Some(action.target)
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
        Some(Character::Wasteful) if state.clue_tokens >= 2 * clue_cost(state) => {
            Some("so you cannot discard if there are 2 or more clues available.")
        }
        _ => None,
    };
    if let Some(reason) = reason {
        return reject_character(p, reason);
    }
    Ok(())
}
pub(crate) fn validate_character_clue(
    state: &EngineState,
    actor: usize,
    action: &PlayerAction,
) -> Result<()> {
    if !state.options.detrimental_characters {
        return Ok(());
    }
    let p = &state.players[actor];
    let target = &state.players[usize::try_from(action.target)?];
    let touched = touched_orders(state, action);
    let m = p.character_metadata;
    let clue = clue_type(action.action_type);
    let reason = match p.character() {
        Some(Character::Fuming) if clue == Some(ClueType::Color) && action.value != m => {
            Some("so you can not give that type of clue.")
        }
        Some(Character::Dumbfounded) if clue == Some(ClueType::Rank) && action.value != m => {
            Some("so you can not give that type of clue.")
        }
        Some(Character::Inept) if touched.iter().any(|o| int(state.deck[*o].suit_index) == m) => {
            Some("so you cannot give clues that touch a specific suit.")
        }
        Some(Character::Awkward) if touched.iter().any(|o| state.deck[*o].rank == m) => {
            return reject_character(
                p,
                &format!("so you cannot give clues that touch cards with a rank of {m}."),
            );
        }
        Some(Character::Conservative) if touched.len() != 1 => {
            Some("so you can only give clues that touch a single card.")
        }
        Some(Character::Greedy) if touched.len() < 2 => {
            Some("so you can only give clues that touch 2+ cards.")
        }
        Some(Character::Picky)
            if (action.value + i32::from(clue == Some(ClueType::Color))) % 2 == 0 =>
        {
            Some("so you can only clue odd numbers or odd colors.")
        }
        Some(Character::Spiteful)
            if index(action.target) == Some((actor + 1) % state.players.len()) =>
        {
            Some("so you cannot clue the player to your left.")
        }
        Some(Character::Insolent)
            if index(action.target)
                == Some((actor + state.players.len() - 1) % state.players.len()) =>
        {
            Some("so you cannot clue the player to your right.")
        }
        Some(Character::Miser) if state.clue_tokens < MISER_MIN_CLUES * clue_cost(state) => {
            return reject_character(
                p,
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
        Some(Character::MoodSwings) if clue.map(i32::from) == Some(m) => {
            Some("so cannot give the same clue type twice in a row.")
        }
        Some(Character::Insistent)
            if m != -1 && touched.iter().all(|o| !state.deck[*o].insistent_touched) =>
        {
            Some("so you must continue to clue a card until it is played or discarded.")
        }
        Some(Character::Genius) if m == -1 && state.clue_tokens < 2 * clue_cost(state) => {
            Some("so there needs to be at least two clues available for you to give a clue.")
        }
        Some(Character::Genius) if m == -1 && clue != Some(ClueType::Color) => {
            Some("so you must give a color clue first.")
        }
        _ => None,
    };
    if let Some(reason) = reason {
        return reject_character(p, reason);
    }
    if target.character() == Some(Character::Vulnerable)
        && clue == Some(ClueType::Rank)
        && (action.value == 2 || action.value == 5)
    {
        return reject("You cannot give a number 2 or number 5 clue to a Vulnerable character.");
    }
    if target.character() == Some(Character::ColorBlind) && clue == Some(ClueType::Color) {
        return reject("You cannot give that color clue to a Color-Blind character.");
    }
    Ok(())
}
pub(crate) fn character_post_clue(
    state: &mut EngineState,
    actor: usize,
    action: &PlayerAction,
    touched: &[usize],
) {
    if !state.options.detrimental_characters {
        return;
    }
    let p = &mut state.players[actor];
    if p.character() == Some(Character::MoodSwings) {
        p.character_metadata = clue_type(action.action_type).map_or(-1, i32::from);
    } else if p.character() == Some(Character::Insistent) && p.character_metadata == -1 {
        for o in touched {
            state.deck[*o].insistent_touched = true;
        }
        p.character_metadata = 0;
    }
    let target = &mut state.players[index(action.target).expect("the clue target was validated")];
    if target.character() == Some(Character::Vindictive)
        || (target.character() == Some(Character::Impulsive)
            && target.hand.last().is_some_and(|o| touched.contains(o)))
    {
        target.character_metadata = 0;
    }
}
pub(crate) fn character_post_action(
    state: &mut EngineState,
    actor: usize,
    action: &RecordedAction,
) {
    if !state.options.detrimental_characters {
        return;
    }
    let p = &mut state.players[actor];
    match p.character() {
        Some(Character::Vindictive | Character::Impulsive) => p.character_metadata = -1,
        Some(Character::Indolent) => {
            p.character_metadata = if action.action_type == RecordedActionType::Play {
                0
            } else {
                -1
            };
        }
        Some(Character::Contrarian) => state.turns_inverted = !state.turns_inverted,
        _ => {}
    }
    for other in &mut state.players {
        if other.character() == Some(Character::Stubborn) {
            other.character_metadata = i32::from(action.action_type);
        }
    }
}
pub(crate) fn needs_second_action(
    state: &mut EngineState,
    actor: usize,
    action: &RecordedAction,
) -> bool {
    if !state.options.detrimental_characters {
        return false;
    }
    let cost = clue_cost(state);
    let p = &mut state.players[actor];
    if p.character() == Some(Character::Genius) {
        if action.action_type == RecordedActionType::ColorClue {
            p.character_metadata = action.target;
            return true;
        }
        if action.action_type == RecordedActionType::RankClue {
            p.character_metadata = -1;
        }
    } else if p.character() == Some(Character::Panicky)
        && action.action_type == RecordedActionType::Discard
    {
        if p.character_metadata == -1 && state.clue_tokens <= PANICKY_MAX_CLUES * cost {
            p.character_metadata = 0;
            return true;
        }
        if p.character_metadata == 0 {
            p.character_metadata = -1;
        }
    }
    false
}
pub(crate) fn has_taken_last_turn(state: &EngineState) -> bool {
    if state.end_turn == -1 {
        return false;
    }
    if !state.options.detrimental_characters {
        return state.end_turn != state.turn + int(state.players.len()) + 1;
    }
    let mut active = state.active_player_index;
    let mut inverted = state.turns_inverted;
    for _ in state.turn + 1..=state.end_turn {
        active =
            (active + state.players.len() + if inverted { state.players.len() - 1 } else { 1 })
                % state.players.len();
        if active == state.active_player_index {
            return false;
        }
        if state.players[active].character() == Some(Character::Contrarian) {
            inverted = !inverted;
        }
    }
    true
}
pub(crate) fn check_character_softlock(state: &mut EngineState) {
    let p = &state.players[state.active_player_index];
    if state.options.detrimental_characters
        && state.clue_tokens < clue_cost(state)
        && p.character_metadata == 0
        && (p.character() == Some(Character::Vindictive)
            || p.character() == Some(Character::Insistent))
    {
        state.end_condition = EndCondition::CharacterSoftlock;
        state.end_player = int(p.index);
    }
}
