use crate::{
    ActionRejected, AssignedCharacter, Character, Clue, ClueType, CompletionTiming, EndCondition,
    EngineCard, EngineEvent, EnginePlayer, EngineState, GameSetup, Interpretation, Options,
    PlayerAction, RecordedAction, StackDirection, Termination, UNSEEDED, assign_characters,
    characters::{
        character_post_action, character_post_clue, check_character_softlock, has_taken_last_turn,
        needs_second_action, validate_character_action, validate_character_clue,
        validate_character_discard, validate_character_play,
    },
    create_shuffled_deck, get_variant, index,
    rules::{
        calculate_max_score, clue_cost, clue_cost_for, draw_card, follower_misplays,
        has_remaining_play, remove_card, sees_card, touched_by, try_play, variant_for,
    },
    types::{GameEnd, Move, reject, seat, target_card},
};
use anyhow::{Result, ensure};
use hanabi_protocol::{
    GameOverTurn, MAX_CLUES, MAX_PLAYERS, MAX_RANK, MAX_STRIKES, MIN_PLAYERS, MIN_RANK,
    START_CARD_RANK,
};

pub(crate) use hanabi_protocol::MAX_SAFE_INTEGER;
/// The longest seed, and the longest player, variant, or table name, that the engine accepts, in
/// bytes. It bounds memory. It is not the protocol's `MAX_SEED_LENGTH`, which limits the seed that a
/// player can request.
const MAX_SETUP_TEXT_BYTES: usize = 4096;

pub(crate) fn validate_options(options: &Options) -> Result<()> {
    ensure!(
        hanabi_protocol::is_player_count(options.num_players),
        "Games require {MIN_PLAYERS} to {MAX_PLAYERS} players."
    );
    ensure!(
        options.time_control.is_none_or(|time| {
            (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&time.base_seconds)
                && (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&time.per_turn_seconds)
        }),
        "Invalid game timing."
    );
    ensure!(
        !options.variant_name.is_empty() && options.variant_name.len() <= MAX_SETUP_TEXT_BYTES,
        "Invalid variant name."
    );
    ensure!(
        options
            .table_name
            .as_ref()
            .is_none_or(|n| !n.is_empty() && n.len() <= MAX_SETUP_TEXT_BYTES),
        "Invalid table name."
    );
    ensure!(
        options
            .max_players
            .is_none_or(|n| (options.num_players..=MAX_PLAYERS).contains(&n)),
        "Invalid player capacity."
    );
    get_variant(&options.variant_name)?;
    Ok(())
}

pub fn create_game(setup: GameSetup) -> Result<EngineState> {
    validate_options(&setup.options)?;
    ensure!(
        setup.player_names.len() == setup.options.num_players,
        "The game options do not match the ordered players."
    );
    ensure!(
        setup.seed.as_ref().map_or(0, String::len) <= MAX_SETUP_TEXT_BYTES
            && setup
                .player_names
                .iter()
                .all(|n| n.len() <= MAX_SETUP_TEXT_BYTES),
        "Game text is too long."
    );
    let variant = get_variant(&setup.options.variant_name)?;
    let identities = match (setup.deck, &setup.seed) {
        (Some(deck), _) => deck,
        (None, Some(seed)) => create_shuffled_deck(variant, seed),
        (None, None) => anyhow::bail!("A game needs a seed or a deck."),
    };
    ensure!(
        !identities.is_empty()
            && identities.len() <= hanabi_protocol::MAX_DECK_SIZE
            && identities.iter().all(|c| c.suit_index < variant.suits.len()
                && matches!(c.rank, MIN_RANK..=MAX_RANK | START_CARD_RANK)),
        "The prepared deck contains invalid card identities."
    );
    let assigned = if setup.options.detrimental_characters {
        match setup.characters {
            Some(c) => c,
            None => assign_characters(
                variant,
                setup.seed.as_deref().unwrap_or(UNSEEDED),
                &setup.player_names,
            )?,
        }
    } else {
        setup
            .player_names
            .iter()
            .map(|_| AssignedCharacter {
                name: None,
                metadata: None,
            })
            .collect()
    };
    ensure!(
        assigned.len() == setup.player_names.len(),
        "Invalid prepared character assignments."
    );
    ensure!(
        assigned.iter().all(|a| a
            .name
            .as_deref()
            .is_none_or(|name| Character::from_name(name).is_some())),
        "Unknown character assignment."
    );
    let players = setup
        .player_names
        .into_iter()
        .zip(assigned)
        .enumerate()
        .map(|(index, (name, c))| EnginePlayer {
            name,
            index,
            character: c.name.as_deref().and_then(Character::from_name),
            character_metadata: c.metadata,
            hand: vec![],
        })
        .collect();
    let mut state = EngineState {
        active_player_index: 0,
        options: setup.options,
        seed: setup.seed,
        interpretation: setup.interpretation,
        players,
        deck: identities
            .into_iter()
            .enumerate()
            .map(|(order, card)| EngineCard {
                suit_index: card.suit_index,
                rank: card.rank,
                order,
                touched: false,
                discarded: false,
                played: false,
                failed: false,
                cannot_be_played: false,
                insistent_touched: false,
            })
            .collect(),
        deck_index: 0,
        stacks: vec![0; variant.suits.len()],
        stack_starts: vec![0; variant.suits.len()],
        play_stack_directions: variant
            .suits
            .iter()
            .map(|suit| {
                if variant.has_reversed_suits() && !variant.up_or_down {
                    if suit.reversed {
                        StackDirection::Down
                    } else {
                        StackDirection::Up
                    }
                } else {
                    StackDirection::Undecided
                }
            })
            .collect(),
        turn: 0,
        turns_inverted: false,
        clue_tokens: MAX_CLUES * clue_cost_for(variant),
        score: 0,
        max_score: variant.max_score,
        strikes: 0,
        last_clue_type_given: None,
        end: None,
        end_turn: None,
        events: vec![],
        actions: vec![],
    };
    let hand_size = hand_size(&state.options);
    for player in 0..state.players.len() {
        for _ in 0..hand_size {
            draw_card(&mut state, player);
        }
    }
    Ok(state)
}

