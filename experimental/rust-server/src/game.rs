use anyhow::{Result, ensure};
pub use hanabi_engine::{AssignedCharacter, DeckCard as Card, EngineEvent as Event, Options};
use hanabi_engine::{
    CompletionTiming, EndCondition, EngineState, GameSetup, Interpretation, PlayerAction,
    Recipient, Termination,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ops::{Deref, DerefMut};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    #[serde(rename = "type")]
    pub kind: u8,
    pub target: i32,
    #[serde(default)]
    pub value: i32,
}
impl From<&Action> for PlayerAction {
    fn from(a: &Action) -> Self {
        Self {
            action_type: i32::from(a.kind),
            target: a.target,
            value: a.value,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Game(pub EngineState);
impl Deref for Game {
    type Target = EngineState;
    fn deref(&self) -> &EngineState {
        &self.0
    }
}
impl DerefMut for Game {
    fn deref_mut(&mut self) -> &mut EngineState {
        &mut self.0
    }
}
impl Game {
    pub fn create(setup: GameSetup) -> Result<Self> {
        Ok(Self(hanabi_engine::create_game(setup)?.state))
    }
    pub fn new(deck: Vec<Card>) -> Result<Self> {
        Self::create(GameSetup {
            options: Options::default(),
            player_names: vec!["Alice".into(), "Bob".into()],
            seed: "JSON".into(),
            deck: Some(deck),
            characters: None,
            interpretation: Interpretation::Live,
        })
    }
    pub fn apply(&mut self, actor: usize, action: Action) -> Result<()> {
        self.apply_timed(actor, &action, None)
    }
    pub fn apply_timed(
        &mut self,
        actor: usize,
        action: &Action,
        timing: Option<CompletionTiming>,
    ) -> Result<()> {
        self.0 =
            hanabi_engine::apply_action(&self.0, actor, &PlayerAction::from(action), timing)?.state;
        Ok(())
    }
    pub fn terminate(
        &mut self,
        actor: usize,
        condition: EndCondition,
        player: i32,
        votes: Option<Vec<usize>>,
        timing: Option<CompletionTiming>,
    ) -> Result<()> {
        self.0 = hanabi_engine::terminate_game(
            &self.0,
            Termination {
                actor_index: actor,
                condition,
                player_index: player,
                votes,
            },
            timing,
        )?
        .state;
        Ok(())
    }
    pub fn projected(&self, seat: Option<usize>, from: usize) -> Vec<Event> {
        let recipient = seat.map_or(
            Recipient::Spectator {
                shadowing_player_index: None,
            },
            |i| Recipient::Player {
                player_index: i as i32,
            },
        );
        hanabi_engine::events_for_recipient(&self.0, recipient, Some(&self.events[from..]))
            .expect("validated actor recipient")
    }
    pub fn validate_recovery(&self) -> Result<()> {
        hanabi_engine::validate_engine_state(&self.0)
    }
    pub fn identities(&self) -> Vec<Card> {
        self.deck
            .iter()
            .map(|c| Card {
                suit_index: c.suit_index,
                rank: c.rank,
            })
            .collect()
    }
    pub fn replay(setup: GameSetup, actions: Vec<Action>) -> Result<Self> {
        ensure!(actions.len() <= 512, "Oversized replay");
        let mut game = Self::create(setup)?;
        for action in actions {
            ensure!(action.kind <= 5, "Invalid historical action type");
            if game.end_condition != EndCondition::InProgress {
                break;
            }
            if action.kind >= 4 {
                let condition = EndCondition::try_from(action.value).map_err(anyhow::Error::msg)?;
                game.terminate(
                    game.active_player_index,
                    condition,
                    action.target,
                    None,
                    None,
                )?;
            } else {
                game.apply(game.active_player_index, action)?;
            }
        }
        Ok(game)
    }
}
pub fn unshuffled_deck() -> Vec<Card> {
    hanabi_engine::create_deck(hanabi_engine::get_variant("No Variant").expect("catalog"))
}
pub fn standard_deck(seed: &str) -> Result<Vec<Card>> {
    hanabi_engine::create_shuffled_deck(hanabi_engine::get_variant("No Variant")?, seed)
}
pub fn encode_deck(deck: &[Card]) -> Result<Vec<u8>> {
    ensure!(
        !deck.is_empty() && deck.len() <= 60,
        "Invalid custom deck length"
    );
    let mut bytes = vec![0x80 + deck.len() as u8];
    for c in deck {
        ensure!(
            c.suit_index < 6 && matches!(c.rank, 1..=5 | 7),
            "Invalid card"
        );
        bytes.push((c.suit_index * 8 + c.rank as usize) as u8);
    }
    Ok(bytes)
}
pub fn decode_deck(bytes: &[u8]) -> Result<Vec<Card>> {
    ensure!(
        bytes.len() >= 2 && bytes.len() <= 61 && usize::from(bytes[0]) == 0x80 + bytes.len() - 1,
        "Invalid stored deck"
    );
    let cards = bytes[1..]
        .iter()
        .map(|v| Card {
            suit_index: usize::from(v / 8),
            rank: i32::from(v % 8),
        })
        .collect::<Vec<_>>();
    encode_deck(&cards)?;
    Ok(cards)
}
pub fn options() -> Value {
    serde_json::to_value(Options {
        variant_id: Some(0),
        ..Options::default()
    })
    .expect("options")
}
pub fn seeded_deck(id: i32, seed: &str) -> Result<Value> {
    Ok(serde_json::to_value(hanabi_engine::create_shuffled_deck(
        hanabi_engine::get_variant_by_id(u32::try_from(id)?)?,
        seed,
    )?)?)
}
pub fn deck_size(id: i32) -> Result<usize> {
    Ok(hanabi_engine::create_deck(hanabi_engine::get_variant_by_id(u32::try_from(id)?)?).len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use sha2::{Digest, Sha256};
    fn hash(value: Value) -> String {
        hex::encode(Sha256::digest(serde_json::to_vec(&value).unwrap()))
    }
    #[test]
    fn integrated_adapter_preserves_every_go_rule_and_recipient_trace() {
        let corpus: Vec<Value> = serde_json::from_str(include_str!(
            "../../../server/src/testdata/engine_authority.json"
        ))
        .unwrap();
        for trace in corpus {
            let options: Options = serde_json::from_value(trace["options"].clone()).unwrap();
            let names = ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"]
                [..options.num_players]
                .iter()
                .map(|n| (*n).into())
                .collect();
            let mut game = Game::create(GameSetup {
                options,
                player_names: names,
                seed: trace["seed"].as_str().unwrap().into(),
                deck: trace
                    .get("deck")
                    .map(|v| serde_json::from_value(v.clone()).unwrap()),
                characters: serde_json::from_value(trace["characters"].clone()).unwrap(),
                interpretation: if trace["live"] == true {
                    Interpretation::Live
                } else {
                    Interpretation::LegacyReplay
                },
            })
            .unwrap();
            assert_eq!(hash(json!(game.events)), trace["initial"]["events"]);
            for step in trace["steps"].as_array().unwrap() {
                let before = game.clone();
                let from = game.events.len();
                let result = game.apply(
                    game.active_player_index,
                    serde_json::from_value(step["action"].clone()).unwrap(),
                );
                if step["accepted"] == true {
                    result.unwrap();
                } else {
                    assert!(result.is_err());
                    assert_eq!(game, before);
                }
                assert_eq!(
                    hash(json!(game.events[from..])),
                    step["result"]["events"],
                    "{}",
                    trace["name"]
                );
                for (i, seat) in [Some(0), Some(1), None, Some(0)].into_iter().enumerate() {
                    assert_eq!(
                        hash(json!(game.projected(seat, from))),
                        step["result"]["visibility"][i],
                        "{}",
                        trace["name"]
                    );
                }
            }
            game.validate_recovery().unwrap();
        }
    }
}
