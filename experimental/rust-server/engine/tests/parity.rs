use hanabi_engine::*;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn digest(value: Value) -> String {
    hex::encode(Sha256::digest(serde_json::to_vec(&value).unwrap()))
}
fn names(count: usize) -> Vec<String> {
    ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"][..count]
        .iter()
        .map(|n| (*n).into())
        .collect()
}
fn snapshot(s: &EngineState) -> Value {
    json!({
        "Players": s.players.iter().map(|p| json!({"Name":p.name,"Index":p.index,"Hand":p.hand,"Character":p.character,"CharacterMetadata":p.character_metadata})).collect::<Vec<_>>(),
        "Cards": s.deck.iter().filter(|c| c.slot != 0 || c.touched || c.discarded || c.played || c.failed || c.cannot_be_played || c.insistent_touched).map(|c| json!({
            "Order":c.order,"Slot":c.slot,"Touched":c.touched,"Discarded":c.discarded,"Played":c.played,"Failed":c.failed,"CannotBePlayed":c.cannot_be_played,"InsistentTouched":c.insistent_touched
        })).collect::<Vec<_>>(),
        "Actions2":s.actions,"Seed":s.seed,"DeckIndex":s.deck_index,"Stacks":s.stacks,
        "StackStarts":s.stack_starts,"PlayStackDirections":s.play_stack_directions,
        "Turn":s.turn,"TurnsInverted":s.turns_inverted,"ActivePlayerIndex":s.active_player_index,
        "ClueTokens":s.clue_tokens,"Score":s.score,"MaxScore":s.max_score,"Strikes":s.strikes,
        "LastClueTypeGiven":s.last_clue_type_given,"EndCondition":s.end_condition,
        "EndPlayer":s.end_player,"EndTurn":s.end_turn,"StartedTimer":s.started_timer,"Paused":s.paused,
    })
}
fn recipients() -> [Recipient; 4] {
    [
        Recipient::Player { player_index: 0 },
        Recipient::Player { player_index: 1 },
        Recipient::Spectator {
            shadowing_player_index: None,
        },
        Recipient::Spectator {
            shadowing_player_index: Some(0),
        },
    ]
}
fn check_point(transition: &Transition, expected: &Value, label: &str) {
    assert_eq!(
        digest(snapshot(&transition.state)),
        expected["state"],
        "{label}: state"
    );
    assert_eq!(
        digest(serde_json::to_value(&transition.events).unwrap()),
        expected["events"],
        "{label}: events"
    );
    for (i, recipient) in recipients().into_iter().enumerate() {
        let visible =
            events_for_recipient(&transition.state, recipient, Some(&transition.events)).unwrap();
        assert_eq!(
            digest(serde_json::to_value(visible).unwrap()),
            expected["visibility"][i],
            "{label}: recipient {i}"
        );
    }
}
fn round_trip(state: &EngineState) {
    let restored = parse_engine_state(serde_json::to_value(state).unwrap()).unwrap();
    assert_eq!(&restored, state);
}

#[test]
fn all_catalog_decks_match_go_hashes() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../server/src/testdata/deck_setup.json"
    ))
    .unwrap();
    assert_eq!(cases.len(), variants().len());
    for case in cases {
        let v = get_variant(case["variant"].as_str().unwrap()).unwrap();
        assert_eq!(get_variant_by_id(v.id).unwrap().name, v.name);
        let deck = create_shuffled_deck(v, case["seed"].as_str().unwrap()).unwrap();
        assert_eq!(
            deck.len(),
            case["size"].as_u64().unwrap() as usize,
            "{}",
            v.name
        );
        let hash = hex::encode(Sha256::digest(serde_json::to_vec(&deck).unwrap()));
        assert_eq!(hash, case["digest"], "{}", v.name);
    }
}

#[test]
fn all_character_assignments_match_go() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../server/src/testdata/character_setup.json"
    ))
    .unwrap();
    for case in cases {
        let variant = get_variant(case["variant"].as_str().unwrap()).unwrap();
        let players: Vec<String> = serde_json::from_value(case["players"].clone()).unwrap();
        let assigned =
            assign_characters(variant, case["seed"].as_str().unwrap(), &players).unwrap();
        assert_eq!(
            serde_json::to_value(&assigned).unwrap(),
            case["assignments"],
            "{case}"
        );
        let seed = case["seed"].as_str().unwrap();
        if !seed.starts_with("legacy-") {
            assert_eq!(
                assigned,
                assign_characters(variant, &format!("legacy-1-{seed}"), &players).unwrap()
            );
        }
    }
}

