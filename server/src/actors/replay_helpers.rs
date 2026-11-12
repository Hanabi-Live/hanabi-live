use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::{Card, Game},
    model::{Player, Snapshot},
    stats::zero_stats,
};
use hanabi_engine::ClueType;
use hanabi_engine::RecordedAction;
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{CharacterAssignment, Clue, ClueTurn, ReplayGame};

/// The longest seed that a replay import can name, in bytes. A table's seed is prefixed with the
/// player count and variant ID, so this leaves room above `MAX_SEED_LENGTH`.
const MAX_IMPORTED_SEED_LENGTH: usize = 64;

pub struct Imported {
    pub game: Game,
    pub notes: Vec<Vec<String>>,
    pub warnings: Vec<String>,
    /// The seed that the import named, if any.
    pub custom_seed: Option<String>,
}

pub fn parse(input: &ReplayGame) -> CommandResult<Imported> {
    let seed = input.seed.as_deref().unwrap_or("");
    ensure_or_reject!(
        seed.len() <= MAX_IMPORTED_SEED_LENGTH
            && seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
        "Invalid seed"
    );
    let mut options = crate::model::engine_options(&input.options);
    let variant = hanabi_engine::get_variant(&options.variant_name)?;
    let mut players = input.player_names.clone();
    if players.is_empty() {
        let pattern = regex!(crate::game::SEED_PATTERN);
        let count: usize = pattern
            .captures(seed)
            .or_reject("Provide players when the seed has no player count")?[2]
            .parse()
            .or_reject("Invalid seed")?;
        ensure_or_reject!(
            hanabi_protocol::is_player_count(count),
            "The seed's player count must be between {} and {}",
            hanabi_protocol::MIN_PLAYERS,
            hanabi_protocol::MAX_PLAYERS
        );
        let names: [&str; hanabi_protocol::MAX_PLAYERS] =
            ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"];
        players = names[..count].iter().map(|n| (*n).into()).collect();
    }
    ensure_or_reject!(
        hanabi_protocol::is_player_count(players.len())
            && players.iter().all(|n| !n.is_empty()
                && n.len() <= crate::accounts::MAX_USERNAME_LENGTH
                && !n.contains(|c| crate::accounts::USERNAME_SPECIAL_CHARACTERS.contains(c))),
        "Invalid players"
    );
    options.num_players = players.len();
    options.variant_id = Some(variant.id);
    let mut deck: Vec<Card> = input
        .deck
        .iter()
        .map(|card| Card {
            suit_index: card.suit_index.index(),
            rank: card.rank.into(),
        })
        .collect();
    let seeded = if seed.is_empty() {
        None
    } else {
        Some(hanabi_engine::create_shuffled_deck(variant, seed))
    };
    if deck.is_empty()
        && let Some(seeded) = &seeded
    {
        deck.clone_from(seeded);
    }
    ensure_or_reject!(
        deck.len() == hanabi_engine::create_deck(variant).len()
            && deck.iter().all(|c| c.suit_index < variant.suits.len()
                && matches!(
                    c.rank,
                    hanabi_protocol::MIN_RANK
                        ..=hanabi_protocol::MAX_RANK | hanabi_protocol::START_CARD_RANK
                )),
        "The deck must have {} valid cards in it.",
        hanabi_engine::create_deck(variant).len()
    );
    ensure_or_reject!(
        seeded.as_ref().is_none_or(|d| *d == deck),
        "The deck does not match the seed"
    );
    ensure_or_reject!(
        options.detrimental_characters || input.characters.is_empty(),
        "Characters need the detrimental characters option"
    );
    let mut characters: Vec<AssignedCharacter> = vec![];
    for &assignment in &input.characters {
        let id = assignment.character_id();
        let name = hanabi_engine::characters()
            .iter()
            .find(|known| known.id == id)
            .map(|known| known.name.clone())
            .or_reject("Unknown character assignment.")?;
        let character = hanabi_engine::Character::from_name(&name)
            .or_reject("Unknown character assignment.")?;
        let metadata = match (assignment, character.assigned_value_type()) {
            (CharacterAssignment::Plain { .. }, None) => None,
            (CharacterAssignment::Color { color, .. }, Some(ClueType::Color)) => {
                ensure_or_reject!(
                    color.index() < variant.clue_colors.len(),
                    "The color of {name} must be one of the variant's clue colors."
                );
                Some(i32::from(color))
            }
            (CharacterAssignment::Rank { rank, .. }, Some(ClueType::Rank)) => Some(i32::from(rank)),
            (_, Some(ClueType::Color)) => reject!("{name} must be assigned a color."),
            (_, Some(ClueType::Rank)) => reject!("{name} must be assigned a rank."),
            (_, None) => reject!("{name} is not assigned a color or a rank."),
        };
        characters.push(AssignedCharacter { name, metadata });
    }
    ensure_or_reject!(
        characters.is_empty() || characters.len() == players.len(),
        "The amount of characters must match the number of players"
    );
    let actions: Vec<RecordedAction> = input.actions.clone();
    for (i, a) in actions.iter().enumerate() {
        ensure_or_reject!(
            match a {
                RecordedAction::Play(card) | RecordedAction::Discard(card) =>
                    card.order.index() < deck.len(),
                RecordedAction::Clue(ClueTurn {
                    receiver_index: target,
                    clue,
                }) =>
                    target.index() < players.len()
                        && match clue {
                            Clue::Color { color } => color.index() <= variant.clue_colors.len(),
                            Clue::Rank { .. } => true,
                        },
                RecordedAction::GameOver(end) =>
                    if end.end_condition == EndCondition::TerminatedByVote {
                        end.player_index.is_none()
                    } else {
                        end.player_index.is_some_and(|p| p.index() < players.len())
                    },
            },
            "Invalid action at index {i}"
        );
    }
    let size = deck.len() + variant.suits.len();
    let raw_notes = &input.notes;
    ensure_or_reject!(
        raw_notes.is_empty() || raw_notes.len() == players.len(),
        "Invalid note rows"
    );
    let mut notes = vec![vec![String::new(); size]; players.len()];
    for (i, row) in raw_notes.iter().enumerate() {
        ensure_or_reject!(row.len() <= size, "Too many notes");
        for (j, text) in row.iter().enumerate() {
            ensure_or_reject!(
                text.len() <= hanabi_protocol::MAX_IMPORTED_NOTE_LENGTH,
                "Note too long"
            );
            text.clone_into(&mut notes[i][j]);
        }
    }
    let (game, invalid) = Game::replay_valid(
        GameSetup {
            options,
            player_names: players,
            seed: (!seed.is_empty()).then(|| seed.into()),
            deck: Some(deck),
            characters: (!characters.is_empty()).then_some(characters),
            interpretation: Interpretation::Recorded,
        },
        &actions,
    )?;
    let warnings = invalid
        .map(|(index, e)| {
            format!(
                "The action at index {index} was not valid. Skipping all subsequent actions. {e}"
            )
        })
        .into_iter()
        .collect();
    Ok(Imported {
        game,
        notes,
        warnings,
        custom_seed: (!seed.is_empty()).then(|| seed.into()),
    })
}
pub fn snapshot(imported: Imported, table_id: TableId, owner: UserId) -> Snapshot {
    let players = imported
        .game
        .players
        .iter()
        .map(|p| Player {
            // The players of an imported game need not be users.
            id: None,
            name: p.name.clone(),
            bot: false,
            stats: zero_stats(),
        })
        .collect();
    Snapshot {
        notes: imported.notes,
        ..Snapshot::new(
            table_id,
            None,
            owner,
            "JSON Replay".into(),
            players,
            imported.game,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn import(input: &Value) -> anyhow::Result<Imported> {
        Ok(parse(&hanabi_protocol::decode(input)?)?)
    }

    #[test]
    fn imports_accept_only_the_replay_format() {
        let imported = import(&json!({
            "seed": "p2v0s1",
            "actions": [{"type": "gameOver", "endCondition": "terminatedByVote"}],
            "notes": [["", "a"], []]
        }))
        .unwrap();
        assert_eq!(imported.game.players.len(), 2);
        assert_eq!(imported.notes[0][1], "a");
        for input in [
            json!({"seed":"p2v0s1","options":{"timeControl":{"baseSeconds":1.5,"perTurnSeconds":1}}}),
            json!({"seed":"p2v0s1","source":"another tool"}),
            // An export does not name its game, so neither does an import.
            json!({"seed":"p2v0s1","gameId":7}),
            json!({"seed":"p2v0s1","actions":[{"type":"gameOver","endCondition":"terminatedByVote","turn":1}]}),
            json!({"seed":"p2v0s1","options":{"tableName":"x"}}),
            json!({"seed":"p2v0s1","playerNames":null}),
            json!({"seed":"p2v0s1","options":{"speedrun":null}}),
            json!({"seed":"p2v0s1","notes":[[null,"a"],[]]}),
        ] {
            assert!(import(&input).is_err(), "{input}");
        }
    }

    #[test]
    fn imports_accept_the_longest_seed_a_table_makes() {
        let variant = hanabi_engine::variants()
            .iter()
            .max_by_key(|v| v.id)
            .unwrap();
        let suffix = "a".repeat(hanabi_protocol::MAX_SEED_LENGTH);
        let seed = format!("p{}v{}s{suffix}", hanabi_protocol::MAX_PLAYERS, variant.id);
        let imported =
            import(&json!({"seed": seed, "options": {"variantName": variant.name}})).unwrap();
        assert_eq!(imported.custom_seed.as_deref(), Some(seed.as_str()));
    }

    #[test]
    fn imported_characters_have_the_kind_of_value_that_they_are_assigned() {
        // Fuming (0) is assigned a clue color, Dumbfounded (1) a rank, and Conservative (4) none.
        let game = |characters: Value| {
            import(&json!({
                "seed": "p2v0s1",
                "options": {"detrimentalCharacters": true},
                "characters": characters,
            }))
        };
        let imported = game(json!([
            {"type": "color", "characterId": 0, "color": 4},
            {"type": "rank", "characterId": 1, "rank": 2},
        ]))
        .unwrap();
        let assigned: Vec<_> = imported
            .game
            .players
            .iter()
            .map(hanabi_engine::EnginePlayer::assigned_value)
            .collect();
        assert_eq!(assigned, [Some(4), Some(2)]);
        game(json!([{"type": "plain", "characterId": 4}, {"type": "plain", "characterId": 19}]))
            .unwrap();
        for characters in [
            // No Variant has 5 clue colors.
            json!([{"type": "color", "characterId": 0, "color": 5}, {"type": "plain", "characterId": 19}]),
            json!([{"type": "rank", "characterId": 0, "rank": 2}, {"type": "plain", "characterId": 19}]),
            json!([{"type": "plain", "characterId": 1}, {"type": "plain", "characterId": 19}]),
            json!([{"type": "color", "characterId": 4, "color": 0}, {"type": "plain", "characterId": 19}]),
        ] {
            assert!(game(characters.clone()).is_err(), "{characters}");
        }
    }

    #[test]
    fn malformed_import_elements_return_errors_instead_of_panicking() {
        for (field, value) in [
            ("deck", json!([5])),
            ("actions", json!([5])),
            ("characters", json!([5])),
            ("notes", json!([[42], []])),
            ("seed", json!(42)),
            ("options", json!({"variantName":42})),
        ] {
            let mut input = json!({"seed":"p2v0s1"});
            input[field] = value;
            assert!(
                std::panic::catch_unwind(|| import(&input))
                    .expect("untrusted JSON must not panic")
                    .is_err(),
                "{field}"
            );
        }
    }

    #[test]
    fn a_seed_and_a_deck_must_agree() {
        let seed = "p2v0s1";
        let variant = hanabi_engine::get_variant(hanabi_protocol::DEFAULT_VARIANT_NAME).unwrap();
        let seeded = hanabi_engine::create_shuffled_deck(variant, seed);
        let mut other = seeded.clone();
        let different = (1..other.len()).find(|&i| other[i] != other[0]).unwrap();
        other.swap(0, different);
        let input = |seed: &str, deck: Option<&[Card]>| {
            let mut input = json!({"playerNames":["Alice","Bob"],"seed":seed});
            if let Some(deck) = deck {
                input["deck"] = json!(deck);
            }
            input
        };
        let error = |input: Value| import(&input).err().unwrap().to_string();
        let identities = |input: Value| {
            import(&input)
                .unwrap()
                .game
                .deck
                .iter()
                .map(|c| (c.suit_index, c.rank))
                .collect::<Vec<_>>()
        };
        let expected = |deck: &[Card]| {
            deck.iter()
                .map(|c| (c.suit_index, c.rank))
                .collect::<Vec<_>>()
        };

        for deck in [None, Some(&[][..]), Some(&seeded[..])] {
            assert_eq!(identities(input(seed, deck)), expected(&seeded));
        }
        assert_eq!(identities(input("", Some(&other))), expected(&other));
        assert_eq!(
            error(input(seed, Some(&other))),
            "The deck does not match the seed"
        );
        assert_eq!(
            error(input(seed, Some(&seeded[..10]))),
            "The deck must have 50 valid cards in it."
        );
    }
}
