use crate::{
    DeckCard, Variant, num_copies_of_card,
    random::{GoRandom, seed_hash},
};

pub fn create_deck(variant: &Variant) -> Vec<DeckCard> {
    let mut deck = Vec::new();
    for (suit_index, suit) in variant.suits.iter().enumerate() {
        for &rank in &variant.ranks {
            for _ in 0..num_copies_of_card(variant, suit, rank) {
                deck.push(DeckCard { suit_index, rank });
            }
        }
    }
    deck
}

pub fn create_shuffled_deck(variant: &Variant, seed: &str) -> Vec<DeckCard> {
    let mut rng = GoRandom::new(seed_hash(seed));
    let mut deck = create_deck(variant);
    rng.shuffle(&mut deck);
    deck
}

/// When the lobby shuffles seats, consume the same stream *after* shuffling the deck.
/// `create_game` accepts ordered seats and a prepared deck and never shuffles them again.
pub fn prepare_deck_and_players<T>(
    variant: &Variant,
    seed: &str,
    players: &mut [T],
    shuffle_players: bool,
) -> Vec<DeckCard> {
    let mut deck = create_deck(variant);
    prepare_game_order(&mut deck, players, seed, true, shuffle_players);
    deck
}

/// Apply conditional, forward deck/seat shuffles with one per-game stream.
/// A custom prepared deck should pass `shuffle_deck = false`.
pub fn prepare_game_order<T>(
    deck: &mut [DeckCard],
    players: &mut [T],
    seed: &str,
    shuffle_deck: bool,
    shuffle_players: bool,
) {
    let mut rng = GoRandom::new(seed_hash(seed));
    if shuffle_deck {
        rng.shuffle(deck);
    }
    if shuffle_players {
        rng.shuffle(players);
    }
}