#[test]
fn every_go_action_state_and_privacy_trace() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../server/src/testdata/engine_authority.json"
    ))
    .unwrap();
    for case in cases {
        let label = case["name"].as_str().unwrap();
        let options: Options = serde_json::from_value(case["options"].clone()).unwrap();
        let mut transition = create_game(GameSetup {
            player_names: names(options.num_players),
            options,
            seed: case["seed"].as_str().unwrap().into(),
            characters: serde_json::from_value(case["characters"].clone()).unwrap(),
            deck: case
                .get("deck")
                .map(|v| serde_json::from_value(v.clone()).unwrap()),
            interpretation: if case["live"] == true {
                Interpretation::Live
            } else {
                Interpretation::LegacyReplay
            },
        })
        .unwrap();
        check_point(&transition, &case["initial"], &format!("{label}/initial"));
        round_trip(&transition.state);
        for (index, step) in case["steps"].as_array().unwrap().iter().enumerate() {
            let action: PlayerAction = serde_json::from_value(step["action"].clone()).unwrap();
            let before = serde_json::to_value(&transition.state).unwrap();
            let result = apply_action(
                &transition.state,
                transition.state.active_player_index,
                &action,
                None,
            );
            assert_eq!(serde_json::to_value(&transition.state).unwrap(), before);
            if step["accepted"] == true {
                transition = result.unwrap_or_else(|e| panic!("{label}/{index}: {e}"));
            } else {
                assert!(result.is_err(), "{label}/{index}: unexpected acceptance");
                transition.events.clear();
            }
            check_point(&transition, &step["result"], &format!("{label}/{index}"));
            round_trip(&transition.state);
        }
    }
}

