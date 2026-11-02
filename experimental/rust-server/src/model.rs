use crate::game::{Game, options};
use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;

pub const FORMAT: &str = "hanabi-live-rust-benchmark-1";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Player {
    pub id: i32,
    pub name: String,
    pub stats: Value,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Receipt {
    pub user: i32,
    pub id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    pub format: String,
    pub table_id: u64,
    pub game_id: i32,
    pub owner: i32,
    pub name: String,
    pub players: [Player; 2],
    pub seed: String,
    pub created: DateTime<Utc>,
    pub started: DateTime<Utc>,
    pub finished: Option<DateTime<Utc>>,
    pub game: Game,
    pub clocks: [i64; 2],
    pub duration: i64,
    pub turn_elapsed: i64,
    pub timer_started: bool,
    pub receipts: Vec<Receipt>,
}

impl Snapshot {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.name.trim().is_empty()
                && self.name.len() <= 45
                && !self.seed.is_empty()
                && self.seed.len() <= 45,
            "Invalid checkpoint name or seed"
        );
        ensure!(
            self.format == FORMAT
                && self.game_id > 0
                && self.table_id > 0
                && self.table_id <= 9_007_199_254_740_991,
            "Incompatible checkpoint"
        );
        ensure!(
            self.players
                .iter()
                .all(|p| p.id > 0 && !p.name.is_empty() && p.name.len() <= 15),
            "Invalid roster"
        );
        ensure!(
            self.players[0].id != self.players[1].id
                && self.players.iter().any(|p| p.id == self.owner),
            "Invalid owner or duplicate players"
        );
        ensure!(self.receipts.len() <= 1024, "Oversized receipt ledger");
        let mut receipts = HashSet::new();
        for receipt in &self.receipts {
            ensure!(
                !receipt.id.is_empty()
                    && receipt.id.len() <= 128
                    && self.players.iter().any(|p| p.id == receipt.user),
                "Invalid receipt"
            );
            ensure!(
                receipts.insert((receipt.user, &receipt.id)),
                "Duplicate receipt"
            );
        }
        ensure!(
            self.finished.is_some() == (self.game.end != 0),
            "Invalid completion timestamp"
        );
        ensure!(
            (0..=9_007_199_254_740_991).contains(&self.duration)
                && (0..=9_007_199_254_740_991).contains(&self.turn_elapsed)
                && self
                    .clocks
                    .iter()
                    .all(|clock| clock.unsigned_abs() <= 9_007_199_254_740_991),
            "Invalid clock state"
        );
        self.game.validate_recovery()
    }

    pub fn remember(&mut self, user: i32, id: Option<&str>) -> Result<()> {
        if let Some(id) = id.filter(|id| !id.is_empty()) {
            ensure!(
                id.len() <= 128 && self.receipts.len() < 1024,
                "Invalid or exhausted request ledger"
            );
            self.receipts.push(Receipt {
                user,
                id: id.into(),
            });
        }
        Ok(())
    }

    pub fn duplicate(&self, user: i32, id: Option<&str>) -> bool {
        id.is_some_and(|id| {
            !id.is_empty() && self.receipts.iter().any(|r| r.user == user && r.id == id)
        })
    }

    pub fn history(&self, count: i64, increment: bool) -> Value {
        let mut names: Vec<_> = self.players.iter().map(|p| p.name.clone()).collect();
        names.sort_by_key(|name| name.to_lowercase());
        json!({"id":self.game_id,"options":options(),"seed":self.seed,"score":self.game.score,
            "numTurns":self.game.turn,"endCondition":self.game.end,"datetimeStarted":self.started,
            "datetimeFinished":self.finished,"numGamesOnThisSeed":count,
            "playerNames":names,"incrementNumGames":increment,"tags":""})
    }
}