pub(crate) fn hand_size(options: &Options) -> usize {
    normal_hand_size(options.num_players) + usize::from(options.one_extra_card)
        - usize::from(options.one_less_card)
}

/// Each player's hand size without the options that change it.
pub const fn normal_hand_size(num_players: usize) -> usize {
    match num_players {
        2 | 3 => 5,
        4 | 5 => 4,
        _ => 3,
    }
}

fn check_ongoing(state: &EngineState) -> Result<()> {
    if state.end.is_some() {
        return reject("The game is already ending.");
    }
    Ok(())
}

pub fn validate_action(state: &EngineState, actor: usize, action: &PlayerAction) -> Result<()> {
    check_ongoing(state)?;
    if actor >= state.players.len() {
        return reject("You are not playing in this game.");
    }
    if actor != state.active_player_index {
        return reject("It is not your turn, so you cannot perform an action.");
    }
    validate_character_action(state, actor, *action)?;
    let variant = variant_for(state);
    match Move::of(*action) {
        Move::Card { order, play } => {
            let deck_move = state.options.deck_plays
                && state.deck_index + 1 == state.deck.len()
                && order == state.deck_index;
            let in_hand = state.players[actor].hand.contains(&order);
            if play {
                validate_character_play(state, actor, order)?;
                if !deck_move && !in_hand {
                    return reject("You cannot play a card that is not in your hand.");
                }
            } else {
                if deck_move {
                    if !variant.has_inverted {
                        return reject("You cannot discard the last card in non-Inverted games");
                    }
                    return Ok(());
                }
                if !in_hand {
                    return reject("You cannot discard a card that is not in your hand.");
                }
                if state.clue_tokens >= MAX_CLUES * clue_cost(state) && !variant.has_inverted {
                    return reject(format!(
                        "You cannot discard while the team has {MAX_CLUES} clues."
                    ));
                }
                validate_character_discard(state, actor)?;
            }
        }
        Move::Clue { target, clue } => {
            if target >= state.players.len() {
                return reject("That is an invalid clue target.");
            }
            if target == actor {
                return reject("You cannot give a clue to yourself.");
            }
            if state.clue_tokens < clue_cost(state) {
                return reject("You need at least 1 clue token available in order to give a clue.");
            }
            if clue.clue_type == ClueType::Color
                && index(clue.value).is_none_or(|value| value >= variant.clue_colors.len())
            {
                return reject(format!(
                    "You cannot give a color clue with a value of \"{}\".",
                    clue.value
                ));
            }
            if clue.clue_type == ClueType::Rank && !variant.clue_ranks.contains(&clue.value) {
                return reject(format!(
                    "You cannot give a rank clue with a value of \"{}\".",
                    clue.value
                ));
            }
            if variant.alternating_clues && Some(clue.clue_type) == state.last_clue_type_given {
                return reject(
                    "You cannot give two clues of the same time in a row in this variant.",
                );
            }
            validate_character_clue(state, actor, target, clue)?;
            let may_touch_nothing = state.options.empty_clues
                || match clue.clue_type {
                    ClueType::Color => variant.color_clues_touch_nothing,
                    ClueType::Rank => variant.rank_clues_touch_nothing,
                };
            let touches_a_card = touched_by(state, target, clue)
                .iter()
                .any(|&order| sees_card(state, actor, target, order));
            if !touches_a_card && !may_touch_nothing {
                return Err(ActionRejected {
                    message: "You cannot give a clue that touches 0 cards in the hand.".into(),
                    silent: state.options.speedrun,
                }
                .into());
            }
        }
    }
    Ok(())
}

