use anyhow::{Result, ensure};
pub use hanabi_engine::{AssignedCharacter, DeckCard as Card, Options};
use hanabi_engine::{CompletionTiming, EndCondition, EngineState, GameSetup, Termination};
use hanabi_engine::{PlayerAction, RecordedAction};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use std::ops::Deref;

/// A game: the engine's state, and the log that checkpoints store, from which the engine rebuilds
/// that state.
#[derive(Clone, Debug)]
pub struct Game {
    state: EngineState,
    log: GameLog,
}

/// What a game started from and what happened in it.
#[derive(Clone, Debug)]
struct GameLog {
    setup: GameSetup,
    steps: Vec<GameStep>,
}

/// One change to a game after it starts.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "step",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum GameStep {
    Action {
        actor: usize,
        action: PlayerAction,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timing: Option<CompletionTiming>,
    },
    Termination {
        termination: Termination,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        timing: Option<CompletionTiming>,
    },
}

/// A game as checkpoints store it: its log.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredGameRef<'a> {
    setup: &'a GameSetup,
    steps: &'a [GameStep],
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredGame {
    setup: GameSetup,
    steps: Vec<GameStep>,
}

/// A game's steps, taken out of it while a checkpoint stores the rest of the game.
#[derive(Default)]
pub(crate) struct Steps(Vec<GameStep>);

impl Steps {
    pub(crate) fn len(&self) -> usize {
        self.0.len()
    }
    /// The step at `index`, as JSON.
    pub(crate) fn part(&self, index: usize) -> Result<String> {
        Ok(serde_json::to_string(&self.0[index])?)
    }
}

impl Serialize for Game {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        StoredGameRef {
            setup: &self.log.setup,
            steps: &self.log.steps,
        }
        .serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for Game {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::rebuild(StoredGame::deserialize(deserializer)?)
            .map_err(|error| serde::de::Error::custom(format!("{error:#}")))
    }
}

