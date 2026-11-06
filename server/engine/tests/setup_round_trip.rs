use hanabi_engine::*;

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
                    player_names: ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"][..count]
                        .iter()
                        .map(|name| (*name).into())
                        .collect(),
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
                let restored = parse_engine_state(serde_json::to_value(&state).unwrap()).unwrap();
                assert_eq!(restored, state);
            }
        }
    }
}
