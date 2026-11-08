use crate::{
    AssignedCharacter, Character, DeckCard, NO_CHARACTER, Variant, characters, int,
    num_copies_of_card,
    random::{GoRandom, seed_hash},
};
use anyhow::{Result, ensure};
use hanabi_protocol::MAX_RANK;

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

pub fn create_shuffled_deck(variant: &Variant, seed: &str) -> Result<Vec<DeckCard>> {
    let mut rng = GoRandom::new(seed_hash(seed)?);
    let mut deck = create_deck(variant);
    rng.shuffle(&mut deck);
    Ok(deck)
}

/// When the lobby shuffles seats, consume the same stream *after* shuffling the deck.
/// `create_game` accepts ordered seats and a prepared deck and never shuffles them again.
pub fn prepare_deck_and_players<T>(
    variant: &Variant,
    seed: &str,
    players: &mut [T],
    shuffle_players: bool,
) -> Result<Vec<DeckCard>> {
    let mut deck = create_deck(variant);
    prepare_game_order(&mut deck, players, seed, true, shuffle_players)?;
    Ok(deck)
}

/// Apply conditional, forward deck/seat shuffles with one per-game stream.
/// A custom prepared deck should pass `shuffle_deck = false`.
pub fn prepare_game_order<T>(
    deck: &mut [DeckCard],
    players: &mut [T],
    seed: &str,
    shuffle_deck: bool,
    shuffle_players: bool,
) -> Result<()> {
    let mut rng = GoRandom::new(seed_hash(seed)?);
    if shuffle_deck {
        rng.shuffle(deck);
    }
    if shuffle_players {
        rng.shuffle(players);
    }
    Ok(())
}

pub fn assign_characters(
    variant: &Variant,
    seed: &str,
    players: &[String],
) -> Result<Vec<AssignedCharacter>> {
    ensure!(
        hanabi_protocol::is_player_count(players.len()),
        "Character assignments require two to six players."
    );
    let mut rng = GoRandom::new(seed_hash(seed)?);
    let catalog = characters();
    let mut assigned: Vec<AssignedCharacter> = vec![];
    for (index, player) in players.iter().enumerate() {
        if [
            "test", "test1", "test2", "test3", "test4", "test5", "test6", "test7",
        ]
        .contains(&player.as_str())
        {
            assigned.push(AssignedCharacter {
                name: if index == 0 {
                    Character::Genius.name()
                } else {
                    NO_CHARACTER
                }
                .into(),
                metadata: -1,
            });
            continue;
        }
        let character = loop {
            let candidate = &catalog[rng.index(catalog.len())];
            if (players.len() != 2 || !candidate.not_two_player)
                && assigned.iter().all(|c| c.name != candidate.name)
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
            _ => -1,
        };
        assigned.push(AssignedCharacter {
            name: character.name.clone(),
            metadata,
        });
    }
    Ok(assigned)
}
