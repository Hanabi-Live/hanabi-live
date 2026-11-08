use hanabi_engine::*;
use serde_json::json;

fn clues(events: &[EngineEvent]) -> Vec<EngineEvent> {
    events
        .iter()
        .filter(|event| matches!(event, EngineEvent::Clue { .. }))
        .cloned()
        .collect()
}

#[test]
fn duck_projection_hides_both_clue_fields_from_every_player_and_shadow() -> Result<()> {
    for variant_name in ["Duck (5 Suits)", "No Variant"] {
        let mut state = create_game(GameSetup {
            player_names: vec!["Alice".into(), "Bob".into(), "Carol".into()],
            options: Options {
                num_players: 3,
                variant_name: variant_name.into(),
                ..Options::default()
            },
            seed: "p3v0s17".into(),
            deck: None,
            characters: None,
            interpretation: Interpretation::Live,
        })?
        .state;
        for kind in [RecordedActionType::ColorClue, RecordedActionType::RankClue] {
            let actor = state.active_player_index;
            let target = (actor + 1) % state.players.len();
            let values = if kind == RecordedActionType::ColorClue {
                0..5
            } else {
                1..6
            };
            let action = values
                .map(|value| PlayerAction {
                    action_type: kind,
                    target: int(target),
                    value,
                })
                .find(|action| !touched_orders(&state, action).is_empty())
                .unwrap();
            let transition = apply_action(&state, actor, &action, None)?;
            state = transition.state;
            let authoritative = state.clone();
            for events in [None, Some(transition.events.as_slice())] {
                let original = clues(events.unwrap_or(&state.events));
                assert_ne!(original, [] as [hanabi_engine::EngineEvent; 0]);
                for index in 0..3 {
                    for recipient in [
                        Recipient::Player {
                            player_index: index,
                        },
                        Recipient::Spectator {
                            shadowing_player_index: Some(index),
                        },
                    ] {
                        let projected = clues(&events_for_recipient(&state, recipient, events)?);
                        let expected = original
                            .iter()
                            .cloned()
                            .map(|mut event| {
                                if variant_name == "Duck (5 Suits)"
                                    && let EngineEvent::Clue { clue, .. } = &mut event
                                {
                                    *clue = Clue {
                                        clue_type: None,
                                        value: -1,
                                    };
                                }
                                event
                            })
                            .collect::<Vec<_>>();
                        assert_eq!(
                            serde_json::to_value(projected)?,
                            serde_json::to_value(expected)?
                        );
                    }
                }
                let spectator = events_for_recipient(
                    &state,
                    Recipient::Spectator {
                        shadowing_player_index: None,
                    },
                    events,
                )?;
                assert_eq!(clues(&spectator), original);
                assert!(original.iter().all(|event| {
                    let value = serde_json::to_value(event).unwrap();
                    value["clue"] != json!({"type":-1,"value":-1})
                }));
            }
            assert_eq!(
                state, authoritative,
                "Projection modified authoritative history"
            );
        }
    }
    Ok(())
}