impl Deref for Game {
    type Target = EngineState;
    fn deref(&self) -> &EngineState {
        &self.state
    }
}
impl Game {
    pub fn create(setup: GameSetup) -> Result<Self> {
        Ok(Self {
            state: hanabi_engine::create_game(setup.clone())?,
            log: GameLog {
                setup,
                steps: vec![],
            },
        })
    }
    /// Replays a stored game through the engine.
    fn rebuild(stored: StoredGame) -> Result<Self> {
        ensure!(
            stored.steps.len() <= hanabi_protocol::MAX_GAME_ACTIONS,
            "Oversized stored game"
        );
        let mut game = Self::create(stored.setup)?;
        for step in stored.steps {
            game.step(step)?;
        }
        Ok(game)
    }
    /// Applies a step to the game. A rejected step changes nothing, as the engine guarantees.
    fn step(&mut self, step: GameStep) -> Result<()> {
        match &step {
            GameStep::Action {
                actor,
                action,
                timing,
            } => {
                hanabi_engine::apply_action(&mut self.state, *actor, action, timing.clone())?;
            }
            GameStep::Termination {
                termination,
                timing,
            } => {
                hanabi_engine::terminate_game(
                    &mut self.state,
                    termination.clone(),
                    timing.clone(),
                )?;
            }
        }
        self.log.steps.push(step);
        Ok(())
    }
    /// Removes the game's steps, for a checkpoint that stores them apart from the rest of the
    /// game. The game's state stays as it is; `put_steps` gives the steps back.
    pub(crate) fn take_steps(&mut self) -> Steps {
        Steps(std::mem::take(&mut self.log.steps))
    }
    /// Gives back the steps that `take_steps` removed.
    pub(crate) fn put_steps(&mut self, steps: Steps) {
        self.log.steps = steps.0;
    }
    /// Plays steps that a checkpoint stored apart from the rest of the game. The game must have
    /// none.
    pub(crate) fn restore_steps(&mut self, steps: &[&str]) -> Result<()> {
        ensure!(self.log.steps.is_empty(), "The game already has steps");
        ensure!(
            steps.len() <= hanabi_protocol::MAX_GAME_ACTIONS,
            "Oversized stored game"
        );
        for step in steps {
            self.step(serde_json::from_str(step)?)?;
        }
        Ok(())
    }
    /// The engine's state, for engine functions that read it.
    pub fn state(&self) -> &EngineState {
        &self.state
    }
    /// The engine's state, for tests that set up a game without playing it.
    #[cfg(test)]
    pub(crate) fn state_mut(&mut self) -> &mut EngineState {
        &mut self.state
    }
    /// A two-player game with this deck, for tests.
    #[cfg(test)]
    pub fn new(deck: Vec<Card>) -> Result<Self> {
        Self::create(GameSetup {
            options: Options::default(),
            player_names: vec!["Alice".into(), "Bob".into()],
            seed: None,
            deck: Some(deck),
            characters: None,
            interpretation: hanabi_engine::Interpretation::Live,
        })
    }
    pub fn apply(&mut self, actor: usize, action: PlayerAction) -> Result<()> {
        self.apply_timed(actor, action, None)
    }
    pub fn apply_timed(
        &mut self,
        actor: usize,
        action: PlayerAction,
        timing: Option<CompletionTiming>,
    ) -> Result<()> {
        self.step(GameStep::Action {
            actor,
            action,
            timing,
        })
    }
    pub fn terminate(
        &mut self,
        actor: usize,
        condition: EndCondition,
        player: Option<usize>,
        votes: Option<Vec<usize>>,
        timing: Option<CompletionTiming>,
    ) -> Result<()> {
        self.step(GameStep::Termination {
            termination: Termination {
                actor_index: actor,
                condition,
                player_index: player,
                votes,
            },
            timing,
        })
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
    /// Creates a game and plays `actions` in turn until the game ends.
    pub fn replay(setup: GameSetup, actions: &[RecordedAction]) -> Result<Self> {
        match Self::replay_valid(setup, actions)? {
            (game, None) => Ok(game),
            (_, Some((_, error))) => Err(error),
        }
    }
    /// Creates a game and plays `actions` in turn until the game ends, or until an action is not
    /// valid. Returns the game, and the position and error of the action that was not valid.
    pub fn replay_valid(
        setup: GameSetup,
        actions: &[RecordedAction],
    ) -> Result<(Self, Option<(usize, anyhow::Error)>)> {
        ensure!(
            actions.len() <= hanabi_protocol::MAX_GAME_ACTIONS,
            "Oversized replay"
        );
        let mut game = Self::create(setup)?;
        for (index, action) in actions.iter().enumerate() {
            if game.end.is_some() {
                break;
            }
            let actor = game.active_player_index;
            let result = match action.turn() {
                Ok(turn) => game.apply(actor, turn),
                Err(end) => game.terminate(
                    actor,
                    end.end_condition,
                    end.player_index.map(hanabi_protocol::PlayerIndex::index),
                    None,
                    None,
                ),
            };
            if let Err(error) = result {
                return Ok((game, Some((index, error))));
            }
        }
        Ok((game, None))
    }
}
#[cfg(test)]
pub fn standard_deck(seed: &str) -> Result<Vec<Card>> {
    Ok(hanabi_engine::create_shuffled_deck(
        hanabi_engine::get_variant(hanabi_protocol::DEFAULT_VARIANT_NAME)?,
        seed,
    ))
}
/// The letter between the variant and the number of a server-made seed. Hand sizes that differ get
/// their own seeds, so that games on the same seed have comparable scores.
const SEED_LETTER: char = 's';
const ONE_EXTRA_CARD_SEED_LETTER: char = 'e';
const ONE_LESS_CARD_SEED_LETTER: char = 'l';
/// Matches the seeds that the server makes, capturing the seed's prefix (such as "p2v0s") and then
/// the player count.
pub const SEED_PATTERN: &str = r"^(p(\d+)v\d+[sel])[-0-9A-Za-z]+$";
/// The seed of a new game without its number, such as "p2v0s".
pub fn seed_prefix(num_players: usize, variant_id: u32, options: &Options) -> String {
    let letter = match (options.one_extra_card, options.one_less_card) {
        (true, false) => ONE_EXTRA_CARD_SEED_LETTER,
        (false, true) => ONE_LESS_CARD_SEED_LETTER,
        _ => SEED_LETTER,
    };
    format!("p{num_players}v{variant_id}{letter}")
}
pub fn seeded_deck(id: i32, seed: &str) -> Result<Value> {
    Ok(serde_json::to_value(hanabi_engine::create_shuffled_deck(
        hanabi_engine::get_variant_by_id(u32::try_from(id)?)?,
        seed,
    ))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn steps_store_turns_in_the_replay_format() {
        let stored = serde_json::json!({"step": "action", "actor": 0, "action": {"type": "play", "order": 4}});
        let step: GameStep = serde_json::from_value(stored.clone()).unwrap();
        assert_eq!(serde_json::to_value(&step).unwrap(), stored);
    }

    #[test]
    fn games_store_their_steps() {
        let mut game = Game::new(standard_deck("p2v0s1").unwrap()).unwrap();
        let active = game.active_player_index;
        let card = game.players[active].hand[0];
        let play = PlayerAction::Play(hanabi_protocol::TargetCard {
            order: hanabi_protocol::CardOrder::new(card).unwrap(),
        });
        game.apply(active, play).unwrap();

        let stored = serde_json::to_value(&game).unwrap();
        assert_eq!(stored["steps"].as_array().unwrap().len(), 1);
        assert!(stored.get("events").is_none());
        let restored: Game = serde_json::from_value(stored.clone()).unwrap();
        assert_eq!(restored.state(), game.state());
        assert_eq!(serde_json::to_value(&restored).unwrap(), stored);
    }

    #[test]
    fn hand_sizes_that_differ_get_their_own_seeds() {
        let seed = |one_extra_card, one_less_card| {
            let options = Options {
                one_extra_card,
                one_less_card,
                ..Options::default()
            };
            format!("{}19", seed_prefix(2, 2, &options))
        };
        let seeds = [
            seed(false, false),
            seed(true, false),
            seed(false, true),
            seed(true, true),
        ];
        assert_eq!(seeds, ["p2v2s19", "p2v2e19", "p2v2l19", "p2v2s19"]);
        for seed in seeds {
            assert_eq!(&regex!(SEED_PATTERN).captures(&seed).unwrap()[2], "2");
        }
    }
}