fn trim_authority(expected: &Value, actual: &Value) -> Value {
    let mut expected = expected.clone();
    expected
        .as_object_mut()
        .unwrap()
        .retain(|k, _| actual.get(k).is_some());
    for (index, player) in expected["Players"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .enumerate()
    {
        player
            .as_object_mut()
            .unwrap()
            .retain(|k, _| actual["Players"][index].get(k).is_some());
    }
    // The Go JSON omits zero-valued mutable card fields.
    for c in expected["Cards"].as_array_mut().unwrap() {
        let fields = [
            ("Slot", json!(0)),
            ("Touched", json!(false)),
            ("Discarded", json!(false)),
            ("Played", json!(false)),
            ("Failed", json!(false)),
            ("CannotBePlayed", json!(false)),
            ("InsistentTouched", json!(false)),
        ];
        for (name, value) in fields {
            c.as_object_mut().unwrap().entry(name).or_insert(value);
        }
    }
    expected
}
fn check_compatibility(transition: &Transition, expected: &Value, label: &str) {
    let actual = snapshot(&transition.state);
    assert_eq!(
        actual,
        trim_authority(&expected["state"], &actual),
        "{label}: state"
    );
    assert_eq!(
        serde_json::to_value(&transition.events).unwrap(),
        expected["events"],
        "{label}: events"
    );
    for (index, recipient) in recipients().into_iter().enumerate() {
        let frames = expected["recipients"][index].as_array().unwrap();
        let individual: Vec<_> = frames
            .iter()
            .filter(|f| f["command"] == "gameAction")
            .map(|f| f["data"]["action"].clone())
            .collect();
        if !individual.is_empty() {
            assert_eq!(
                serde_json::to_value(
                    events_for_recipient(&transition.state, recipient, Some(&transition.events))
                        .unwrap()
                )
                .unwrap(),
                json!(individual),
                "{label}: visibility"
            );
        }
        for frame in frames.iter().filter(|f| f["command"] == "gameActionList") {
            let view = if transition.state.end_condition == EndCondition::InProgress {
                recipient
            } else {
                Recipient::Spectator {
                    shadowing_player_index: None,
                }
            };
            assert_eq!(
                serde_json::to_value(events_for_recipient(&transition.state, view, None).unwrap())
                    .unwrap(),
                frame["data"]["list"],
                "{label}: reconnect history"
            );
        }
    }
}

#[test]
fn all_go_compatibility_scenarios() {
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../server/src/testdata/compatibility");
    for entry in std::fs::read_dir(directory).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let fixture: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        let input = &fixture["input"];
        let name = input["name"].as_str().unwrap();
        let mut raw_options = input["options"].clone();
        let allowed = serde_json::to_value(Options::default()).unwrap();
        raw_options.as_object_mut().unwrap().retain(|k, _| {
            allowed.get(k).is_some()
                || ["variantID", "tableName", "maxPlayers"].contains(&k.as_str())
        });
        let options: Options = serde_json::from_value(raw_options).unwrap();
        let mut deck = if input["deck"].is_null() {
            create_shuffled_deck(
                get_variant(&options.variant_name).unwrap(),
                input["seed"].as_str().unwrap(),
            )
            .unwrap()
        } else {
            serde_json::from_value(input["deck"].clone()).unwrap()
        };
        if let Some(swaps) = input["swaps"].as_array() {
            for swap in swaps {
                let order = swap["order"].as_u64().unwrap() as usize;
                let other = deck
                    .iter()
                    .enumerate()
                    .position(|(i, c)| {
                        i >= order
                            && c.suit_index == swap["suit"].as_u64().unwrap() as usize
                            && c.rank == swap["rank"].as_i64().unwrap() as i32
                    })
                    .unwrap();
                deck.swap(order, other);
            }
        }
        assert_eq!(serde_json::to_value(&deck).unwrap(), fixture["deck"]);
        let player_names = fixture["initial"]["state"]["Players"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["Name"].as_str().unwrap().into())
            .collect();
        let mut transition = create_game(GameSetup {
            options,
            player_names,
            seed: input["seed"].as_str().unwrap().into(),
            deck: Some(deck),
            characters: serde_json::from_value(input["characters"].clone()).unwrap(),
            interpretation: Interpretation::Live,
        })
        .unwrap();
        check_compatibility(&transition, &fixture["initial"], name);
        for (i, command) in input["commands"].as_array().unwrap().iter().enumerate() {
            let action = PlayerAction {
                action_type: command["type"].as_i64().unwrap() as i32,
                target: command["target"].as_i64().unwrap() as i32,
                value: command["value"].as_i64().unwrap() as i32,
            };
            let actor = command["player"].as_u64().unwrap() as usize;
            let before = serde_json::to_value(&transition.state).unwrap();
            if command["want"] == "rejected" {
                let error = apply_action(&transition.state, actor, &action, None).unwrap_err();
                for message in fixture["steps"][i]["recipients"][actor].as_array().unwrap() {
                    if message["command"] == "warning" {
                        assert_eq!(
                            error.to_string(),
                            message["data"]["warning"].as_str().unwrap(),
                            "{name}/{i}"
                        );
                    }
                }
                assert_eq!(serde_json::to_value(&transition.state).unwrap(), before);
                transition.events.clear();
            } else if command["want"] == "accepted" {
                let timing = Some(CompletionTiming {
                    player_times: vec![0; transition.state.players.len()],
                    duration: 0,
                });
                transition = if action.action_type == 4 {
                    terminate_game(
                        &transition.state,
                        Termination {
                            actor_index: actor,
                            condition: EndCondition::Timeout,
                            player_index: action.target,
                            votes: None,
                        },
                        timing,
                    )
                } else {
                    apply_action(&transition.state, actor, &action, timing)
                }
                .unwrap_or_else(|e| panic!("{name}/{i}: {e}"));
            } else {
                transition.events.clear();
            }
            check_compatibility(&transition, &fixture["steps"][i], &format!("{name}/{i}"));
            round_trip(&transition.state);
        }
    }
}

#[test]
fn all_catalog_deals_restore_for_all_seat_and_hand_sizes() {
    for variant in variants() {
        for count in 2..=6 {
            for modifier in 0..3 {
                let options = Options {
                    variant_name: variant.name.clone(),
                    num_players: count,
                    starting_player: count - 1,
                    detrimental_characters: true,
                    one_extra_card: modifier == 1,
                    one_less_card: modifier == 2,
                    ..Options::default()
                };
                let state = create_game(GameSetup {
                    options,
                    seed: format!("p{count}v{}s1", variant.id),
                    player_names: names(count),
                    deck: None,
                    characters: Some(
                        (0..count)
                            .map(|i| AssignedCharacter {
                                name: if i == 0 { "Slow-Witted" } else { "n/a" }.into(),
                                metadata: -1,
                            })
                            .collect(),
                    ),
                    interpretation: Interpretation::Live,
                })
                .unwrap()
                .state;
                round_trip(&state);
            }
        }
    }
}
