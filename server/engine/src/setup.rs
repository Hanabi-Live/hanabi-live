use crate::{
    AssignedCharacter, Character, DeckCard, Variant, characters, int, num_copies_of_card,
    random::{GoRandom, seed_hash},
};
use anyhow::{Result, ensure};
use hanabi_protocol::{MAX_PLAYERS, MAX_RANK, MIN_PLAYERS, NO_VALUE};

/// The highest rank a Dumbfounded or Awkward character is assigned, which leaves out the top rank.
const MAX_CHARACTER_RANK: i32 = MAX_RANK - 1;

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

pub fn assign_characters(
    variant: &Variant,
    seed: &str,
    players: &[String],
) -> Result<Vec<AssignedCharacter>> {
    ensure!(
        hanabi_protocol::is_player_count(players.len()),
        "Character assignments require {MIN_PLAYERS} to {MAX_PLAYERS} players."
    );
    let mut rng = GoRandom::new(seed_hash(seed));
    let catalog = characters();
    let mut assigned: Vec<AssignedCharacter> = vec![];
    for (index, player) in players.iter().enumerate() {
        if [
            "test", "test1", "test2", "test3", "test4", "test5", "test6", "test7",
        ]
        .contains(&player.as_str())
        {
            assigned.push(AssignedCharacter {
                name: (index == 0).then(|| Character::Genius.name().into()),
                metadata: None,
            });
            continue;
        }
        let character = loop {
            let candidate = &catalog[rng.index(catalog.len())];
            if (players.len() != MIN_PLAYERS || !candidate.not_two_player)
                && assigned
                    .iter()
                    .all(|c| c.name.as_deref() != Some(candidate.name.as_str()))
            {
                break candidate;
            }
        };
        let metadata = match Character::from_name(&character.name) {
            Some(Character::Fuming | Character::Inept) => {
                ensure!(
                    !variant.clue_colors.is_empty(),
                    "Character requires clue colors"
                );
                int(rng.index(variant.clue_colors.len()))
            }
            Some(Character::Dumbfounded | Character::Awkward) => {
                int(rng.index(usize::try_from(MAX_CHARACTER_RANK)?)) + 1
            }
            _ => NO_VALUE,
        };
        assigned.push(AssignedCharacter {
            name: Some(character.name.clone()),
            metadata: (metadata != NO_VALUE).then_some(metadata),
        });
    }
    Ok(assigned)
}
