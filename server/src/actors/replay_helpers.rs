use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::{Card, Game, Options},
    model::{Player, Snapshot},
    stats::zero_stats,
};
use hanabi_engine::RecordedAction;
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{Clue, ClueTurn, ReplayGame};

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
    let raw = input.options.clone().unwrap_or_default();
    let variant_name = raw
        .variant_name
        .unwrap_or_else(|| hanabi_protocol::DEFAULT_VARIANT_NAME.into());
    let variant = hanabi_engine::get_variant(&variant_name)?;
    let has_characters = raw.detrimental_characters == Some(true) || input.characters.is_some();
    let defaults = Options::default();
    let mut options = Options {
        variant_name,
        timed: raw.timed.unwrap_or(defaults.timed),
        time_base: raw.time_base_seconds.unwrap_or(defaults.time_base),
        time_per_turn: raw.time_per_turn_seconds.unwrap_or(defaults.time_per_turn),
        speedrun: raw.speedrun.unwrap_or(defaults.speedrun),
        deck_plays: raw.deck_plays.unwrap_or(defaults.deck_plays),
        empty_clues: raw.empty_clues.unwrap_or(defaults.empty_clues),
        one_extra_card: raw.one_extra_card.unwrap_or(defaults.one_extra_card),
        one_less_card: raw.one_less_card.unwrap_or(defaults.one_less_card),
        all_or_nothing: raw.all_or_nothing.unwrap_or(defaults.all_or_nothing),
        detrimental_characters: raw
            .detrimental_characters
            .unwrap_or(defaults.detrimental_characters),
        ..defaults
    };
    let mut players = input.player_names.clone().unwrap_or_default();
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
        .flatten()
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
    let characters: Vec<AssignedCharacter> = input
        .characters
        .iter()
        .flatten()
        .map(|character| {
            let name = character.name.clone();
            // A character that has metadata gets the first value when the import leaves it out.
            let needs_metadata = name
                .as_deref()
                .and_then(hanabi_engine::Character::from_name)
                .is_some_and(hanabi_engine::Character::has_assigned_metadata);
            AssignedCharacter {
                metadata: character.metadata.or(needs_metadata.then_some(0)),
                name,
            }
        })
        .collect();
    ensure_or_reject!(
        !has_characters || characters.len() == players.len(),
        "The amount of characters must match the number of players"
    );
    let actions: Vec<RecordedAction> = input.actions.iter().flatten().copied().collect();
    for (i, a) in actions.iter().enumerate() {
        ensure_or_reject!(
            match a {
                RecordedAction::Play(card) | RecordedAction::Discard(card) =>
                    card.order.index() < deck.len(),
                RecordedAction::Clue(ClueTurn { target, clue }) =>
                    target.index() < players.len()
                        && match clue {
                            Clue::Color { value } => value.index() <= variant.clue_colors.len(),
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
    let raw_notes = input.notes.as_deref().unwrap_or_default();
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
        .enumerate()
        .map(|(i, p)| Player {
            id: UserId(hanabi_engine::int(i) + 1),
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
            "gameId": 7,
            "seed": "p2v0s1",
            "actions": [{"type": "gameOver", "endCondition": "terminatedByVote"}],
            "notes": [["", "a"], []]
        }))
        .unwrap();
        assert_eq!(imported.game.players.len(), 2);
        assert_eq!(imported.notes[0][1], "a");
        for input in [
            json!({"seed":"p2v0s1","options":{"timeBaseSeconds":1.5}}),
            json!({"seed":"p2v0s1","source":"another tool"}),
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
