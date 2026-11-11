//! The rules of the detrimental characters that remember a value: the one they are assigned, or one
//! from an earlier turn.

use hanabi_engine::*;
use hanabi_protocol::PANICKY_MAX_CLUES;
use serde_json::json;

/// A game of a variant with these characters and the values that they are assigned.
fn game(variant: &str, characters: &[(Option<&str>, Option<i32>)]) -> EngineState {
    game_with_deck(variant, characters, None)
}

/// A game like `game`, with its own deck instead of a seed's when `deck` gives one.
fn game_with_deck(
    variant: &str,
    characters: &[(Option<&str>, Option<i32>)],
    deck: Option<Vec<DeckCard>>,
) -> EngineState {
    create_game(GameSetup {
        player_names: (0..characters.len())
            .map(|i| format!("Player{i}"))
            .collect(),
        options: Options {
            num_players: characters.len(),
            variant_name: variant.into(),
            detrimental_characters: true,
            ..Options::default()
        },
        seed: deck.is_none().then(|| "p2v0s1".into()),
        deck,
        characters: Some(
            characters
                .iter()
                .map(|(name, metadata)| AssignedCharacter {
                    name: name.map(Into::into),
                    metadata: *metadata,
                })
                .collect(),
        ),
        interpretation: Interpretation::Live,
    })
    .expect("a valid game")
}

fn color_clue(target: usize, color: usize) -> PlayerAction {
    serde_json::from_value(
        json!({"type": "clue", "target": target, "clue": {"type": "color", "value": color}}),
    )
    .expect("a valid clue")
}

fn rank_clue(target: usize, rank: i32) -> PlayerAction {
    serde_json::from_value(
        json!({"type": "clue", "target": target, "clue": {"type": "rank", "value": rank}}),
    )
    .expect("a valid clue")
}

fn play(order: usize) -> PlayerAction {
    serde_json::from_value(json!({"type": "play", "order": order})).expect("a valid play")
}

fn discard(order: usize) -> PlayerAction {
    serde_json::from_value(json!({"type": "discard", "order": order})).expect("a valid discard")
}

/// The game after the active player takes an action, or the reason that it is rejected.
fn after(state: &EngineState, action: PlayerAction) -> Result<EngineState> {
    let mut next = state.clone();
    apply_action(&mut next, state.active_player_index, &action, None)?;
    Ok(next)
}

/// The game after the active player takes an action that must be accepted.
fn accepted(state: &EngineState, action: PlayerAction) -> EngineState {
    after(state, action).unwrap_or_else(|error| panic!("{action:?} was rejected: {error:#}"))
}

/// Whether the active player's character rules out the action.
fn refused(state: &EngineState, action: PlayerAction) -> bool {
    let player = &state.players[state.active_player_index];
    let character = player.character().expect("a character").name();
    after(state, action).is_err_and(|error| error.to_string().contains(character))
}

/// The suit index and rank of a card.
fn card(state: &EngineState, order: usize) -> (usize, i32) {
    let card = &state.deck[order];
    (card.suit_index, card.rank)
}

/// A rank clue to `target` that touches its card `order`.
fn rank_clue_on(state: &EngineState, target: usize, order: usize) -> PlayerAction {
    rank_clue(target, card(state, order).1)
}

/// The first card in `target`'s hand whose rank differs from that of `order`.
fn other_rank(state: &EngineState, target: usize, order: usize) -> usize {
    let rank = card(state, order).1;
    *state.players[target]
        .hand
        .iter()
        .find(|o| card(state, **o).1 != rank)
        .expect("a card of another rank")
}

#[test]
fn fuming_gives_only_rank_clues_and_their_color() {
    let probe = game("No Variant", &[(None, None), (None, None)]);
    let order = probe.players[1].hand[0];
    let (suit, _) = card(&probe, order);
    let other = probe.players[1]
        .hand
        .iter()
        .map(|o| card(&probe, *o).0)
        .find(|s| *s != suit)
        .expect("a card of another suit");
    let state = game(
        "No Variant",
        &[(Some("Fuming"), Some(int(suit))), (None, None)],
    );
    assert!(refused(&state, color_clue(1, other)));
    accepted(&state, color_clue(1, suit));
    accepted(&state, rank_clue_on(&state, 1, order));
}

#[test]
fn dumbfounded_gives_only_color_clues_and_their_rank() {
    let probe = game("No Variant", &[(None, None), (None, None)]);
    let order = probe.players[1].hand[0];
    let (suit, rank) = card(&probe, order);
    let other = other_rank(&probe, 1, order);
    let state = game(
        "No Variant",
        &[(Some("Dumbfounded"), Some(rank)), (None, None)],
    );
    assert!(refused(&state, rank_clue_on(&state, 1, other)));
    accepted(&state, rank_clue(1, rank));
    accepted(&state, color_clue(1, suit));
}

