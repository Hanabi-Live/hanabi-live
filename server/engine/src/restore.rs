use crate::{
    Character, ClueType, EndCondition, EngineEvent, EngineState, Interpretation, RecordedAction,
    RecordedActionType, clue_action_type, clue_cost_for, clue_type,
    game::{
        MAX_CLUES, MAX_EVENTS, MAX_NAME_LENGTH, MAX_SAFE_INTEGER, MAX_SEED_LENGTH, hand_size,
        validate_options,
    },
    get_variant, int,
};
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::collections::HashSet;

/// A card's state as the event history replays it.
#[derive(Clone, Default)]
struct HistoricalCard {
    touched: bool,
    played: bool,
    discarded: bool,
    failed: bool,
    slot: i32,
}

fn bounded_array<'a>(value: &'a Value, name: &str, max: usize) -> Result<&'a Vec<Value>> {
    let values = value
        .get(name)
        .and_then(Value::as_array)
        .with_context(|| format!("Missing array: {name}"))?;
    ensure!(values.len() <= max, "{name} exceeds its decoding bound.");
    Ok(values)
}

/// Decode an authoritative checkpoint, never a recipient-scrubbed history.
/// Defaults are forbidden here, including the otherwise defaultable options.
/// History is bounded before deserializing and cross-checked against every card,
/// hand, stack, strike, recorded action, and terminal/turn event.
pub fn parse_engine_state(value: Value) -> Result<EngineState> {
    bounded_array(&value, "deck", hanabi_protocol::MAX_DECK_SIZE)?;
    bounded_array(&value, "actions", hanabi_protocol::MAX_GAME_ACTIONS)?;
    for player in bounded_array(&value, "players", 6)? {
        bounded_array(player, "hand", 6)?;
    }
    for field in ["stacks", "stackStarts", "playStackDirections"] {
        bounded_array(&value, field, 6)?;
    }
    for event in bounded_array(&value, "events", MAX_EVENTS)? {
        if event.get("type").and_then(Value::as_str) == Some("gameOver") {
            ensure!(
                event.get("votes").is_some(),
                "Missing game-over votes field."
            );
        }
        for field in ["list", "votes", "playerTimes"] {
            if event.get(field).is_some_and(|v| !v.is_null()) {
                bounded_array(event, field, 6)?;
            }
        }
    }
    let options = value
        .get("options")
        .and_then(Value::as_object)
        .context("Missing options")?;
    for optional in ["variantID", "tableName", "maxPlayers"] {
        ensure!(
            options.get(optional).is_none_or(|v| !v.is_null()),
            "Null restored option: {optional}"
        );
    }
    for required in [
        "numPlayers",
        "startingPlayer",
        "variantName",
        "timed",
        "timeBase",
        "timePerTurn",
        "speedrun",
        "cardCycle",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
        "detrimentalCharacters",
    ] {
        ensure!(
            options.contains_key(required),
            "Missing restored option: {required}"
        );
    }
    let state: EngineState = serde_json::from_value(value).context("Malformed engine state")?;
    validate_engine_state(&state)?;
    Ok(state)
}

