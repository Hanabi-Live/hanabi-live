use hanabi_engine::*;
use serde_json::json;

fn setup(options: Options, characters: Option<Vec<AssignedCharacter>>) -> GameSetup {
    GameSetup {
        player_names: (0..options.num_players)
            .map(|i| format!("Player{i}"))
            .collect(),
        options,
        seed: Some("p2v0s1".into()),
        deck: None,
        characters,
        interpretation: Interpretation::Live,
    }
}
fn standard() -> EngineState {
    create_game(setup(Options::default(), None)).expect("the default options are valid")
}
/// A game after an action or termination applied to a copy of it, and the events that it added.
#[derive(Debug)]
struct Applied {
    state: EngineState,
    events: Vec<EngineEvent>,
}
fn applied(
    state: &EngineState,
    actor: usize,
    action: PlayerAction,
    timing: Option<CompletionTiming>,
) -> Result<Applied> {
    let mut next = state.clone();
    apply_action(&mut next, actor, &action, timing)?;
    Ok(Applied {
        events: next.events[state.events.len()..].to_vec(),
        state: next,
    })
}
fn terminated(
    state: &EngineState,
    termination: Termination,
    timing: Option<CompletionTiming>,
) -> Result<Applied> {
    let mut next = state.clone();
    terminate_game(&mut next, termination, timing)?;
    Ok(Applied {
        events: next.events[state.events.len()..].to_vec(),
        state: next,
    })
}

/// The action that a client sends, or `None` if the protocol does not allow its numbers.
fn parsed(action_type: RecordedActionType, target: i32, value: i32) -> Option<PlayerAction> {
    let body = match action_type {
        RecordedActionType::Play => json!({"type": "play", "order": target}),
        RecordedActionType::Discard => json!({"type": "discard", "order": target}),
        RecordedActionType::ColorClue => {
            json!({"type": "clue", "target": target, "clue": {"type": "color", "value": value}})
        }
        RecordedActionType::RankClue => {
            json!({"type": "clue", "target": target, "clue": {"type": "rank", "value": value}})
        }
        RecordedActionType::GameOver | RecordedActionType::GameOverByVote => return None,
    };
    serde_json::from_value(body).ok()
}
fn action(action_type: RecordedActionType, target: i32, value: i32) -> PlayerAction {
    parsed(action_type, target, value).expect("a valid action")
}
fn assignments(first: &str, second: &str) -> Vec<AssignedCharacter> {
    [first, second]
        .iter()
        .map(|name| AssignedCharacter {
            name: (!name.is_empty()).then(|| (*name).into()),
            metadata: None,
        })
        .collect()
}
#[test]
fn rejected_actions_are_atomic_and_client_terminations_are_not_actions() {
    // Rejections are checked against one state in place, which they must leave as it was.
    let mut state = standard();
    let before = state.clone();
    // Numbered action types and the end of the game cannot come from a client.
    for kind in [json!(-1), json!(i32::MAX), json!(4), json!("gameOver")] {
        assert!(
            serde_json::from_value::<PlayerAction>(
                json!({"type": kind, "endCondition": 4, "order": 0})
            )
            .is_err()
        );
    }
    // The protocol rejects some numbers, and the rules reject the rest.
    for target in [-1, 5, 50, i32::MAX] {
        assert!(
            parsed(RecordedActionType::Play, target, 0)
                .is_none_or(|a| applied(&state, 0, a, None).is_err())
        );
    }
    for (kind, target, value) in [
        (RecordedActionType::ColorClue, -1, 0),
        (RecordedActionType::RankClue, 0, 1),
        (RecordedActionType::ColorClue, 1, -1),
        (RecordedActionType::ColorClue, 1, 5),
        (RecordedActionType::RankClue, 1, 0),
        (RecordedActionType::RankClue, 1, 7),
    ] {
        assert!(
            parsed(kind, target, value).is_none_or(|a| validate_action(&state, 0, &a).is_err())
        );
    }
    assert!(apply_action(&mut state, 1, &action(RecordedActionType::Play, 5, 0), None).is_err());
    assert!(
        apply_action(
            &mut state,
            usize::MAX,
            &action(RecordedActionType::Play, 0, 0),
            None
        )
        .is_err()
    );
    assert!(
        terminate_game(
            &mut state,
            Termination {
                actor_index: 0,
                condition: EndCondition::Normal,
                player_index: None,
                votes: None,
            },
            None,
        )
        .is_err()
    );
    let result = applied(&state, 0, action(RecordedActionType::RankClue, 1, 1), None).unwrap();
    assert_eq!(state, before);
    assert_eq!(
        result.state.actions,
        vec![RecordedAction::from(action(
            RecordedActionType::RankClue,
            1,
            1
        ))]
    );
    for malformed in [
        json!({"type":0.5,"target":0,"value":0}),
        json!({"type":0,"target":1.5,"value":0}),
        json!({"type":0,"target":0,"value":1e30}),
    ] {
        assert!(serde_json::from_value::<PlayerAction>(malformed).is_err());
    }
}