fn discard(state: &mut EngineState, player: usize, order: usize) {
    let card = &mut state.deck[order];
    if !card.failed {
        state
            .actions
            .push(RecordedAction::Discard(target_card(order)));
    }
    card.discarded = true;
    state.events.push(EngineEvent::Discard {
        player_index: player,
        order,
        suit_index: Some(card.suit_index),
        rank: Some(card.rank),
        failed: card.failed,
    });
    state.max_score = state.max_score.min(calculate_max_score(state));
}
fn play(state: &mut EngineState, player: usize, order: usize) {
    state.actions.push(RecordedAction::Play(target_card(order)));
    // Stack direction/start changes precede Follower's forced failure.
    let playable = try_play(state, order);
    if !playable || follower_misplays(state, player, &state.deck[order]) {
        state.deck[order].failed = true;
        state.strikes += 1;
        discard(state, player, order);
        return;
    }
    let v = variant_for(state);
    let card = &mut state.deck[order];
    card.played = true;
    state.score += 1;
    state.stacks[card.suit_index] = card.rank;
    state.events.push(EngineEvent::Play {
        player_index: player,
        order,
        suit_index: Some(card.suit_index),
        rank: Some(card.rank),
    });
    let finished = if v.has_reversed_suits() {
        (card.rank == MIN_RANK || card.rank == MAX_RANK)
            && state.play_stack_directions[card.suit_index] == StackDirection::Finished
    } else if v.sudoku {
        state.play_stack_directions[card.suit_index] == StackDirection::Finished
    } else {
        card.rank == MAX_RANK
    };
    if finished && !v.throw_it_in_a_hole {
        state.clue_tokens = (state.clue_tokens + 1).min(MAX_CLUES * clue_cost(state));
    }
    state.max_score = state.max_score.min(calculate_max_score(state));
}
fn give_clue(
    state: &mut EngineState,
    actor: usize,
    action: PlayerAction,
    target: usize,
    clue: Clue,
) {
    let touched = touched_by(state, target, clue);
    state.actions.push(RecordedAction::from(action));
    state.clue_tokens -= clue_cost(state);
    state.last_clue_type_given = Some(clue.clue_type);
    for &order in &touched {
        state.deck[order].touched = true;
    }
    state.events.push(EngineEvent::Clue {
        clue: Some(clue),
        giver: actor,
        target,
        list: touched.clone(),
        turn: state.turn,
    });
    character_post_clue(state, actor, target, clue, &touched);
}

