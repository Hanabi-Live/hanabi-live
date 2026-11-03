use crate::{
    game::{Action, Card, Game, Options},
    model::{ExtraOptions, FORMAT, Player, Snapshot},
    store::zero_stats,
};
use anyhow::{Context, Result, ensure};
use chrono::Utc;
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub struct Imported {
    pub game: Game,
    pub notes: Vec<Vec<String>>,
    pub warnings: Vec<String>,
    pub extra: ExtraOptions,
}
pub fn parse(input: &Value) -> Result<Imported> {
    ensure!(input.is_object(), "Invalid game JSON");
    let array = |key: &str, max: usize| -> Result<Vec<Value>> {
        let value = input.get(key).filter(|v| !v.is_null());
        let list = match value {
            None => vec![],
            Some(v) => v.as_array().context("Expected array")?.clone(),
        };
        ensure!(list.len() <= max, "Oversized {key}");
        Ok(list)
    };
    let seed = match input.get("seed").filter(|v| !v.is_null()) {
        None => "",
        Some(v) => v.as_str().context("Invalid seed type")?,
    };
    ensure!(
        seed.len() <= 45 && seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
        "Invalid seed"
    );
    let mut raw_options = input
        .get("options")
        .filter(|v| !v.is_null())
        .cloned()
        .unwrap_or(json!({}));
    let raw = raw_options
        .as_object_mut()
        .context("Invalid import options")?;
    raw.retain(|_, v| !v.is_null());
    let variant_name = match raw.remove("variant") {
        None => "No Variant".into(),
        Some(v) => v.as_str().context("Invalid variant name")?.to_owned(),
    };
    let variant = hanabi_engine::get_variant(&variant_name)?;
    let has_characters = raw.contains_key("detrimentalCharacters");
    ensure!(
        raw.get("timeBase").is_none_or(|v| v.as_i64().is_some()),
        "Replay base time must be an integer"
    );
    let defaults = serde_json::to_value(Options::default())?;
    raw.retain(|k, _| defaults.get(k).is_some());
    raw.insert("variantName".into(), json!(variant_name));
    let mut options: Options = serde_json::from_value(raw_options)?;
    let mut players: Vec<String> = array("players", 6)?
        .into_iter()
        .map(serde_json::from_value)
        .collect::<std::result::Result<_, _>>()?;
    if players.is_empty() {
        let pattern = regex::Regex::new(r"^(?:legacy-\d+-)?p([2-6])v\d+s[-0-9A-Za-z]+$")?;
        let count: usize = pattern
            .captures(seed)
            .context("Provide players when the seed has no player count")?[1]
            .parse()?;
        players = ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"][..count]
            .iter()
            .map(|n| (*n).into())
            .collect();
    }
    ensure!(
        (2..=6).contains(&players.len())
            && players.iter().all(|n| !n.is_empty()
                && n.len() <= 15
                && !n
                    .chars()
                    .any(|c| "`~!@#$%^&*()=+[{]}\\|;:'\",<>/?".contains(c))),
        "Invalid players"
    );
    options.num_players = players.len();
    options.variant_id = Some(variant.id);
    ensure!(
        options.starting_player < players.len(),
        "Invalid starting player"
    );
    let mut deck: Vec<Card> = array("deck", 60)?
        .into_iter()
        .map(|v| -> Result<Card> {
            ensure!(v.is_object(),"Invalid card object");
            Ok(serde_json::from_value(json!({"suitIndex":v.get("suitIndex").filter(|v|!v.is_null()).cloned().unwrap_or(json!(0)),"rank":v.get("rank").filter(|v|!v.is_null()).cloned().unwrap_or(json!(0))}))?)
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
        deck = seeded.clone();
    }
    ensure!(
        deck.len() == hanabi_engine::create_deck(variant).len()
            && deck
                .iter()
                .all(|c| c.suit_index < variant.suits.len() && matches!(c.rank, 1..=5 | 7)),
        "The deck must have {} valid cards in it.",
        hanabi_engine::create_deck(variant).len()
    );
    ensure!(
        seeded.as_ref().is_none_or(|d| *d == deck),
        "The deck does not match the seed"
    );
    let characters: Vec<AssignedCharacter> = array("characters", 6)?
        .into_iter()
        .map(|v|->Result<AssignedCharacter>{ensure!(v.is_object(),"Invalid character object");Ok(serde_json::from_value(json!({"name":v.get("name").filter(|v|!v.is_null()).cloned().unwrap_or(json!("")),"metadata":v.get("metadata").filter(|v|!v.is_null()).cloned().unwrap_or(json!(0))}))?)})
        .collect::<Result<_>>()?;
    ensure!(
        !has_characters || characters.len() == players.len(),
        "The amount of characters must match the number of players"
    );
    let actions: Vec<Action> = array("actions", 512)?
        .into_iter()
        .map(|mut v| -> Result<Action> {
            ensure!(v.is_object(), "Invalid action object");
            for key in ["type", "target", "value"] {
                if v.get(key).is_none_or(Value::is_null) {
                    v[key] = json!(0);
                }
            }
            Ok(serde_json::from_value(
                json!({"type":v["type"],"target":v["target"],"value":v["value"]}),
            )?)
        })
        .collect::<Result<_>>()?;
    for (i, a) in actions.iter().enumerate() {
        ensure!(
            match a.kind {
                0 | 1 => a.target >= 0 && (a.target as usize) < deck.len() && a.value == 0,
                2 =>
                    a.target >= 0
                        && (a.target as usize) < players.len()
                        && a.value >= 0
                        && a.value as usize <= variant.clue_colors.len(),
                3 =>
                    a.target >= 0
                        && (a.target as usize) < players.len()
                        && (1..=5).contains(&a.value),
                4 => a.target >= 0 && (a.target as usize) < players.len(),
                5 => a.target == -1,
                _ => false,
            },
            "Invalid action at index {i}"
        );
    }
    let size = deck.len() + variant.suits.len();
    let raw_notes = array("notes", 6)?;
    ensure!(
        raw_notes.is_empty() || raw_notes.len() == players.len(),
        "Invalid note rows"
    );
    let mut notes = vec![vec![String::new(); size]; players.len()];
    for (i, row) in raw_notes.iter().enumerate() {
        let row = row.as_array().context("Invalid note row")?;
        ensure!(row.len() <= size, "Too many notes");
        for (j, text) in row.iter().enumerate() {
            let text = if text.is_null() {
                ""
            } else {
                text.as_str().context("Invalid note text")?
            };
            ensure!(text.len() <= 65536, "Note too long");
            notes[i][j] = text.to_owned();
        }
    }
    let extra = ExtraOptions {
        custom_seed: (!seed.is_empty()).then(|| seed.into()),
        custom_deck: Some(deck.clone()),
        custom_deck_is_shuffled: false,
        custom_actions: actions.clone(),
        custom_characters: (!characters.is_empty()).then_some(characters.clone()),
        custom_num_players: Some(players.len()),
        ..ExtraOptions::default()
    };
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
        let result = if a.kind < 4 {
            game.apply(active, a)
        } else {
            EndCondition::try_from(a.value)
                .map_err(anyhow::Error::msg)
                .and_then(|c| game.terminate(active, c, a.target, None, None))
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
        extra,
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
                id: i as i32 + 1,
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
        receipts: vec![],
        idle_remaining: 1_800_000,
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
    use sha2::{Digest, Sha256};
    fn hash(v: Value) -> String {
        hex::encode(Sha256::digest(serde_json::to_vec(&v).unwrap()))
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
                std::panic::catch_unwind(|| parse(&input))
                    .expect("untrusted JSON must not panic")
                    .is_err(),
                "{field}"
            );
        }
    }
    #[test]
    fn json_import_replays_every_legacy_go_oracle_trace() {
        let corpus: Vec<Value> = serde_json::from_str(include_str!(
            "../../../server/src/testdata/engine_authority.json"
        ))
        .unwrap();
        for trace in corpus.into_iter().filter(|v| v["live"] != true) {
            let mut options = trace["options"].clone();
            let variant = options
                .as_object_mut()
                .unwrap()
                .remove("variantName")
                .unwrap();
            options["variant"] = variant;
            if options["detrimentalCharacters"] == false {
                options
                    .as_object_mut()
                    .unwrap()
                    .remove("detrimentalCharacters");
            }
            let count = trace["options"]["numPlayers"].as_u64().unwrap() as usize;
            let names = ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"][..count].to_vec();
            let actions = trace["steps"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|s| s["accepted"] == true)
                .map(|s| s["action"].clone())
                .collect::<Vec<_>>();
            let mut input = json!({"players":names,"seed":trace["seed"],"options":options,"characters":trace["characters"],"actions":actions});
            if let Some(deck) = trace.get("deck") {
                input["seed"] = json!("");
                input["deck"] = deck.clone();
                assert!(
                    parse(&input).is_err(),
                    "Shortened engine fixtures must not bypass public import validation"
                );
                continue;
            }
            let final_step = trace["steps"]
                .as_array()
                .unwrap()
                .iter()
                .rfind(|s| s["accepted"] == true)
                .unwrap();
            let after = parse(&input).unwrap();
            assert!(
                after.warnings.is_empty(),
                "{} {:?}",
                trace["name"],
                after.warnings
            );
            input["actions"].as_array_mut().unwrap().pop();
            let before = parse(&input).unwrap();
            assert_eq!(
                hash(json!(after.game.events[before.game.events.len()..])),
                final_step["result"]["events"],
                "{}",
                trace["name"]
            );
        }
    }
}
