//! Plays games with seeded random moves, and prints each game as JSON: its events, as the server
//! sends them, and the engine's numbers after each move. A test replays the events with the game
//! library's rules and compares the numbers.
//!
//! Most variants differ only in which cards a clue touches, which does not change the numbers. So
//! the variants are grouped by their other rules, and the first variant of each group is played.

use anyhow::Context;
use hanabi_engine::{
    EngineState, GameSetup, Options, PlayerAction, StackDirection, apply_action, create_game,
    create_shuffled_deck, validate_action, variants, wire_event,
};
use hanabi_protocol::{
    CardOrder, Clue, ClueRank, ClueTurn, ColorIndex, MAX_PLAYERS, MIN_PLAYERS, PlayerIndex,
    TargetCard,
};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

/// The properties of a variant that only decide which cards a clue touches, or that only name it.
const CLUE_PROPERTIES: [&str; 16] = [
    "id",
    "recipe",
    "name",
    "clueColors",
    "clueRanks",
    "specialRankAllClueColors",
    "specialRankAllClueRanks",
    "specialRankNoClueColors",
    "specialRankNoClueRanks",
    "specialRankDeceptive",
    "colorCluesTouchNothing",
    "rankCluesTouchNothing",
    "cowAndPig",
    "duck",
    "synesthesia",
    "hasInverted",
];

/// The properties of a suit that only decide which cards a clue touches, or that only name it.
const SUIT_CLUE_PROPERTIES: [&str; 7] = [
    "name",
    "clueColors",
    "allClueColors",
    "noClueColors",
    "allClueRanks",
    "noClueRanks",
    "prism",
];

/// A game that runs longer than this many moves is a bug in the engine.
const MAX_MOVES: usize = 1000;

/// The chance, in percent, that a player plays a card that the move picker knows is playable.
const PLAY_CHANCE: u64 = 60;

/// The chance, in percent, that a player plays a random card, which is usually a misplay.
const BLIND_PLAY_CHANCE: u64 = 5;

/// The chance, in percent, that a player who can both clue and discard gives a clue.
const CLUE_CHANCE: u64 = 50;

/// A game, as the test reads it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    variant_name: String,
    num_players: usize,
    options: Value,
    events: Vec<hanabi_protocol::GameEvent>,
    checkpoints: Vec<Checkpoint>,
}

/// The engine's numbers after the events before `num_events`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Checkpoint {
    num_events: usize,
    turn: i32,
    current_player_index: Option<usize>,
    score: i32,
    max_score: i32,
    clue_tokens: i32,
    strikes: i32,
    cards_remaining_in_the_deck: usize,
    stack_directions: Vec<StackDirection>,
}

/// A small, seeded random number generator, so that every run plays the same games.
struct Random(u64);

impl Random {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn below(&mut self, n: usize) -> usize {
        usize::try_from(self.next() % u64::try_from(n).expect("small")).expect("small")
    }

    fn percent(&mut self, chance: u64) -> bool {
        self.next() % 100 < chance
    }

    fn pick<T: Copy>(&mut self, items: &[T]) -> Option<T> {
        (!items.is_empty()).then(|| items[self.below(items.len())])
    }
}

fn checkpoint(state: &EngineState) -> Checkpoint {
    Checkpoint {
        num_events: state.events.len(),
        turn: state.turn,
        current_player_index: state.end.is_none().then_some(state.active_player_index),
        score: state.score,
        max_score: state.max_score,
        clue_tokens: state.clue_tokens,
        strikes: state.strikes,
        cards_remaining_in_the_deck: state.deck.len() - state.deck_index,
        stack_directions: state.play_stack_directions.clone(),
    }
}

fn card(order: usize) -> TargetCard {
    TargetCard {
        order: CardOrder::new(order).expect("a card in a hand"),
    }
}