#[test]
fn inept_cannot_touch_cards_of_their_color() {
    let probe = game("No Variant", &[(None, None), (None, None)]);
    let order = probe.players[1].hand[0];
    let (suit, _) = card(&probe, order);
    let state = game(
        "No Variant",
        &[(Some("Inept"), Some(int(suit))), (None, None)],
    );
    let touches_suit = |rank: i32| {
        state.players[1]
            .hand
            .iter()
            .any(|o| card(&state, *o) == (suit, rank))
    };
    let (_, rank) = card(&state, order);
    assert!(refused(&state, rank_clue(1, rank)));
    let free = state.players[1]
        .hand
        .iter()
        .map(|o| card(&state, *o).1)
        .find(|r| !touches_suit(*r))
        .expect("a rank that no card of the color has");
    accepted(&state, rank_clue(1, free));
}

#[test]
fn inept_cannot_touch_cards_that_their_color_touches_when_suits_and_colors_differ() {
    // In this variant, clue color 4 is Pink, but suit 4 is Rainbow and suit 5 is Pink. Pink cards
    // are touched by every rank clue.
    let variant = "Rainbow & Pink (6 Suits)";
    let colors = &get_variant(variant).expect("a known variant").clue_colors;
    let pink = colors
        .iter()
        .position(|c| c == "Pink")
        .expect("a pink clue");
    let yellow = colors
        .iter()
        .position(|c| c == "Yellow")
        .expect("a yellow clue");
    assert_eq!(pink, 4);
    let card = |suit_index, rank| DeckCard { suit_index, rank };
    let mut deck = vec![card(0, 1); 5];
    deck.extend([card(1, 1), card(1, 2), card(5, 4), card(2, 5), card(3, 5)]);
    deck.extend(vec![card(0, 2); 5]);
    let state = game_with_deck(
        variant,
        &[(Some("Inept"), Some(int(pink))), (None, None)],
        Some(deck),
    );
    assert!(
        state.players[1]
            .hand
            .iter()
            .any(|o| state.deck[*o].suit_index == 5),
        "the pink card is in the hand that Inept clues"
    );
    // A rank 1 clue touches the yellow 1 and the pink card.
    assert!(refused(&state, rank_clue(1, 1)));
    assert!(refused(&state, color_clue(1, pink)));
    accepted(&state, color_clue(1, yellow));
}

#[test]
fn awkward_cannot_touch_cards_of_their_rank() {
    let probe = game("No Variant", &[(None, None), (None, None)]);
    let order = probe.players[1].hand[0];
    let (suit, rank) = card(&probe, order);
    let state = game("No Variant", &[(Some("Awkward"), Some(rank)), (None, None)]);
    assert!(refused(&state, color_clue(1, suit)));
    assert!(refused(&state, rank_clue(1, rank)));
    let other = other_rank(&state, 1, order);
    let free = state.players[1]
        .hand
        .iter()
        .map(|o| card(&state, *o))
        .find(|(s, r)| {
            *r != rank
                && !state.players[1]
                    .hand
                    .iter()
                    .any(|o| card(&state, *o) == (*s, rank))
        })
        .map_or_else(|| card(&state, other).1, |(_, r)| r);
    accepted(&state, rank_clue(1, free));
}

#[test]
fn vindictive_must_clue_after_being_clued_this_round() {
    let state = game("No Variant", &[(None, None), (Some("Vindictive"), None)]);
    let order = state.players[1].hand[0];
    let clued = accepted(&state, rank_clue_on(&state, 1, order));
    let own = clued.players[1].hand[0];
    assert!(refused(&clued, play(own)));
    assert!(refused(&clued, discard(own)));
    let target = clued.players[0].hand[0];
    let gave = accepted(&clued, rank_clue_on(&clued, 0, target));
    // Once Vindictive has given their clue, they are free again.
    let back = accepted(&gave, discard(gave.players[0].hand[0]));
    accepted(&back, discard(back.players[1].hand[0]));
    accepted(&back, play(back.players[1].hand[0]));
}

#[test]
fn mood_swings_alternates_clue_types() {
    let state = game("No Variant", &[(Some("Mood Swings"), None), (None, None)]);
    let order = state.players[1].hand[0];
    let (suit, _) = card(&state, order);
    let first = accepted(&state, color_clue(1, suit));
    let second = accepted(&first, discard(first.players[1].hand[0]));
    let order = second.players[1].hand[0];
    let (suit, _) = card(&second, order);
    assert!(refused(&second, color_clue(1, suit)));
    accepted(&second, rank_clue_on(&second, 1, order));
}