#[test]
fn termination_uses_requesting_character_and_explicit_timing() {
    let state = create_game(setup(
        Options {
            num_players: 3,
            detrimental_characters: true,
            ..Options::default()
        },
        Some(
            [None, Some("Contrarian"), Some("Stubborn")]
                .iter()
                .map(|s| AssignedCharacter {
                    name: s.map(Into::into),
                    metadata: None,
                })
                .collect(),
        ),
    ))
    .unwrap();
    let ended = terminated(
        &state,
        Termination {
            actor_index: 1,
            condition: EndCondition::TerminatedByPlayer,
            player_index: Some(1),
            votes: None,
        },
        None,
    )
    .unwrap();
    assert!(ended.state.turns_inverted);
    assert_eq!(ended.state.active_player_index, 2);
    assert_eq!(
        ended.state.players[2].character_state,
        Some(CharacterState::Stubborn {
            previous_action: Some(RecordedActionType::GameOver)
        })
    );
    assert!(
        applied(
            &ended.state,
            0,
            action(RecordedActionType::Play, 0, 0),
            None
        )
        .is_err()
    );
    let state = standard();
    let timing = Some(CompletionTiming {
        player_times: vec![1234, -1234],
        duration: 5678,
    });
    let timeout = terminated(
        &state,
        Termination {
            actor_index: 1,
            condition: EndCondition::Timeout,
            player_index: Some(0),
            votes: None,
        },
        timing.clone(),
    )
    .unwrap();
    assert_eq!(
        timeout.events.last(),
        Some(&EngineEvent::PlayerTimes {
            player_times: vec![0, -1234],
            duration: 5678
        })
    );
    terminated(
        &state,
        Termination {
            actor_index: 1,
            condition: EndCondition::TerminatedByVote,
            player_index: None,
            votes: Some(vec![0, 1]),
        },
        timing,
    )
    .unwrap();
    assert!(
        terminated(
            &state,
            Termination {
                actor_index: 0,
                condition: EndCondition::Timeout,
                player_index: None,
                votes: None
            },
            None
        )
        .is_err()
    );
    assert!(
        terminated(
            &state,
            Termination {
                actor_index: 0,
                condition: EndCondition::Normal,
                player_index: None,
                votes: None
            },
            None
        )
        .is_err()
    );
    assert!(
        applied(
            &state,
            0,
            action(RecordedActionType::RankClue, 1, 1),
            Some(CompletionTiming {
                player_times: vec![0],
                duration: 0
            })
        )
        .is_err()
    );
}

#[test]
fn privacy_is_historical_and_invalid_shadow_seats_are_omniscient() {
    let state = create_game(setup(
        Options {
            detrimental_characters: true,
            ..Options::default()
        },
        Some(assignments("Slow-Witted", "")),
    ))
    .unwrap();
    let visible =
        events_for_recipient(&state, Recipient::Player { player_index: 0 }, None).unwrap();
    let mut draws = 0;
    let mut revealed = vec![];
    for e in &visible {
        match e {
            EngineEvent::Draw {
                rank, suit_index, ..
            } => {
                draws += 1;
                assert_eq!((*rank, *suit_index), (None, None));
            }
            EngineEvent::CardIdentity {
                player_index: 1,
                order,
                rank,
                ..
            } => {
                assert!(rank.is_some());
                revealed.push(*order);
            }
            EngineEvent::CardIdentity {
                player_index: 0,
                rank,
                suit_index,
                ..
            } => assert_eq!((*rank, *suit_index), (None, None)),
            _ => {}
        }
    }
    assert_eq!(draws, 10);
    assert_eq!(revealed, vec![5, 6, 7, 8]);
    assert!(
        applied(&state, 0, action(RecordedActionType::RankClue, 1, 4), None)
            .unwrap_err()
            .to_string()
            .contains("touches 0 cards")
    );
    assert_eq!(
        visible,
        events_for_recipient(
            &state,
            Recipient::Spectator {
                shadowing_player_index: Some(0)
            },
            None
        )
        .unwrap()
    );
    for shadow in [-1, 2, i32::MAX] {
        assert_eq!(
            state.events,
            events_for_recipient(
                &state,
                Recipient::Spectator {
                    shadowing_player_index: Some(shadow)
                },
                None
            )
            .unwrap()
        );
        assert!(
            events_for_recipient(
                &state,
                Recipient::Player {
                    player_index: shadow
                },
                None
            )
            .is_err()
        );
    }
}

