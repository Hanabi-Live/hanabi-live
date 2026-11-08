use crate::{
    game::{Card, Game, Options},
    model::{FORMAT, IDLE_TIMEOUT_MS, Player, Snapshot},
    store::zero_stats,
};
use anyhow::{Context, Result, ensure};
use chrono::Utc;
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::{RecordedActionType, ReplayAction, ReplayImport};
use std::collections::BTreeMap;

/// The longest seed that a replay import can name, in bytes.
const MAX_IMPORTED_SEED_LENGTH: usize = 45;

pub struct Imported {
    pub game: Game,
    pub notes: Vec<Vec<String>>,
    pub warnings: Vec<String>,
    /// The seed that the import named, if any.
    pub custom_seed: Option<String>,
}
/// Converts imported whole seconds to the float that options hold. Option validation rejects any
/// value beyond 2^53, so precision lost above it never reaches a game.
#[expect(
    clippy::cast_precision_loss,
    reason = "option validation rejects values beyond 2^53"
)]
fn seconds(value: i64) -> f64 {
    value as f64
}

pub fn parse(input: &ReplayImport) -> Result<Imported> {
    let seed = input.seed.as_deref().unwrap_or("");
    ensure!(
        seed.len() <= MAX_IMPORTED_SEED_LENGTH
            && seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
        "Invalid seed"
    );
    let raw = input.options.clone().unwrap_or_default();
    let variant_name = raw.variant.unwrap_or_else(|| "No Variant".into());
    let variant = hanabi_engine::get_variant(&variant_name)?;
    let has_characters = raw.detrimental_characters.is_some();
    let defaults = Options::default();
    let mut options = Options {
        variant_name,
        starting_player: match raw.starting_player {
            Some(index) => usize::try_from(index)?,
            None => defaults.starting_player,
        },
        timed: raw.timed.unwrap_or(defaults.timed),
        time_base: raw.time_base.map_or(defaults.time_base, seconds),
        time_per_turn: raw.time_per_turn.unwrap_or(defaults.time_per_turn),
        speedrun: raw.speedrun.unwrap_or(defaults.speedrun),
        card_cycle: raw.card_cycle.unwrap_or(defaults.card_cycle),
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
    let mut players = input.players.clone().unwrap_or_default();
    if players.is_empty() {
        let pattern = regex!(r"^(?:legacy-\d+-)?p(\d+)v\d+s[-0-9A-Za-z]+$");
        let count: usize = pattern
            .captures(seed)
            .context("Provide players when the seed has no player count")?[1]
            .parse()?;
        ensure!(
            hanabi_protocol::is_player_count(count),
            "The seed's player count must be between {} and {}",
            hanabi_protocol::MIN_PLAYERS,
            hanabi_protocol::MAX_PLAYERS
        );
        let names: [&str; hanabi_protocol::MAX_PLAYERS] =
            ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"];
        players = names[..count].iter().map(|n| (*n).into()).collect();
    }
    ensure!(
        hanabi_protocol::is_player_count(players.len())
            && players.iter().all(|n| !n.is_empty()
                && n.len() <= crate::accounts::MAX_USERNAME_LENGTH
                && !n.contains(|c| crate::accounts::USERNAME_SPECIAL_CHARACTERS.contains(c))),
        "Invalid players"
    );
    options.num_players = players.len();
    options.variant_id = Some(variant.id);
    ensure!(
        options.starting_player < players.len(),
        "Invalid starting player"
    );
    let mut deck: Vec<Card> = input
        .deck
        .iter()
        .flatten()
        .map(|card| -> Result<Card> {
            Ok(Card {
                suit_index: usize::try_from(card.suit_index.unwrap_or(0))?,
                rank: card.rank.unwrap_or(0),
            })
        })
        .collect::<Result<_>>()?;
    let seeded = if seed.is_empty() {
        None
    } else {
        Some(hanabi_engine::create_shuffled_deck(variant, seed)?)
    };
    if deck.is_empty()
        && let Some(seeded) = &seeded
    {
        deck.clone_from(seeded);
    }
    ensure!(
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
    ensure!(
        seeded.as_ref().is_none_or(|d| *d == deck),
        "The deck does not match the seed"
    );
    let characters: Vec<AssignedCharacter> = input
        .characters
        .iter()
        .flatten()
        .map(|character| AssignedCharacter {
            name: character.name.clone().unwrap_or_default(),
            metadata: character.metadata.unwrap_or(0),
        })
        .collect();
    ensure!(
        !has_characters || characters.len() == players.len(),
        "The amount of characters must match the number of players"
    );
    let actions: Vec<ReplayAction> = input
        .actions
        .iter()
        .flatten()
        .map(|action| ReplayAction {
            kind: action.kind.unwrap_or(RecordedActionType::Play),
            target: action.target.unwrap_or(0),
            value: action.value.unwrap_or(0),
        })
        .collect();
    for (i, a) in actions.iter().enumerate() {
        ensure!(
            match a.kind {
                RecordedActionType::Play | RecordedActionType::Discard =>
                    usize::try_from(a.target).is_ok_and(|t| t < deck.len()) && a.value == 0,
                RecordedActionType::ColorClue =>
                    usize::try_from(a.target).is_ok_and(|t| t < players.len())
                        && usize::try_from(a.value).is_ok_and(|v| v <= variant.clue_colors.len()),
                RecordedActionType::RankClue =>
                    usize::try_from(a.target).is_ok_and(|t| t < players.len())
                        && (hanabi_protocol::MIN_RANK..=hanabi_protocol::MAX_RANK)
                            .contains(&a.value),
                RecordedActionType::GameOver =>
                    usize::try_from(a.target).is_ok_and(|t| t < players.len()),
                RecordedActionType::GameOverByVote => a.target == -1,
            },
            "Invalid action at index {i}"
        );
    }
    let size = deck.len() + variant.suits.len();
    let raw_notes = input.notes.as_deref().unwrap_or_default();
    ensure!(
        raw_notes.is_empty() || raw_notes.len() == players.len(),
        "Invalid note rows"
    );
    let mut notes = vec![vec![String::new(); size]; players.len()];
    for (i, row) in raw_notes.iter().enumerate() {
        ensure!(row.0.len() <= size, "Too many notes");
        for (j, text) in row.0.iter().enumerate() {
            ensure!(
                text.len() <= hanabi_protocol::MAX_IMPORTED_NOTE_LENGTH,
                "Note too long"
            );
            text.clone_into(&mut notes[i][j]);
        }
    }
    let mut game = Game::create(GameSetup {
        options,
        player_names: players,
        seed: if seed.is_empty() {
            "JSON".into()
        } else {
            seed.into()
        },
        deck: Some(deck),
        characters: (!characters.is_empty()).then_some(characters),
        interpretation: Interpretation::LegacyReplay,
    })?;
    let mut warnings = vec![];
    for (index, a) in actions.into_iter().enumerate() {
        if game.end_condition != EndCondition::InProgress {
            break;
        }
        let active = game.active_player_index;
        let result = if a.kind.is_game_over() {
            EndCondition::try_from(a.value)
                .map_err(anyhow::Error::msg)
                .and_then(|c| game.terminate(active, c, a.target, None, None))
        } else {
            game.apply(active, a)
        };
        if let Err(e) = result {
            warnings.push(format!(
                "The action at index {index} was not valid. Skipping all subsequent actions. {e}"
            ));
            break;
        }
    }
    Ok(Imported {
        game,
        notes,
        warnings,
        custom_seed: (!seed.is_empty()).then(|| seed.into()),
    })
}
pub fn snapshot(imported: Imported, table_id: u64, owner: i32) -> Snapshot {
    let now = Utc::now();
    let n = imported.game.players.len();
    Snapshot {
        format: FORMAT.into(),
        table_id,
        game_id: 0,
        owner,
        name: "JSON Replay".into(),
        players: imported
            .game
            .players
            .iter()
            .enumerate()
            .map(|(i, p)| Player {
                id: hanabi_engine::int(i) + 1,
                name: p.name.clone(),
                stats: zero_stats(),
            })
            .collect(),
        seed: imported.game.seed.clone(),
        created: now,
        started: now,
        finished: (imported.game.end_condition != EndCondition::InProgress).then_some(now),
        game: imported.game,
        clocks: vec![0; n],
        duration: 0,
        turn_elapsed: 0,
        timer_started: false,
        idle_remaining: IDLE_TIMEOUT_MS,
        pause_player_index: -1,
        queued_pauses: vec![false; n],
        notes: imported.notes,
        spectator_notes: BTreeMap::new(),
        tags: vec![],
        votes: vec![false; n],
        maintenance_applied: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{Value, json};

    fn import(input: &Value) -> Result<Imported> {
        parse(&hanabi_protocol::decode(input)?)
    }

    #[test]
    fn imports_accept_only_the_replay_format() {
        let imported = import(&json!({
            "id": 7,
            "seed": "p2v0s1",
            "actions": [{"type": 5, "target": -1, "value": 4}],
            "notes": [["", "a"], []]
        }))
        .unwrap();
        assert_eq!(imported.game.players.len(), 2);
        assert_eq!(imported.notes[0][1], "a");
        for input in [
            json!({"seed":"p2v0s1","options":{"timeBase":1.5}}),
            json!({"seed":"p2v0s1","source":"another tool"}),
            json!({"seed":"p2v0s1","actions":[{"type":5,"target":-1,"turn":1}]}),
            json!({"seed":"p2v0s1","options":{"tableName":"x"}}),
            json!({"seed":"p2v0s1","players":null}),
            json!({"seed":"p2v0s1","options":{"speedrun":null}}),
            json!({"seed":"p2v0s1","notes":[[null,"a"],[]]}),
        ] {
            assert!(import(&input).is_err(), "{input}");
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
            ("options", json!({"variant":42})),
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
        let variant = hanabi_engine::get_variant("No Variant").unwrap();
        let seeded = hanabi_engine::create_shuffled_deck(variant, seed).unwrap();
        let mut other = seeded.clone();
        let different = (1..other.len()).find(|&i| other[i] != other[0]).unwrap();
        other.swap(0, different);
        let input = |seed: &str, deck: Option<&[Card]>| {
            let mut input = json!({"players":["Alice","Bob"],"seed":seed});
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
