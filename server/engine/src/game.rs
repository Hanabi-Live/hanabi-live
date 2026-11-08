use crate::{
    ActionRejected, AssignedCharacter, Character, Clue, ClueType, CompletionTiming, EndCondition,
    EngineCard, EngineEvent, EnginePlayer, EngineState, GameSetup, Interpretation, NO_CHARACTER,
    Options, PlayerAction, RecordedAction, RecordedActionType, StackDirection, Termination,
    Transition, assign_characters,
    characters::{
        character_post_action, character_post_clue, check_character_softlock, has_taken_last_turn,
        needs_second_action, validate_character_action, validate_character_clue,
        validate_character_discard, validate_character_play,
    },
    clue_type, create_shuffled_deck, get_variant, index, int,
    rules::{
        calculate_max_score, clue_cost, clue_cost_for, draw_card, follower_misplays,
        has_remaining_play, remove_card, sees_card, touched_orders, try_play, variant_for,
    },
    types::reject,
};
use anyhow::{Result, ensure};
use hanabi_protocol::{
    MAX_CLUES, MAX_PLAYERS, MAX_RANK, MAX_STRIKES, MIN_PLAYERS, MIN_RANK, NO_VALUE, START_CARD_RANK,
};

pub(crate) use hanabi_protocol::MAX_SAFE_INTEGER;
/// `MAX_SAFE_INTEGER`, which a float represents exactly.
#[expect(
    clippy::cast_precision_loss,
    reason = "a float represents MAX_SAFE_INTEGER exactly"
)]
const MAX_SAFE_FLOAT: f64 = MAX_SAFE_INTEGER as f64;
/// The most events a game can record.
pub(crate) const MAX_EVENTS: usize = 4096;
/// The longest seed, and the longest player, variant, or character name, in bytes.
pub(crate) const MAX_SEED_LENGTH: usize = 4096;
pub(crate) const MAX_NAME_LENGTH: usize = 4096;