/// Picks the active player's next move: usually a play that works, otherwise a clue or a discard.
fn pick_move(state: &EngineState, random: &mut Random) -> PlayerAction {
    let actor = state.active_player_index;
    let variant = hanabi_engine::get_variant(&state.options.variant_name).expect("a variant");
    let hand = &state.players[actor].hand;
    let legal = |action: &PlayerAction| validate_action(state, actor, action).is_ok();
    let plays: Vec<_> = hand
        .iter()
        .map(|&order| PlayerAction::Play(card(order)))
        .filter(legal)
        .collect();
    let discards: Vec<_> = hand
        .iter()
        .map(|&order| PlayerAction::Discard(card(order)))
        .filter(legal)
        .collect();
    let colors = (0..variant.clue_colors.len()).map(|color| Clue::Color {
        color: ColorIndex::new(color).expect("a clue color"),
    });
    let ranks = variant.clue_ranks.iter().map(|&rank| Clue::Rank {
        rank: ClueRank::new(rank).expect("a clue rank"),
    });
    let clue_values: Vec<_> = colors.chain(ranks).collect();
    let clue_moves: Vec<_> = (0..state.players.len())
        .filter(|&target| target != actor)
        .flat_map(|target| {
            let receiver_index = PlayerIndex::new(target).expect("a seat");
            clue_values.iter().map(move |&clue| {
                PlayerAction::Clue(ClueTurn {
                    receiver_index,
                    clue,
                })
            })
        })
        .filter(legal)
        .collect();

    if random.percent(PLAY_CHANCE) {
        let good_plays: Vec<_> = plays
            .iter()
            .copied()
            .filter(|action| {
                let mut next = state.clone();
                apply_action(&mut next, actor, action, None).is_ok()
                    && next.strikes == state.strikes
            })
            .collect();
        if let Some(action) = random.pick(&good_plays) {
            return action;
        }
    }
    if random.percent(BLIND_PLAY_CHANCE)
        && let Some(action) = random.pick(&plays)
    {
        return action;
    }
    let clue_first = random.percent(CLUE_CHANCE);
    let (first, second) = if clue_first {
        (&clue_moves, &discards)
    } else {
        (&discards, &clue_moves)
    };
    random
        .pick(first)
        .or_else(|| random.pick(second))
        .or_else(|| random.pick(&plays))
        .expect("a player always has a legal move")
}

fn play_game(index: usize, variant_name: &str) -> anyhow::Result<Game> {
    let mut random = Random(0x9E37_79B9_7F4A_7C15 ^ u64::try_from(index)?);
    let num_players = MIN_PLAYERS + index % (MAX_PLAYERS - MIN_PLAYERS + 1);
    // Each game turns on a different option, and every fifth game none.
    let mut options = Options {
        num_players,
        variant_name: variant_name.into(),
        ..Options::default()
    };
    match index % 5 {
        0 => options.one_extra_card = true,
        1 => options.one_less_card = true,
        2 => options.all_or_nothing = true,
        3 => options.deck_plays = true,
        _ => {}
    }
    options.empty_clues = index.is_multiple_of(2);
    let seed = format!("p{num_players}v{index}s1");
    let variant = hanabi_engine::get_variant(variant_name)?;
    let mut state = create_game(GameSetup {
        player_names: (0..num_players)
            .map(|seat| format!("Player {seat}"))
            .collect(),
        seed: Some(seed.clone()),
        deck: Some(create_shuffled_deck(variant, &seed)),
        characters: None,
        interpretation: hanabi_engine::Interpretation::Live,
        options: options.clone(),
    })?;
    let mut checkpoints = vec![checkpoint(&state)];
    for _ in 0..MAX_MOVES {
        if state.end.is_some() {
            break;
        }
        let action = pick_move(&state, &mut random);
        let actor = state.active_player_index;
        apply_action(&mut state, actor, &action, None)?;
        checkpoints.push(checkpoint(&state));
    }
    anyhow::ensure!(state.end.is_some(), "The {variant_name} game did not end.");
    Ok(Game {
        variant_name: variant_name.into(),
        num_players,
        options: serde_json::json!({
            "oneExtraCard": options.one_extra_card,
            "oneLessCard": options.one_less_card,
            "allOrNothing": options.all_or_nothing,
            "deckPlays": options.deck_plays,
            "emptyClues": options.empty_clues,
            "variantId": variant.id,
        }),
        events: state.events.iter().map(wire_event).collect(),
        checkpoints,
    })
}

/// A variant's rules, without the properties that only decide which cards a clue touches. The
/// order of the suits does not matter.
fn rule_set(variant: &hanabi_engine::Variant) -> anyhow::Result<String> {
    let mut value = serde_json::to_value(variant)?;
    let object = value.as_object_mut().context("A variant is an object.")?;
    for property in CLUE_PROPERTIES {
        object.remove(property);
    }
    let mut suits = Vec::new();
    for suit in object
        .remove("suits")
        .and_then(|suits| suits.as_array().cloned())
        .context("A variant has suits.")?
    {
        let mut suit = suit;
        let suit_object = suit.as_object_mut().context("A suit is an object.")?;
        for property in SUIT_CLUE_PROPERTIES {
            suit_object.remove(property);
        }
        suits.push(suit.to_string());
    }
    suits.sort();
    object.insert("suits".into(), suits.into());
    Ok(value.to_string())
}

fn main() -> anyhow::Result<()> {
    let mut played = HashSet::new();
    let mut games = Vec::new();
    for (index, variant) in variants().iter().enumerate() {
        if played.insert(rule_set(variant)?) {
            games.push(play_game(index, &variant.name)?);
        }
    }
    println!("{}", serde_json::to_string(&games)?);
    Ok(())
}