/// Validate an already typed state without serializing it. Untrusted JSON must
/// still use `parse_engine_state`, which also rejects missing and unknown fields.
pub fn validate_engine_state(s: &EngineState) -> Result<()> {
    ensure!(
        s.deck.len() <= hanabi_protocol::MAX_DECK_SIZE
            && s.actions.len() <= hanabi_protocol::MAX_GAME_ACTIONS
            && s.events.len() <= MAX_EVENTS,
        "Engine state exceeds its collection bounds."
    );
    ensure!(
        s.players.len() <= 6
            && s.players.iter().all(|p| p.hand.len() <= 6)
            && s.stacks.len() <= 6
            && s.stack_starts.len() <= 6
            && s.play_stack_directions.len() <= 6,
        "Engine state exceeds its player or stack bounds."
    );
    for event in &s.events {
        let bounded = match event {
            EngineEvent::Clue { list, .. } => list.len() <= 6,
            EngineEvent::GameOver { votes, .. } => votes.as_ref().is_none_or(|v| v.len() <= 6),
            EngineEvent::PlayerTimes { player_times, .. } => player_times.len() <= 6,
            _ => true,
        };
        ensure!(bounded, "Event exceeds its collection bounds.");
    }
    validate_options(&s.options)?;
    let v = get_variant(&s.options.variant_name)?;
    let count = s.players.len();
    let seat = |i: usize| i < count;
    let signed_seat = |i: i32| usize::try_from(i).is_ok_and(|i| i < count);
    let order = |o: usize| o < s.deck_index && o < s.deck.len();
    let valid_clue = |clue_type: ClueType, value: i32| match clue_type {
        ClueType::Color => usize::try_from(value).is_ok_and(|value| value < v.clue_colors.len()),
        ClueType::Rank => v.clue_ranks.contains(&value),
    };
    let clue_limit = MAX_CLUES * clue_cost_for(v);
    ensure!(s.seed.len() <= MAX_SEED_LENGTH, "Seed too long.");
    ensure!(
        count == s.options.num_players && seat(s.active_player_index),
        "Invalid player count or active seat."
    );
    ensure!(
        s.end_player == -1 || signed_seat(s.end_player),
        "Invalid ending seat."
    );
    ensure!(
        s.end_condition != EndCondition::InProgress || s.end_player == -1,
        "An ongoing game cannot have an ending player."
    );
    ensure!(
        s.end_condition != EndCondition::Timeout || signed_seat(s.end_player),
        "A timeout must identify a player."
    );
    ensure!(
        !s.deck.is_empty() && s.deck_index <= s.deck.len(),
        "Invalid deck cursor."
    );
    ensure!(
        usize::try_from(s.turn).is_ok_and(|turn| turn <= s.actions.len() + 1),
        "Invalid turn counter."
    );
    ensure!(
        s.end_turn == -1 || (s.end_turn >= s.turn && s.end_turn <= s.turn + int(count) + 1),
        "Invalid final turn."
    );
    ensure!(
        (0..=clue_limit).contains(&s.clue_tokens),
        "Invalid clue count."
    );
    ensure!(
        0 <= s.score && s.score <= s.max_score && s.max_score <= v.max_score,
        "Invalid score bounds."
    );
    ensure!(
        (0..=3).contains(&s.strikes) && (-1..=1).contains(&s.last_clue_type_given),
        "Invalid counters."
    );
    ensure!(
        s.stacks.len() == v.suits.len()
            && s.stack_starts.len() == v.suits.len()
            && s.play_stack_directions.len() == v.suits.len(),
        "Stack count does not match the variant."
    );
    ensure!(
        s.stacks.iter().all(|r| matches!(*r, 0..=5 | 7))
            && s.stack_starts.iter().all(|r| (0..=5).contains(r))
            && s.play_stack_directions.iter().all(|d| (0..=3).contains(d)),
        "Invalid stack values."
    );
    if v.sudoku {
        let starts: Vec<_> = s.stack_starts.iter().copied().filter(|r| *r != 0).collect();
        ensure!(
            starts.iter().collect::<HashSet<_>>().len() == starts.len()
                && s.stacks
                    .iter()
                    .enumerate()
                    .all(|(i, r)| *r == 0 || s.stack_starts[i] != 0),
            "Invalid Sudoku starting ranks."
        );
    } else {
        ensure!(
            s.stack_starts.iter().all(|r| *r == 0),
            "Only Sudoku variants have stack starts."
        );
    }
    if !v.has_reversed_suits() {
        ensure!(
            s.play_stack_directions
                .iter()
                .all(|d| *d == 0 || (v.sudoku && *d == 3)),
            "Invalid stack direction."
        );
    } else if !v.up_or_down {
        ensure!(
            s.play_stack_directions.iter().all(|d| *d != 0),
            "Reversed stacks must have a direction."
        );
    }
    ensure!(
        if s.options.all_or_nothing || s.deck_index < s.deck.len() {
            s.end_turn == -1
        } else {
            s.end_turn != -1
        },
        "Final-round state does not match the deck cursor."
    );
    let mut held = HashSet::new();
    for (index, player) in s.players.iter().enumerate() {
        ensure!(
            player.index == index
                && player.name.len() <= MAX_NAME_LENGTH
                && player.character.len() <= MAX_NAME_LENGTH
                && player.hand.len() <= hand_size(&s.options),
            "Invalid player state."
        );
        if player.character() == Some(Character::Genius) {
            ensure!(
                player.character_metadata == -1
                    || (signed_seat(player.character_metadata)
                        && player.character_metadata != int(index)),
                "Invalid second-clue target."
            );
        }
        for &o in &player.hand {
            ensure!(order(o), "Invalid hand card order.");
            ensure!(
                !s.deck[o].played && !s.deck[o].discarded && held.insert(o),
                "Duplicate or unavailable hand card."
            );
        }
    }
    for (i, c) in s.deck.iter().enumerate() {
        ensure!(
            c.order == i
                && c.suit_index < v.suits.len()
                && matches!(c.rank, 1..=5 | 7)
                && (-1..=6).contains(&c.slot),
            "Invalid card identity or slot."
        );
        ensure!(
            !(c.played && c.discarded) && (!c.failed || c.discarded),
            "Inconsistent card disposition."
        );
        if i < s.deck_index {
            ensure!(
                held.contains(&i) || c.played || c.discarded,
                "A drawn card has no location."
            );
        } else {
            ensure!(
                !c.played
                    && !c.discarded
                    && !c.touched
                    && !c.cannot_be_played
                    && !c.insistent_touched
                    && c.slot == 0,
                "Undrawn card has mutable state."
            );
        }
    }

    let mut cards = vec![HistoricalCard::default(); s.deck.len()];
    let mut hands = vec![Vec::<usize>::new(); count];
    let mut stacks = vec![0; v.suits.len()];
    let mut actions = vec![];
    let mut drawn = 0;
    let mut strikes = 0;
    let mut game_overs = 0;
    let mut last_turn: Option<(i32, i32)> = None;
    for (index, e) in s.events.iter().enumerate() {
        let identity = match e {
            EngineEvent::Draw {
                player_index,
                order,
                suit_index,
                rank,
            }
            | EngineEvent::Play {
                player_index,
                order,
                suit_index,
                rank,
            }
            | EngineEvent::CardIdentity {
                player_index,
                order,
                suit_index,
                rank,
            }
            | EngineEvent::Discard {
                player_index,
                order,
                suit_index,
                rank,
                ..
            } => Some((*player_index, *order, *suit_index, *rank)),
            _ => None,
        };
        if let Some((p, o, suit, rank)) = identity {
            ensure!(
                seat(p) && order(o),
                "Invalid event player or order at index: {index}"
            );
            ensure!(
                int(s.deck[o].suit_index) == suit && s.deck[o].rank == rank,
                "Event identity does not match the authoritative deck at index: {index}"
            );
        }
        match e {
            EngineEvent::Draw {
                player_index,
                order,
                ..
            } => {
                ensure!(*order == drawn, "Draw history is not sequential.");
                drawn += 1;
                hands[*player_index].push(*order);
            }
            EngineEvent::Play {
                player_index,
                order,
                suit_index,
                rank,
            }
            | EngineEvent::Discard {
                player_index,
                order,
                suit_index,
                rank,
                ..
            } => {
                let hand = &mut hands[*player_index];
                let position = hand
                    .iter()
                    .position(|o| o == order)
                    .context("Card removal does not match the historical hand.")?;
                let card = &mut cards[*order];
                ensure!(!card.played && !card.discarded, "Card removed twice.");
                card.slot = int(hand.len() - position);
                hand.remove(position);
                if matches!(e, EngineEvent::Play { .. }) {
                    card.played = true;
                    stacks[usize::try_from(*suit_index)?] = *rank;
                    actions.push(RecordedAction {
                        action_type: RecordedActionType::Play,
                        target: int(*order),
                        value: 0,
                    });
                } else if let EngineEvent::Discard { failed, .. } = e {
                    card.discarded = true;
                    ensure!(
                        *failed == card.failed,
                        "Failed discard does not match a strike."
                    );
                    if !failed {
                        actions.push(RecordedAction {
                            action_type: RecordedActionType::Discard,
                            target: int(*order),
                            value: 0,
                        });
                    }
                }
            }
            EngineEvent::CardIdentity {
                player_index,
                order,
                ..
            } => {
                let hand = &hands[*player_index];
                ensure!(
                    hand.len() >= 2 && hand[hand.len() - 2] == *order,
                    "Card identity does not identify the historical second slot."
                );
            }
            EngineEvent::Strike {
                num,
                turn,
                order: o,
            } => {
                strikes += 1;
                ensure!(
                    (0..=s.turn).contains(turn)
                        && *num == strikes
                        && (1..=3).contains(num)
                        && order(*o),
                    "Invalid strike history."
                );
                ensure!(
                    !cards[*o].failed && hands.iter().any(|h| h.contains(o)),
                    "Invalid strike card."
                );
                cards[*o].failed = true;
                actions.push(RecordedAction {
                    action_type: RecordedActionType::Play,
                    target: int(*o),
                    value: 0,
                });
            }
            EngineEvent::Clue {
                clue,
                giver,
                target,
                list,
                turn,
            } => {
                ensure!(
                    seat(*giver) && seat(*target) && giver != target && (0..=s.turn).contains(turn),
                    "Invalid clue participants or turn."
                );
                let Some(clue_type) = clue.clue_type.filter(|t| valid_clue(*t, clue.value)) else {
                    bail!("Invalid variant clue.");
                };
                ensure!(
                    list.iter().all(|o| order(*o) && hands[*target].contains(o))
                        && list.iter().collect::<HashSet<_>>().len() == list.len(),
                    "Invalid clue card list."
                );
                for &o in list {
                    cards[o].touched = true;
                }
                actions.push(RecordedAction {
                    action_type: clue_action_type(clue_type),
                    target: int(*target),
                    value: clue.value,
                });
                if s.options.card_cycle {
                    let hand = &mut hands[*giver];
                    if let Some(chop) = hand.iter().position(|&o| !cards[o].touched) {
                        let o = hand.remove(chop);
                        hand.push(o);
                    }
                }
            }
            EngineEvent::Turn {
                num,
                current_player_index,
            } => {
                ensure!(
                    (0..=s.turn).contains(num)
                        && (*current_player_index == -1 || signed_seat(*current_player_index)),
                    "Invalid turn event."
                );
                ensure!(
                    last_turn.is_none_or(|(n, _)| *num >= n)
                        && (*current_player_index != -1
                            || s.end_condition != EndCondition::InProgress),
                    "Inconsistent turn history."
                );
                last_turn = Some((*num, *current_player_index));
            }
            EngineEvent::Status {
                clues,
                score,
                max_score,
            } => {
                ensure!(
                    (0..=clue_limit).contains(clues)
                        && *score >= 0
                        && score <= max_score
                        && *max_score <= v.max_score,
                    "Invalid status bounds."
                );
            }
            EngineEvent::GameOver {
                end_condition,
                player_index,
                votes,
            } => {
                game_overs += 1;
                ensure!(
                    game_overs == 1
                        && *end_condition != EndCondition::InProgress
                        && *end_condition == s.end_condition
                        && *player_index == s.end_player,
                    "Game-over event does not match the ending state."
                );
                ensure!(
                    votes
                        .as_ref()
                        .is_none_or(|votes| votes.iter().all(|v| seat(*v))
                            && votes.iter().collect::<HashSet<_>>().len() == votes.len()),
                    "Invalid termination votes."
                );
            }
            EngineEvent::PlayerTimes {
                player_times,
                duration,
            } => {
                ensure!(
                    s.end_condition != EndCondition::InProgress
                        && s.interpretation == Interpretation::Live
                        && index == s.events.len() - 1,
                    "Completion timing must finish a live game's history."
                );
                ensure!(
                    player_times.len() == count
                        && (0..=MAX_SAFE_INTEGER).contains(duration)
                        && player_times
                            .iter()
                            .all(|t| (-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(t)),
                    "Invalid completion timing."
                );
            }
        }
    }
    ensure!(
        drawn == s.deck_index && strikes == s.strikes && stacks == s.stacks,
        "Deck, strikes, or stacks do not match history."
    );
    ensure!(
        match last_turn {
            None => s.turn == 0 && s.actions.is_empty(),
            Some((num, player)) =>
                num == s.turn
                    && player
                        == if s.end_condition == EndCondition::InProgress {
                            int(s.active_player_index)
                        } else {
                            -1
                        },
        },
        "Current turn does not match its event history."
    );
    for (player, hand) in s.players.iter().zip(hands) {
        ensure!(
            player.hand == hand,
            "Hand does not match its action history."
        );
    }
    for (index, (card, historical)) in s.deck.iter().zip(&cards).enumerate() {
        ensure!(
            card.touched == historical.touched
                && card.played == historical.played
                && card.discarded == historical.discarded
                && card.failed == historical.failed
                && (card.slot == historical.slot
                    || (card.slot == -1
                        && historical.slot == 1
                        && s.options.deck_plays
                        && index == s.deck.len() - 1)),
            "Card state does not match its action history at index: {index}"
        );
    }
    let played = int(cards.iter().filter(|c| c.played).count());
    ensure!(
        s.score
            == if s.end_condition as i32 > EndCondition::Normal as i32 {
                0
            } else {
                played
            },
        "Score does not match the play history."
    );
    let ordinary: Vec<_> = s
        .actions
        .iter()
        .copied()
        .filter(|a| !a.action_type.is_game_over())
        .collect();
    let terminal: Vec<_> = s
        .actions
        .iter()
        .enumerate()
        .filter(|(_, a)| a.action_type.is_game_over())
        .collect();
    ensure!(
        terminal.is_empty()
            || (terminal.len() == 1
                && s.end_condition != EndCondition::InProgress
                && terminal[0].0 == s.actions.len() - 1),
        "A server termination must be the final recorded action."
    );
    ensure!(
        ordinary == actions,
        "Recorded actions do not match event history."
    );
    for a in &s.actions {
        let valid = match a.action_type {
            RecordedActionType::Play | RecordedActionType::Discard => {
                usize::try_from(a.target).is_ok_and(order) && a.value == 0
            }
            RecordedActionType::ColorClue | RecordedActionType::RankClue => {
                signed_seat(a.target)
                    && clue_type(a.action_type).is_some_and(|t| valid_clue(t, a.value))
            }
            RecordedActionType::GameOverByVote => {
                a.target == -1 && a.value == i32::from(EndCondition::TerminatedByVote)
            }
            RecordedActionType::GameOver => match EndCondition::try_from(a.value) {
                Ok(EndCondition::Timeout) => signed_seat(a.target),
                Ok(EndCondition::TerminatedByPlayer) => a.target == -1 || signed_seat(a.target),
                Ok(EndCondition::IdleTimeout) => a.target == -1,
                _ => false,
            },
        };
        ensure!(valid, "Invalid recorded action.");
    }
    Ok(())
}