pub(crate) fn validate_options(options: &Options) -> Result<()> {
    ensure!(
        hanabi_protocol::is_player_count(options.num_players),
        "Games require {MIN_PLAYERS} to {MAX_PLAYERS} players."
    );
    ensure!(
        options.time_base.is_finite()
            && options.time_base.abs() <= MAX_SAFE_FLOAT
            && (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&options.time_per_turn),
        "Invalid game timing."
    );
    ensure!(
        !options.variant_name.is_empty() && options.variant_name.len() <= MAX_NAME_LENGTH,
        "Invalid variant name."
    );
    ensure!(
        options
            .table_name
            .as_ref()
            .is_none_or(|n| !n.is_empty() && n.len() <= MAX_NAME_LENGTH),
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

pub fn create_game(setup: GameSetup) -> Result<Transition> {
    validate_options(&setup.options)?;
    ensure!(
        setup.player_names.len() == setup.options.num_players,
        "The game options do not match the ordered players."
    );
    ensure!(
        setup.seed.len() <= MAX_SEED_LENGTH
            && setup
                .player_names
                .iter()
                .all(|n| n.len() <= MAX_NAME_LENGTH),
        "Game text is too long."
    );
    let variant = get_variant(&setup.options.variant_name)?;
    let identities = match setup.deck {
        Some(deck) => deck,
        None => create_shuffled_deck(variant, &setup.seed)?,
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
            None => assign_characters(variant, &setup.seed, &setup.player_names)?,
        }
    } else {
        setup
            .player_names
            .iter()
            .map(|_| AssignedCharacter {
                name: String::new(),
                metadata: NO_VALUE,
            })
            .collect()
    };
    ensure!(
        assigned.len() == setup.player_names.len(),
        "Invalid prepared character assignments."
    );
    ensure!(
        assigned.iter().all(|a| a.name == NO_CHARACTER
            || a.name.is_empty()
            || Character::from_name(&a.name).is_some()),
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
            character: c.name,
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
                slot: 0,
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
        last_clue_type_given: NO_VALUE,
        end_condition: EndCondition::InProgress,
        end_player: NO_VALUE,
        end_turn: NO_VALUE,
        started_timer: false,
        paused: false,
        events: vec![],
        actions: vec![],
    };
    let hand_size = hand_size(&state.options);
    for player in 0..state.players.len() {
        for _ in 0..hand_size {
            draw_card(&mut state, player);
        }
    }
    Ok(Transition {
        events: state.events.clone(),
        state,
    })
}

pub(crate) fn hand_size(options: &Options) -> usize {
    normal_hand_size(options.num_players) + usize::from(options.one_extra_card)
        - usize::from(options.one_less_card)
}

/// The largest hand: the fewest players, with one extra card.
pub(crate) const MAX_HAND_SIZE: usize = normal_hand_size(MIN_PLAYERS) + 1;

/// Each player's hand size without the options that change it.
pub const fn normal_hand_size(num_players: usize) -> usize {
    match num_players {
        2 | 3 => 5,
        4 | 5 => 4,
        _ => 3,
    }
}

fn check_ongoing(state: &EngineState) -> Result<()> {
    if state.end_condition != EndCondition::InProgress {
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
    if state.paused {
        return reject("You cannot perform a game action when the game is paused.");
    }
    if action.action_type.is_game_over() {
        return reject("That is not a valid action type.");
    }
    validate_character_action(state, actor, action)?;
    let variant = variant_for(state);
    let target = usize::try_from(action.target).ok();
    let deck_move = state.options.deck_plays
        && state.deck_index + 1 == state.deck.len()
        && target == Some(state.deck_index);
    if action.action_type == RecordedActionType::Play {
        validate_character_play(state, actor, action)?;
        if !deck_move && !target.is_some_and(|o| state.players[actor].hand.contains(&o)) {
            return reject("You cannot play a card that is not in your hand.");
        }
    } else if action.action_type == RecordedActionType::Discard {
        if deck_move {
            if !variant.has_inverted {
                return reject("You cannot discard the last card in non-Inverted games");
            }
            return Ok(());
        }
        if !target.is_some_and(|o| state.players[actor].hand.contains(&o)) {
            return reject("You cannot discard a card that is not in your hand.");
        }
        if state.clue_tokens >= MAX_CLUES * clue_cost(state) && !variant.has_inverted {
            return reject(format!(
                "You cannot discard while the team has {MAX_CLUES} clues."
            ));
        }
        validate_character_discard(state, actor)?;
    } else {
        let Some(target) = target.filter(|&t| t < state.players.len()) else {
            return reject("That is an invalid clue target.");
        };
        if target == actor {
            return reject("You cannot give a clue to yourself.");
        }
        if state.clue_tokens < clue_cost(state) {
            return reject("You need at least 1 clue token available in order to give a clue.");
        }
        if action.action_type == RecordedActionType::ColorClue
            && index(action.value).is_none_or(|value| value >= variant.clue_colors.len())
        {
            return reject(format!(
                "You cannot give a color clue with a value of \"{}\".",
                action.value
            ));
        }
        if action.action_type == RecordedActionType::RankClue
            && !variant.clue_ranks.contains(&action.value)
        {
            return reject(format!(
                "You cannot give a rank clue with a value of \"{}\".",
                action.value
            ));
        }
        if variant.alternating_clues
            && clue_type(action.action_type).map(i32::from) == Some(state.last_clue_type_given)
        {
            return reject("You cannot give two clues of the same time in a row in this variant.");
        }
        validate_character_clue(state, actor, action)?;
        let may_touch_nothing = state.options.empty_clues
            || (action.action_type == RecordedActionType::ColorClue
                && variant.color_clues_touch_nothing)
            || (action.action_type == RecordedActionType::RankClue
                && variant.rank_clues_touch_nothing);
        let touches_a_card = touched_orders(state, action)
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
    Ok(())
}

fn discard(state: &mut EngineState, player: usize, order: usize) {
    let card = &mut state.deck[order];
    if !card.failed {
        state.actions.push(RecordedAction {
            action_type: RecordedActionType::Discard,
            target: int(order),
            value: 0,
        });
    }
    card.discarded = true;
    state.events.push(EngineEvent::Discard {
        player_index: player,
        order,
        suit_index: int(card.suit_index),
        rank: card.rank,
        failed: card.failed,
    });
    state.max_score = state.max_score.min(calculate_max_score(state));
}
fn play(state: &mut EngineState, player: usize, order: usize) {
    state.actions.push(RecordedAction {
        action_type: RecordedActionType::Play,
        target: int(order),
        value: 0,
    });
    // Stack direction/start changes precede Follower's forced failure.
    let playable = try_play(state, order);
    if !playable || follower_misplays(state, player, &state.deck[order]) {
        state.deck[order].failed = true;
        state.strikes += 1;
        state.events.push(EngineEvent::Strike {
            num: state.strikes,
            turn: state.turn,
            order,
        });
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
        suit_index: int(card.suit_index),
        rank: card.rank,
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
fn give_clue(state: &mut EngineState, actor: usize, action: &PlayerAction, clue_type: ClueType) {
    let touched = touched_orders(state, action);
    state.actions.push(*action);
    state.clue_tokens -= clue_cost(state);
    state.last_clue_type_given = i32::from(clue_type);
    for &order in &touched {
        state.deck[order].touched = true;
    }
    state.events.push(EngineEvent::Clue {
        clue: Clue {
            clue_type: Some(clue_type),
            value: action.value,
        },
        giver: actor,
        target: index(action.target).expect("the clue target was validated"),
        list: touched.clone(),
        turn: state.turn,
    });
    character_post_clue(state, actor, action, &touched);
}

fn check_end(state: &mut EngineState) -> bool {
    use EndCondition::{
        AllOrNothingFail, AllOrNothingSoftlock, CharacterSoftlock, IdleTimeout, Normal,
        SpeedrunFail, Strikeout, TerminatedByPlayer, TerminatedByVote, Timeout,
    };
    if matches!(
        state.end_condition,
        Timeout | TerminatedByPlayer | TerminatedByVote | IdleTimeout | CharacterSoftlock
    ) {
        return true;
    }
    let v = variant_for(state);
    if state.strikes == MAX_STRIKES {
        state.end_condition = Strikeout;
    } else if state.options.speedrun && state.max_score < v.max_score {
        state.end_condition = SpeedrunFail;
    } else if state.options.all_or_nothing && state.max_score < v.max_score {
        state.end_condition = AllOrNothingFail;
    } else if state.options.all_or_nothing
        && state.players[state.active_player_index].hand.is_empty()
        && state.clue_tokens < clue_cost(state)
    {
        state.end_condition = AllOrNothingSoftlock;
        state.end_player = int(state.active_player_index);
    } else if state.turn == state.end_turn
        || state.score == state.max_score
        || !has_remaining_play(state)
    {
        state.end_condition = Normal;
    } else {
        return false;
    }
    true
}
fn finish_action(
    state: &mut EngineState,
    actor: usize,
    action: &RecordedAction,
    timing: Option<CompletionTiming>,
    votes: Option<Vec<usize>>,
) {
    character_post_action(state, actor, action);
    state.events.push(EngineEvent::Status {
        clues: state.clue_tokens,
        score: state.score,
        max_score: state.max_score,
    });
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
    let ended = state.end_condition != EndCondition::InProgress;
    if game_over {
        state.events.push(EngineEvent::GameOver {
            end_condition: state.end_condition,
            player_index: state.end_player,
            votes,
        });
    }
    state.events.push(EngineEvent::Turn {
        num: state.turn,
        current_player_index: if ended {
            NO_VALUE
        } else {
            int(state.active_player_index)
        },
    });
    if ended {
        if state.end_condition as i32 > EndCondition::Normal as i32 {
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

pub fn apply_action(
    previous: &EngineState,
    actor: usize,
    action: &PlayerAction,
    timing: Option<CompletionTiming>,
) -> Result<Transition> {
    validate_action(previous, actor, action)?;
    validate_timing(previous, timing.as_ref())?;
    let mut state = previous.clone();
    if let Some(clue_type) = clue_type(action.action_type) {
        give_clue(&mut state, actor, action, clue_type);
    } else {
        let order = usize::try_from(action.target)?;
        let deck_move = state.options.deck_plays
            && state.deck_index + 1 == state.deck.len()
            && order == state.deck_index;
        let inverted = state.interpretation == Interpretation::Live
            && variant_for(&state).suits[state.deck[order].suit_index].inverted;
        let is_play = action.action_type
            == if inverted {
                RecordedActionType::Discard
            } else {
                RecordedActionType::Play
            };
        ensure!(
            !(is_play
                && variant_for(&state).sudoku
                && state.deck[order].rank == START_CARD_RANK
                && state.stacks[state.deck[order].suit_index] == 0),
            "The prepared card cannot start a Sudoku stack."
        );
        if !is_play && state.clue_tokens < MAX_CLUES * clue_cost(&state) {
            state.clue_tokens += 1;
        }
        if deck_move {
            draw_card(&mut state, actor);
        }
        remove_card(&mut state, actor, order);
        if deck_move {
            state.deck[order].slot = NO_VALUE;
        }
        if is_play {
            play(&mut state, actor, order);
        } else {
            discard(&mut state, actor, order);
        }
        if !deck_move {
            draw_card(&mut state, actor);
        }
    }
    state.started_timer = true;
    finish_action(&mut state, actor, action, timing, None);
    Ok(Transition {
        events: state.events[previous.events.len()..].to_vec(),
        state,
    })
}

/// Trusted server operation, not a player action.
pub fn terminate_game(
    previous: &EngineState,
    termination: Termination,
    mut timing: Option<CompletionTiming>,
) -> Result<Transition> {
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
    if termination.player_index < NO_VALUE
        || termination.player_index >= int(previous.players.len())
        || (termination.condition == EndCondition::Timeout && termination.player_index == NO_VALUE)
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
    let mut state = previous.clone();
    state.end_condition = termination.condition;
    state.end_player = termination.player_index;
    let action = RecordedAction {
        action_type: if termination.condition == EndCondition::TerminatedByVote {
            RecordedActionType::GameOverByVote
        } else {
            RecordedActionType::GameOver
        },
        target: if matches!(
            termination.condition,
            EndCondition::TerminatedByVote | EndCondition::IdleTimeout
        ) {
            NO_VALUE
        } else {
            termination.player_index
        },
        value: termination.condition as i32,
    };
    if termination.condition != EndCondition::AllOrNothingFail {
        state.actions.push(action);
    }
    if termination.condition == EndCondition::Timeout
        && let Some(t) = &mut timing
    {
        t.player_times[usize::try_from(termination.player_index)?] = 0;
    }
    finish_action(
        &mut state,
        termination.actor_index,
        &action,
        timing,
        termination.votes,
    );
    Ok(Transition {
        events: state.events[previous.events.len()..].to_vec(),
        state,
    })
}