#[test]
fn insistent_clues_the_same_card_until_it_leaves_the_hand() {
    let state = game("No Variant", &[(Some("Insistent"), None), (None, None)]);
    let order = state.players[1].hand[0];
    let first = accepted(&state, rank_clue_on(&state, 1, order));
    let other = other_rank(&first, 1, order);
    let second = accepted(&first, rank_clue_on(&first, 0, first.players[0].hand[0]));
    assert!(refused(&second, discard(second.players[0].hand[0])));
    assert!(refused(&second, rank_clue_on(&second, 1, other)));
    let third = accepted(&second, color_clue(1, card(&second, order).0));
    // Once the card leaves the hand, Insistent is free again.
    let gone = accepted(&third, discard(order));
    accepted(&gone, discard(gone.players[0].hand[0]));
    accepted(&gone, rank_clue_on(&gone, 1, gone.players[1].hand[0]));
}

#[test]
fn impulsive_plays_their_slot_one_card_after_it_is_clued() {
    let state = game("No Variant", &[(None, None), (Some("Impulsive"), None)]);
    let slot_one = *state.players[1].hand.last().expect("a hand");
    let clued = accepted(&state, rank_clue_on(&state, 1, slot_one));
    assert!(refused(&clued, discard(slot_one)));
    let other = clued.players[1].hand[0];
    assert!(refused(&clued, play(other)));
    let played = accepted(&clued, play(slot_one));
    // After playing it, Impulsive is free again.
    let back = accepted(&played, discard(played.players[0].hand[0]));
    accepted(&back, rank_clue_on(&back, 0, back.players[0].hand[0]));
}

#[test]
fn indolent_cannot_play_twice_in_a_row() {
    let state = game("No Variant", &[(Some("Indolent"), None), (None, None)]);
    let played = accepted(&state, play(state.players[0].hand[0]));
    let back = accepted(&played, rank_clue_on(&played, 0, played.players[0].hand[0]));
    assert!(refused(&back, play(back.players[0].hand[0])));
    let discarded = accepted(&back, discard(back.players[0].hand[0]));
    let again = accepted(
        &discarded,
        rank_clue_on(&discarded, 0, discarded.players[0].hand[0]),
    );
    accepted(&again, play(again.players[0].hand[0]));
}

#[test]
fn genius_gives_a_rank_clue_to_the_same_player_after_a_color_clue() {
    let state = game(
        "No Variant",
        &[(Some("Genius"), None), (None, None), (None, None)],
    );
    let order = state.players[1].hand[0];
    let first = accepted(&state, color_clue(1, card(&state, order).0));
    assert_eq!(first.active_player_index, 0, "Genius takes a second action");
    assert!(refused(
        &first,
        rank_clue_on(&first, 2, first.players[2].hand[0])
    ));
    assert!(refused(&first, color_clue(1, card(&first, order).0)));
    assert!(refused(&first, discard(first.players[0].hand[0])));
    let second = accepted(&first, rank_clue_on(&first, 1, order));
    assert_eq!(second.active_player_index, 1);
}

#[test]
fn panicky_discards_twice_when_clues_are_low() {
    let mut state = game("No Variant", &[(Some("Panicky"), None), (None, None)]);
    // Spend clues until the Panicky player discards with few left.
    while state.active_player_index != 0
        || state.clue_tokens >= PANICKY_MAX_CLUES * clue_cost(&state)
    {
        let target = 1 - state.active_player_index;
        let order = state.players[target].hand[0];
        state = accepted(&state, rank_clue_on(&state, target, order));
    }
    let first = accepted(&state, discard(state.players[0].hand[0]));
    assert_eq!(first.active_player_index, 0, "Panicky discards again");
    let target = first.players[1].hand[0];
    assert!(refused(&first, rank_clue_on(&first, 1, target)));
    assert!(refused(&first, play(first.players[0].hand[0])));
    let second = accepted(&first, discard(first.players[0].hand[0]));
    assert_eq!(second.active_player_index, 1);
}

#[test]
fn stubborn_cannot_repeat_the_previous_players_kind_of_action() {
    let state = game("No Variant", &[(None, None), (Some("Stubborn"), None)]);
    let played = accepted(&state, play(state.players[0].hand[0]));
    assert!(refused(&played, play(played.players[1].hand[0])));
    accepted(&played, rank_clue_on(&played, 0, played.players[0].hand[0]));
    let clued = accepted(&state, rank_clue_on(&state, 1, state.players[1].hand[0]));
    let target = clued.players[0].hand[0];
    assert!(refused(&clued, rank_clue_on(&clued, 0, target)));
    assert!(refused(&clued, color_clue(0, card(&clued, target).0)));
    accepted(&clued, discard(clued.players[1].hand[0]));
}