fn check_end(state: &mut EngineState) -> bool {
    use EndCondition::{
        AllOrNothingFail, AllOrNothingSoftlock, CharacterSoftlock, IdleTimeout, Normal,
        SpeedrunFail, Strikeout, TerminatedByPlayer, TerminatedByVote, Timeout,
    };
    if state.end.is_some_and(|end| {
        matches!(
            end.condition,
            Timeout | TerminatedByPlayer | TerminatedByVote | IdleTimeout | CharacterSoftlock
        )
    }) {
        return true;
    }
    let v = variant_for(state);
    let (condition, player) = if state.strikes == MAX_STRIKES {
        (Strikeout, None)
    } else if state.options.speedrun && state.max_score < v.max_score {
        (SpeedrunFail, None)
    } else if state.options.all_or_nothing && state.max_score < v.max_score {
        (AllOrNothingFail, None)
    } else if state.options.all_or_nothing
        && state.players[state.active_player_index].hand.is_empty()
        && state.clue_tokens < clue_cost(state)
    {
        (AllOrNothingSoftlock, Some(state.active_player_index))
    } else if Some(state.turn) == state.end_turn
        || state.score == state.max_score
        || !has_remaining_play(state)
    {
        (Normal, None)
    } else {
        return false;
    };
    state.end = Some(GameEnd { condition, player });
    true
}
fn finish_action(
    state: &mut EngineState,
    actor: usize,
    action: RecordedAction,
    timing: Option<CompletionTiming>,
    votes: Option<Vec<usize>>,
) {
    character_post_action(state, actor, action);
    if has_taken_last_turn(state) {
        for &order in &state.players[actor].hand {
            state.deck[order].cannot_be_played = true;
        }
    }
    if !needs_second_action(state, actor, action) {
        state.turn += 1;
        let n = state.players.len();
        state.active_player_index =
            (state.active_player_index + if state.turns_inverted { n - 1 } else { 1 }) % n;
    }
    check_character_softlock(state);
    let game_over = check_end(state);
    if game_over && let Some(end) = state.end {
        state.events.push(EngineEvent::GameOver {
            end_condition: end.condition,
            player_index: end.player,
            votes,
        });
    }
    state.events.push(EngineEvent::Turn {
        num: state.turn,
        current_player_index: state.end.is_none().then_some(state.active_player_index),
    });
    if let Some(end) = state.end {
        if end.condition != EndCondition::Normal {
            state.score = 0;
        }
        if state.interpretation == Interpretation::Live
            && let Some(timing) = timing
        {
            state.events.push(EngineEvent::PlayerTimes {
                player_times: timing.player_times,
                duration: timing.duration,
            });
        }
    }
}
fn validate_timing(state: &EngineState, timing: Option<&CompletionTiming>) -> Result<()> {
    if let Some(timing) = timing {
        ensure!(
            timing.player_times.len() == state.players.len()
                && (0..=MAX_SAFE_INTEGER).contains(&timing.duration)
                && timing
                    .player_times
                    .iter()
                    .all(|t| (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(t)),
            "Invalid completion timing."
        );
    }
    Ok(())
}

/// Applies a player's action to a game. Its events are appended to `state.events`. A rejected
/// action leaves the state as it was: every check runs before the first change.
pub fn apply_action(
    state: &mut EngineState,
    actor: usize,
    action: &PlayerAction,
    timing: Option<CompletionTiming>,
) -> Result<()> {
    validate_action(state, actor, action)?;
    validate_timing(state, timing.as_ref())?;
    match Move::of(*action) {
        Move::Clue { target, clue } => give_clue(state, actor, *action, target, clue),
        Move::Card {
            order,
            play: chose_play,
        } => {
            let deck_move = state.options.deck_plays
                && state.deck_index + 1 == state.deck.len()
                && order == state.deck_index;
            let inverted = state.interpretation == Interpretation::Live
                && variant_for(state).suits[state.deck[order].suit_index].inverted;
            let is_play = chose_play != inverted;
            ensure!(
                !(is_play
                    && variant_for(state).sudoku
                    && state.deck[order].rank == START_CARD_RANK
                    && state.stacks[state.deck[order].suit_index] == 0),
                "The prepared card cannot start a Sudoku stack."
            );
            if !is_play && state.clue_tokens < MAX_CLUES * clue_cost(state) {
                state.clue_tokens += 1;
            }
            if deck_move {
                draw_card(state, actor);
            }
            remove_card(state, actor, order);
            if is_play {
                play(state, actor, order);
            } else {
                discard(state, actor, order);
            }
            if !deck_move {
                draw_card(state, actor);
            }
        }
    }
    finish_action(state, actor, RecordedAction::from(*action), timing, None);
    Ok(())
}

/// Ends a game. This is a trusted server operation, not a player action. Its events are appended
/// to `state.events`. A rejected termination leaves the state as it was.
pub fn terminate_game(
    state: &mut EngineState,
    termination: Termination,
    mut timing: Option<CompletionTiming>,
) -> Result<()> {
    let previous = &*state;
    check_ongoing(previous)?;
    validate_timing(previous, timing.as_ref())?;
    if termination.actor_index >= previous.players.len() {
        return reject("You are not playing in this game.");
    }
    if !matches!(
        termination.condition,
        EndCondition::AllOrNothingFail
            | EndCondition::IdleTimeout
            | EndCondition::TerminatedByPlayer
            | EndCondition::TerminatedByVote
            | EndCondition::Timeout
    ) {
        return reject("That is not a valid value for the end game action.");
    }
    if termination
        .player_index
        .is_some_and(|player| player >= previous.players.len())
        || (termination.condition == EndCondition::Timeout && termination.player_index.is_none())
    {
        return reject("That is not a valid player for a timeout.");
    }
    if let Some(votes) = &termination.votes {
        ensure!(
            votes.len() <= previous.players.len()
                && votes
                    .iter()
                    .enumerate()
                    .all(|(i, v)| *v < previous.players.len() && !votes[..i].contains(v)),
            "Invalid termination votes."
        );
    }
    let timed_out = termination
        .player_index
        .filter(|_| termination.condition == EndCondition::Timeout);
    state.end = Some(GameEnd {
        condition: termination.condition,
        player: termination.player_index,
    });
    let action = RecordedAction::GameOver(GameOverTurn {
        end_condition: termination.condition,
        player_index: termination
            .player_index
            .filter(|_| {
                !matches!(
                    termination.condition,
                    EndCondition::TerminatedByVote | EndCondition::IdleTimeout
                )
            })
            .map(seat),
    });
    if termination.condition != EndCondition::AllOrNothingFail {
        state.actions.push(action);
    }
    if let (Some(player), Some(t)) = (timed_out, &mut timing) {
        t.player_times[player] = 0;
    }
    finish_action(
        state,
        termination.actor_index,
        action,
        timing,
        termination.votes,
    );
    Ok(())
}
