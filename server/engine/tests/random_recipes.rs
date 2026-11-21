//! Plays games on random recipes, most of which no catalog variant has, and checks that the engine
//! keeps its rules on each turn.

use hanabi_engine::*;
use hanabi_protocol::{
    EndCondition, MAX_CLUES, MAX_RANK, MAX_SUITS, MIN_PLAYERS, MIN_RANK, RecipeFlag,
};
use serde_json::json;
use std::collections::BTreeSet;

/// The recipes that the test tries. Many of them are invalid; the test plays the others.
const RECIPES: usize = 3000;
/// More turns than any game can last, since each turn plays, discards, or gives a clue.
const MAX_TURNS: i32 = 1000;

/// A small, fixed random number generator, so that each run tests the same games.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        let n = u64::try_from(n).expect("a count fits in 64 bits");
        usize::try_from(self.next() % n).expect("a value below a count fits in a count")
    }
    fn chance(&mut self, percent: u64) -> bool {
        self.next() % 100 < percent
    }
    fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        &items[self.below(items.len())]
    }
}

/// The parts that recipes use: the suit IDs, and the codes of the special ranks.
struct Parts {
    suits: Vec<String>,
    special_ranks: Vec<String>,
}

fn parts() -> Parts {
    let suits: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../../packages/game/src/json/suits.json"))
            .expect("suits.json is JSON");
    let suits: Vec<String> = suits
        .iter()
        .map(|suit| suit["id"].as_str().expect("each suit has an ID").to_owned())
        .collect();
    // The catalog uses every special rank, so its recipes list their codes.
    let special_ranks: BTreeSet<String> = variants()
        .iter()
        .flat_map(|variant| variant.recipe.split('_').skip(1))
        .filter(|token| token.starts_with(|c: char| c.is_ascii_digit()))
        .map(|token| {
            token
                .trim_start_matches(|c: char| c.is_ascii_digit())
                .to_owned()
        })
        .filter(|code| code != "crit" && code != "scarce")
        .collect();
    Parts {
        suits,
        special_ranks: special_ranks.into_iter().collect(),
    }
}

fn random_recipe(random: &mut Random, parts: &Parts) -> String {
    let mut ids = parts.suits.clone();
    let mut tokens = Vec::new();
    let mut suits = Vec::new();
    for _ in 0..=random.below(MAX_SUITS) {
        // Dark suits have IDs of their own, such as `ra.dark`.
        let mut suit = ids.remove(random.below(ids.len()));
        if random.chance(15) {
            suit += ".rev";
        }
        suits.push(suit);
    }
    tokens.push(suits.join("-"));
    let ranks: Vec<i32> = (MIN_RANK..=MAX_RANK).collect();
    let rank = |random: &mut Random| *random.pick(&ranks);
    if random.chance(30) {
        tokens.push(format!(
            "{}{}",
            rank(random),
            random.pick(&parts.special_ranks)
        ));
    }
    if random.chance(15) {
        tokens.push(format!("{}crit", rank(random)));
    }
    if random.chance(10) {
        tokens.push(format!("{MIN_RANK}scarce"));
    }
    for flag in RecipeFlag::ALL {
        if random.chance(12) {
            tokens.push(flag.name().to_owned());
        }
    }
    tokens.join("_")
}

fn clue(target: usize, color: Option<usize>, rank: Option<i32>) -> PlayerAction {
    let clue = match (color, rank) {
        (Some(color), _) => json!({"type": "color", "color": color}),
        (_, Some(rank)) => json!({"type": "rank", "rank": rank}),
        _ => unreachable!(),
    };
    serde_json::from_value(json!({"type": "clue", "receiverIndex": target, "clue": clue}))
        .expect("a valid clue")
}

fn card_action(kind: &str, order: usize) -> PlayerAction {
    serde_json::from_value(json!({"type": kind, "order": order})).expect("a valid action")
}