#[test]
fn custom_shortened_decks_are_preserved_without_reshuffling() {
    let deck = vec![
        DeckCard {
            suit_index: 0,
            rank: 7,
        },
        DeckCard {
            suit_index: 1,
            rank: 1,
        },
    ];
    let mut input = setup(Options::default(), None);
    input.seed = None;
    input.deck = Some(deck.clone());
    input.interpretation = Interpretation::Recorded;
    let state = create_game(input).unwrap();
    assert_eq!(
        state
            .deck
            .iter()
            .map(|c| DeckCard {
                suit_index: c.suit_index,
                rank: c.rank
            })
            .collect::<Vec<_>>(),
        deck
    );
    let next = applied(
        &state,
        0,
        action(RecordedActionType::Play, 0, 0),
        Some(CompletionTiming {
            player_times: vec![0, 0],
            duration: 123,
        }),
    )
    .unwrap();
    assert_eq!(next.state.strikes, 1);
    assert!(
        !next
            .events
            .iter()
            .any(|e| matches!(e, EngineEvent::PlayerTimes { .. }))
    );
    for deck in [
        vec![],
        vec![DeckCard {
            suit_index: 5,
            rank: 1,
        }],
        vec![DeckCard {
            suit_index: 0,
            rank: 6,
        }],
    ] {
        let mut input = setup(Options::default(), None);
        input.deck = Some(deck);
        assert!(create_game(input).is_err());
    }
    let mut input = setup(
        Options {
            variant_name: "Sudoku (5 Suits)".into(),
            ..Options::default()
        },
        None,
    );
    input.deck = Some(vec![DeckCard {
        suit_index: 0,
        rank: 7,
    }]);
    let state = create_game(input).unwrap();
    let before = state.clone();
    assert!(applied(&state, 0, action(RecordedActionType::Play, 0, 0), None).is_err());
    assert_eq!(state, before);
}

fn potential(state: &EngineState) -> f64 {
    2.0 * f64::from(int(state
        .deck
        .iter()
        .filter(|c| !c.played && !c.discarded)
        .count()))
        + f64::from(state.clue_tokens) / f64::from(clue_cost(state))
}
fn first_accepted(
    state: &EngineState,
    candidates: Vec<PlayerAction>,
    perfect: bool,
) -> EngineState {
    let mut losing = None;
    for a in candidates {
        if let Ok(next) = applied(
            state,
            state.active_player_index,
            a,
            Some(CompletionTiming {
                player_times: vec![0; state.players.len()],
                duration: 0,
            }),
        ) {
            if perfect
                && (next.state.strikes != state.strikes
                    || next.state.max_score
                        != get_variant(&state.options.variant_name)
                            .expect("the game's variant exists")
                            .max_score)
            {
                losing.get_or_insert(next.state);
            } else {
                return next.state;
            }
        }
    }
    losing.expect("finite-resource legal action")
}

#[test]
fn long_character_histories_are_bounded() {
    for (variant_name, partner) in [
        ("6 Suits", "Panicky"),
        ("Up or Down (6 Suits)", "Slow-Witted"),
        ("Reversed (6 Suits)", "Panicky"),
        ("Throw It in a Hole (6 Suits)", "Panicky"),
        ("Clue Starved (6 Suits)", "Slow-Witted"),
    ] {
        let v = get_variant(variant_name).unwrap();
        let mut deck = create_shuffled_deck(v, "p2v0s1");
        let first = deck
            .iter()
            .position(|c| c.rank == if v.suits[c.suit_index].reversed { 5 } else { 1 })
            .unwrap();
        deck.swap(0, first);
        let mut input = setup(
            Options {
                variant_name: variant_name.into(),
                empty_clues: true,
                detrimental_characters: true,
                ..Options::default()
            },
            Some(assignments("Genius", partner)),
        );
        input.deck = Some(deck);
        let mut state = create_game(input).unwrap();
        for _ in 0..129 {
            if state.end.is_some() {
                break;
            }
            let p = &state.players[state.active_player_index];
            let clues = vec![
                action(RecordedActionType::ColorClue, 1 - int(p.index), 0),
                action(RecordedActionType::RankClue, 1 - int(p.index), 1),
            ];
            let discards: Vec<_> = p
                .hand
                .iter()
                .filter(|o| **o != 0)
                .map(|o| action(RecordedActionType::Discard, int(*o), 0))
                .collect();
            let candidates = if p.is(Character::Panicky) {
                [discards, clues].concat()
            } else {
                [clues, discards].concat()
            };
            let before = potential(&state);
            state = first_accepted(&state, candidates, false);
            assert!(potential(&state) <= before - 1.0, "{variant_name}");
            assert_eq!(state.score, 0);
        }
        assert_eq!(
            state.end.map(|end| end.condition),
            Some(EndCondition::Normal),
            "{variant_name}"
        );
        assert_eq!(state.deck_index, state.deck.len());
        assert!(state.actions.len() > 60 && state.turn < int(state.actions.len()));
        assert!(
            state.actions.len() <= 2 * state.deck.len() + 9
                && state.events.len() <= 8 * state.deck.len() + 31
        );
    }
}

