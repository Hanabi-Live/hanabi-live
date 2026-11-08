use anyhow::{Result, ensure};
pub use hanabi_engine::{AssignedCharacter, DeckCard as Card, EngineEvent as Event, Options};
use hanabi_engine::{
    CompletionTiming, EndCondition, EngineState, GameSetup, Interpretation, PlayerAction,
    Recipient, Termination,
};
use hanabi_protocol::ReplayAction;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ops::{Deref, DerefMut};

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
    pub fn apply(&mut self, actor: usize, action: ReplayAction) -> Result<()> {
        self.apply_timed(actor, &action, None)
    }
    pub fn apply_timed(
        &mut self,
        actor: usize,
        action: &ReplayAction,
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
                player_index: hanabi_engine::int(i),
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
    pub fn replay(setup: GameSetup, actions: Vec<ReplayAction>) -> Result<Self> {
        ensure!(
            actions.len() <= hanabi_protocol::MAX_GAME_ACTIONS,
            "Oversized replay"
        );
        let mut game = Self::create(setup)?;
        for action in actions {
            if game.end_condition != EndCondition::InProgress {
                break;
            }
            if action.kind.is_game_over() {
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
        !deck.is_empty() && deck.len() <= hanabi_protocol::MAX_DECK_SIZE,
        "Invalid custom deck length"
    );
    let mut bytes = vec![0x80 + u8::try_from(deck.len())?];
    for c in deck {
        ensure!(
            c.suit_index < 6 && matches!(c.rank, 1..=5 | 7),
            "Invalid card"
        );
        bytes.push(u8::try_from(c.suit_index * 8 + usize::try_from(c.rank)?)?);
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