/// Checks the rules that hold after every turn.
fn check(state: &EngineState, variant: &Variant, max_score_before: i32, recipe: &str) {
    // A game that ends any way but the normal one scores zero.
    let played = match state.end {
        Some(end) if end.condition != EndCondition::Normal => 0,
        _ => state.deck.iter().filter(|card| card.played).count(),
    };
    assert_eq!(
        usize::try_from(state.score).expect("scores are not negative"),
        played,
        "{recipe}"
    );
    assert!(state.score <= state.max_score, "{recipe}");
    assert!(state.max_score <= max_score_before, "{recipe}");
    assert!(
        (0..=MAX_CLUES * clue_cost_for(variant)).contains(&state.clue_tokens),
        "{recipe}"
    );
    let in_hands: usize = state.players.iter().map(|player| player.hand.len()).sum();
    let gone = state
        .deck
        .iter()
        .filter(|card| card.played || card.discarded)
        .count();
    assert_eq!(
        in_hands + gone + state.deck.len() - state.deck_index,
        state.deck.len(),
        "{recipe}"
    );
    if state.score == variant.max_score {
        assert!(state.end.is_some(), "{recipe}: a perfect game did not end");
    }
}

/// Plays a game with random moves. A player who holds a playable card plays it most of the time,
/// and a card that would misplay seldom, so that many games reach a high score.
fn play(random: &mut Random, variant: &'static Variant, num_players: usize, seed: &str) {
    let recipe = &variant.recipe;
    let options = Options {
        num_players,
        variant_name: variant.name.clone(),
        ..Options::default()
    };
    let setup = GameSetup {
        player_names: (0..num_players).map(|i| format!("Player{i}")).collect(),
        options,
        seed: Some(seed.to_owned()),
        deck: None,
        characters: None,
        interpretation: Interpretation::Live,
    };
    let needed = num_players * normal_hand_size(num_players);
    let Ok(mut state) = create_game(setup) else {
        assert!(deck_size(variant) < needed, "{recipe}: no game");
        return;
    };
    assert!(
        deck_size(variant) >= needed,
        "{recipe}: a game without enough cards"
    );
    let mut max_score = variant.max_score;
    while state.end.is_none() {
        assert!(state.turn < MAX_TURNS, "{recipe}: the game did not end");
        let actor = state.active_player_index;
        let hand = state.players[actor].hand.clone();
        let mut actions: Vec<PlayerAction> = Vec::new();
        for &order in &hand {
            actions.push(card_action("play", order));
            actions.push(card_action("discard", order));
        }
        for target in (0..num_players).filter(|&target| target != actor) {
            for color in 0..variant.clue_colors.len() {
                actions.push(clue(target, Some(color), None));
            }
            for &rank in &variant.clue_ranks {
                actions.push(clue(target, None, Some(rank)));
            }
        }
        let scoring = hand.iter().find_map(|&order| {
            let mut next = state.clone();
            let action = card_action("play", order);
            (apply_action(&mut next, actor, &action, None).is_ok() && next.score > state.score)
                .then_some(next)
        });
        state = match scoring {
            Some(next) if random.chance(90) => next,
            _ => loop {
                assert!(!actions.is_empty(), "{recipe}: no legal action");
                let action = actions.remove(random.below(actions.len()));
                let mut next = state.clone();
                if apply_action(&mut next, actor, &action, None).is_ok()
                    && (next.strikes == state.strikes || random.chance(10))
                {
                    break next;
                }
            },
        };
        check(&state, variant, max_score, recipe);
        max_score = state.max_score;
    }
    for player_index in 0..num_players {
        let recipient = Recipient::Player {
            player_index: int(player_index),
        };
        events_for_recipient(&state, recipient, None).expect("each player sees the game");
    }
}

#[test]
fn games_on_random_recipes_keep_the_rules() {
    let parts = parts();
    let mut random = Random(0x9e37_79b9_7f4a_7c15);
    let mut played = 0;
    for _ in 0..RECIPES {
        let recipe = random_recipe(&mut random, &parts);
        let Ok(variant) = variant_from_recipe(&recipe, 0, &recipe) else {
            continue;
        };
        assert!(variant.max_score <= int(variant.suits.len()) * MAX_RANK);
        let variant = add_variant(variant).unwrap();
        let num_players =
            MIN_PLAYERS + random.below(hanabi_protocol::MAX_PLAYERS - MIN_PLAYERS + 1);
        play(
            &mut random,
            variant,
            num_players,
            &format!("p{num_players}v0s{played}"),
        );
        played += 1;
    }
    assert!(played > RECIPES / 10, "only {played} recipes were valid");
}
