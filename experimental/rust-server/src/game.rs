use crate::random::{GoRandom, seed_hash};
use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Card {
    pub suit_index: u8,
    pub rank: u8,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Action {
    #[serde(rename = "type")]
    pub kind: u8,
    pub target: i32,
    #[serde(default)]
    pub value: i32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Event {
    Draw {
        player_index: usize,
        order: usize,
        suit_index: i8,
        rank: i8,
    },
    Play {
        player_index: usize,
        order: usize,
        suit_index: i8,
        rank: i8,
    },
    Discard {
        player_index: usize,
        order: usize,
        suit_index: i8,
        rank: i8,
        failed: bool,
    },
    Clue {
        clue: Clue,
        giver: usize,
        target: usize,
        list: Vec<usize>,
        turn: u16,
    },
    Strike {
        num: u8,
        turn: u16,
        order: usize,
    },
    Status {
        clues: u8,
        score: u8,
        max_score: u8,
    },
    GameOver {
        end_condition: u8,
        player_index: i8,
        votes: Option<Vec<usize>>,
    },
    Turn {
        num: u16,
        current_player_index: i8,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Clue {
    #[serde(rename = "type")]
    kind: u8,
    value: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Game {
    pub deck: Vec<Card>,
    pub hands: [Vec<usize>; 2],
    pub drawn: usize,
    pub stacks: [u8; 5],
    pub discarded: Vec<bool>,
    pub played: Vec<bool>,
    pub cannot_play: Vec<bool>,
    pub touched: Vec<bool>,
    pub clues: u8,
    pub score: u8,
    pub max_score: u8,
    pub strikes: u8,
    pub turn: u16,
    pub active: usize,
    pub end: u8,
    pub end_turn: Option<u16>,
    pub actions: Vec<Action>,
    pub events: Vec<Event>,
}

pub fn standard_deck(seed: &str) -> Result<Vec<Card>> {
    let mut deck = unshuffled_deck();
    GoRandom::new(seed_hash(seed)?).shuffle(&mut deck);
    Ok(deck)
}

pub fn unshuffled_deck() -> Vec<Card> {
    let mut deck = Vec::with_capacity(50);
    for suit in 0..5 {
        for (rank, copies) in [(1, 3), (2, 2), (3, 2), (4, 2), (5, 1)] {
            for _ in 0..copies {
                deck.push(Card {
                    suit_index: suit,
                    rank,
                });
            }
        }
    }
    deck
}

pub fn encode_deck(deck: &[Card]) -> Result<Vec<u8>> {
    ensure!(
        deck.len() == 50,
        "Only standard 50-card decks are supported"
    );
    let mut encoded = vec![178];
    for card in deck {
        ensure!(
            card.suit_index < 5 && (1..=5).contains(&card.rank),
            "Invalid card"
        );
        encoded.push(card.suit_index * 8 + card.rank);
    }
    Ok(encoded)
}

pub fn decode_deck(encoded: &[u8]) -> Result<Vec<Card>> {
    ensure!(
        encoded.len() == 51 && encoded[0] == 178,
        "Invalid stored deck"
    );
    let cards: Vec<_> = encoded[1..]
        .iter()
        .map(|value| Card {
            suit_index: value / 8,
            rank: value % 8,
        })
        .collect();
    encode_deck(&cards)?;
    Ok(cards)
}

impl Game {
    pub fn new(deck: Vec<Card>) -> Result<Self> {
        encode_deck(&deck)?;
        let mut game = Self {
            deck,
            hands: [Vec::new(), Vec::new()],
            drawn: 0,
            stacks: [0; 5],
            discarded: vec![false; 50],
            played: vec![false; 50],
            cannot_play: vec![false; 50],
            touched: vec![false; 50],
            clues: 8,
            score: 0,
            max_score: 25,
            strikes: 0,
            turn: 0,
            active: 0,
            end: 0,
            end_turn: None,
            actions: Vec::new(),
            events: Vec::new(),
        };
        for seat in 0..2 {
            for _ in 0..5 {
                game.draw(seat);
            }
        }
        Ok(game)
    }

    fn draw(&mut self, seat: usize) {
        if self.drawn == self.deck.len() {
            return;
        }
        let order = self.drawn;
        let card = &self.deck[order];
        self.hands[seat].push(order);
        self.events.push(Event::Draw {
            player_index: seat,
            order,
            suit_index: card.suit_index as i8,
            rank: card.rank as i8,
        });
        self.drawn += 1;
        if self.drawn == self.deck.len() {
            self.end_turn = Some(self.turn + 3);
        }
    }

    fn available(&self, suit: usize, rank: u8) -> bool {
        self.deck.iter().enumerate().any(|(i, card)| {
            usize::from(card.suit_index) == suit
                && card.rank == rank
                && !self.discarded[i]
                && !self.played[i]
                && !self.cannot_play[i]
        })
    }

    fn maximum(&self) -> u8 {
        let mut total = 0;
        for suit in 0..5 {
            let mut maximum = self.stacks[suit];
            for rank in self.stacks[suit] + 1..=5 {
                if !self.available(suit, rank) {
                    break;
                }
                maximum = rank;
            }
            total += maximum;
        }
        total
    }

    pub fn apply(&mut self, actor: usize, action: Action) -> Result<()> {
        ensure!(
            self.end == 0 && self.actions.len() < 512,
            "The game is not available"
        );
        ensure!(actor < 2 && actor == self.active, "It is not your turn");
        ensure!(action.kind <= 3, "Unsupported action");
        let target = usize::try_from(action.target)?;
        if action.kind <= 1 {
            ensure!(
                self.hands[actor].contains(&target),
                "That card is not in your hand"
            );
            ensure!(
                action.kind != 1 || self.clues < 8,
                "Cannot discard at eight clues"
            );
        } else {
            ensure!(
                target < 2 && target != actor && self.clues > 0,
                "Invalid clue target or clue count"
            );
            ensure!(
                if action.kind == 2 {
                    (0..5).contains(&action.value)
                } else {
                    (1..=5).contains(&action.value)
                },
                "Invalid clue value"
            );
            ensure!(
                self.hands[target].iter().any(|order| {
                    let card = &self.deck[*order];
                    i32::from(if action.kind == 2 {
                        card.suit_index
                    } else {
                        card.rank
                    }) == action.value
                }),
                "Empty clues are not supported"
            );
        }
        if action.kind <= 1 {
            let slot = self.hands[actor]
                .iter()
                .position(|order| *order == target)
                .ok_or_else(|| anyhow::anyhow!("Validated card disappeared"))?;
            self.hands[actor].remove(slot);
            let card = &self.deck[target];
            let suit = usize::from(card.suit_index);
            let failed = action.kind == 0 && self.stacks[suit] + 1 != card.rank;
            self.actions.push(Action {
                kind: action.kind,
                target: action.target,
                value: 0,
            });
            if failed {
                self.strikes += 1;
                self.events.push(Event::Strike {
                    num: self.strikes,
                    turn: self.turn,
                    order: target,
                });
            }
            if action.kind == 1 || failed {
                self.discarded[target] = true;
                if !failed {
                    self.clues = (self.clues + 1).min(8);
                }
                self.events.push(Event::Discard {
                    player_index: actor,
                    order: target,
                    suit_index: suit as i8,
                    rank: card.rank as i8,
                    failed,
                });
            } else {
                self.played[target] = true;
                self.stacks[suit] = card.rank;
                self.score += 1;
                if card.rank == 5 {
                    self.clues = (self.clues + 1).min(8);
                }
                self.events.push(Event::Play {
                    player_index: actor,
                    order: target,
                    suit_index: suit as i8,
                    rank: card.rank as i8,
                });
            }
            self.max_score = self.max_score.min(self.maximum());
            self.draw(actor);
        } else {
            let touched: Vec<_> = self.hands[target]
                .iter()
                .copied()
                .filter(|order| {
                    let card = &self.deck[*order];
                    i32::from(if action.kind == 2 {
                        card.suit_index
                    } else {
                        card.rank
                    }) == action.value
                })
                .collect();
            for order in &touched {
                self.touched[*order] = true;
            }
            self.clues -= 1;
            self.events.push(Event::Clue {
                clue: Clue {
                    kind: action.kind - 2,
                    value: action.value,
                },
                giver: actor,
                target,
                list: touched,
                turn: self.turn,
            });
            self.actions.push(action);
        }
        self.events.push(Event::Status {
            clues: self.clues,
            score: self.score,
            max_score: self.max_score,
        });
        if self.end_turn.is_some_and(|end| end != self.turn + 3) {
            for order in &self.hands[actor] {
                self.cannot_play[*order] = true;
            }
        }
        self.turn += 1;
        self.active = (self.active + 1) % 2;
        if self.strikes == 3 {
            self.end = 2;
        } else if self.end_turn == Some(self.turn)
            || self.score == self.max_score
            || !(0..5).any(|suit| self.available(suit, self.stacks[suit] + 1))
        {
            self.end = 1;
        }
        if self.end != 0 {
            self.events.push(Event::GameOver {
                end_condition: self.end,
                player_index: -1,
                votes: None,
            });
        }
        self.events.push(Event::Turn {
            num: self.turn,
            current_player_index: if self.end == 0 { self.active as i8 } else { -1 },
        });
        if self.end > 1 {
            self.score = 0;
        }
        Ok(())
    }

    pub fn projected(&self, seat: Option<usize>, from: usize) -> Vec<Event> {
        assert!(seat.is_none_or(|seat| seat < 2), "Invalid game recipient");
        self.events[from..]
            .iter()
            .map(|event| {
                let mut value = event.clone();
                if let Event::Draw {
                    player_index,
                    rank,
                    suit_index,
                    ..
                } = &mut value
                    && seat == Some(*player_index)
                {
                    *rank = -1;
                    *suit_index = -1;
                }
                value
            })
            .collect()
    }

    pub fn validate_recovery(&self) -> Result<()> {
        ensure!(self.actions.len() <= 512, "Oversized action history");
        let mut rebuilt = Self::new(self.deck.clone())?;
        for action in &self.actions {
            rebuilt.apply(rebuilt.active, action.clone())?;
        }
        ensure!(
            &rebuilt == self,
            "Recovery state does not match its authoritative action history"
        );
        Ok(())
    }

    pub fn replay(deck: Vec<Card>, actions: Vec<Action>) -> Result<Self> {
        let mut game = Self::new(deck)?;
        ensure!(actions.len() <= 512, "Oversized replay");
        for action in actions {
            if action.kind > 3 {
                bail!("This PoC supports historical standard play/discard/clue games only");
            }
            game.apply(game.active, action)?;
        }
        Ok(game)
    }
}

pub fn options() -> Value {
    json!({"numPlayers":2,"startingPlayer":0,"variantName":"No Variant","variantID":0,
        "timed":false,"timeBase":0,"timePerTurn":0,"speedrun":false,"cardCycle":false,
        "deckPlays":false,"emptyClues":false,"oneExtraCard":false,"oneLessCard":false,
        "allOrNothing":false,"detrimentalCharacters":false})
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn digest(value: &Value) -> String {
        format!("{:x}", Sha256::digest(serde_json::to_vec(value).unwrap()))
    }

    fn check_projection(game: &Game, point: &Value, from: usize) {
        for (index, seat) in [Some(0), Some(1), None, Some(0)].into_iter().enumerate() {
            assert_eq!(
                digest(&json!(game.projected(seat, from))),
                point["visibility"][index].as_str().unwrap()
            );
        }
    }

    #[test]
    fn standard_rules_match_go_authoritative_events() {
        let corpus: Value = serde_json::from_str(include_str!(
            "../../../server/src/testdata/engine_authority.json"
        ))
        .unwrap();
        let trace = corpus
            .as_array()
            .unwrap()
            .iter()
            .find(|trace| trace["name"] == "standard/benchmark")
            .unwrap();
        let mut game = Game::new(standard_deck(trace["seed"].as_str().unwrap()).unwrap()).unwrap();
        assert_eq!(
            digest(&json!(game.events)),
            trace["initial"]["events"].as_str().unwrap()
        );
        check_projection(&game, &trace["initial"], 0);
        for step in trace["steps"].as_array().unwrap() {
            let before = game.clone();
            let result = game.apply(
                game.active,
                serde_json::from_value(step["action"].clone()).unwrap(),
            );
            if step["accepted"] == true {
                result.unwrap();
                assert_eq!(
                    digest(&json!(game.events[before.events.len()..])),
                    step["result"]["events"].as_str().unwrap()
                );
                check_projection(&game, &step["result"], before.events.len());
            } else {
                assert!(result.is_err());
                assert_eq!(game, before);
            }
        }
        game.validate_recovery().unwrap();
    }

    #[test]
    fn invalid_moves_and_corrupt_recovery_are_rejected_without_leaking_draws() {
        let mut game = Game::new(standard_deck("p2v0s1").unwrap()).unwrap();
        let initial = game.clone();
        assert!(
            game.apply(
                1,
                Action {
                    kind: 0,
                    target: 5,
                    value: 0
                }
            )
            .is_err()
        );
        assert!(
            game.apply(
                0,
                Action {
                    kind: 1,
                    target: 0,
                    value: 0
                }
            )
            .is_err()
        );
        assert_eq!(game, initial);
        for event in game.projected(Some(0), 0) {
            if let Event::Draw {
                player_index: 0,
                rank,
                ..
            } = event
            {
                assert_eq!(rank, -1);
            }
        }
        game.score = 25;
        assert!(game.validate_recovery().is_err());
        assert!(decode_deck(&[178]).is_err());
    }
}