#[test]
fn all_or_nothing_eventually_exhausts_resources_without_final_round() {
    let mut input = setup(
        Options {
            variant_name: "6 Suits".into(),
            all_or_nothing: true,
            empty_clues: true,
            one_extra_card: true,
            detrimental_characters: true,
            ..Options::default()
        },
        Some(assignments("Slow-Witted", "")),
    );
    let mut deck = create_shuffled_deck(get_variant("6 Suits").unwrap(), "p2v0s1");
    deck.sort_by_key(|c| (c.rank, c.suit_index));
    input.deck = Some(deck);
    let mut state = create_game(input).unwrap();
    for _ in 0..129 {
        if state.end.is_some() {
            break;
        }
        let p = &state.players[state.active_player_index];
        let mut candidates = vec![action(RecordedActionType::ColorClue, 1 - int(p.index), 0)];
        for t in [RecordedActionType::Discard, RecordedActionType::Play] {
            candidates.extend(p.hand.iter().map(|o| action(t, int(*o), 0)));
        }
        let before = potential(&state);
        state = first_accepted(&state, candidates, true);
        assert!(potential(&state) <= before - 1.0);
    }
    assert_eq!(
        state.end.map(|end| end.condition),
        Some(EndCondition::AllOrNothingFail)
    );
    assert_eq!(state.deck_index, state.deck.len());
    assert_eq!(state.end_turn, None);
    assert_eq!(state.score, 0);
    assert!(state.actions.len() > 60 && state.actions.len() <= 2 * state.deck.len() + 9);
}

#[test]
fn sudoku_max_score_counts_only_cards_reachable_from_distinct_starts() {
    for (name, discarded, expected) in [
        ("Sudoku (5 Suits)", vec![5], 10),
        ("Sudoku (5 Suits)", vec![3], 10),
        ("Sudoku (5 Suits)", vec![2, 5], 4),
        ("Sudoku (4 Suits)", vec![4], 6),
        ("Sudoku (4 Suits)", vec![3], 6),
        ("Sudoku (4 Suits)", vec![1, 4], 3),
    ] {
        let mut state = create_game(setup(
            Options {
                variant_name: name.into(),
                ..Options::default()
            },
            None,
        ))
        .unwrap();
        for card in &mut state.deck {
            card.discarded = discarded.contains(&card.rank);
        }
        assert_eq!(
            calculate_max_score(&state),
            expected,
            "{name}, discarded ranks {discarded:?}"
        );
    }
}

#[test]
fn sudoku_started_stack_cannot_count_available_ranks_before_its_start() {
    let mut state = create_game(setup(
        Options {
            variant_name: "Sudoku (5 Suits)".into(),
            ..Options::default()
        },
        None,
    ))
    .unwrap();
    state.stack_starts[0] = Some(3);
    for card in &mut state.deck {
        if card.suit_index == 0 && card.rank == 5 {
            card.discarded = true;
        }
    }
    assert_eq!(calculate_max_score(&state), 22);
}

#[test]
fn synesthesia_touches_white_but_not_null_by_rank() {
    for (suit, touched) in [("White", true), ("Null", false)] {
        let variant = get_variant(&format!("Synesthesia & {suit} (5 Suits)")).unwrap();
        let green = variant
            .clue_colors
            .iter()
            .position(|c| c == "Green")
            .map(int)
            .unwrap();
        assert_eq!(
            is_card_touched(variant, ClueType::Color, green, 4, 3),
            touched
        );
        assert!(!is_card_touched(variant, ClueType::Color, green, 4, 2));
    }
}
