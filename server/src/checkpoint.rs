//! How a live table is stored: a head, which is the table's JSON with its growing lists left empty,
//! and parts, which hold those lists one entry at a time. A change then rewrites the head and only
//! the parts that changed, rather than the whole table.

use crate::{
    model::{NoteOwner, TableChat, TableSnapshot},
    state::MAX_CHECKPOINT_BYTES,
};
use anyhow::{Context, Result, bail, ensure};
use hanabi_protocol::UserId;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};

/// The prefix of the parts that hold the table's chat, by position, such as `chat/3`.
const CHAT: &str = "chat";
/// The prefix of the parts that hold the game's steps, by position.
const STEP: &str = "step";
/// The prefix of the parts that hold each seat's notes, by seat.
const NOTES: &str = "notes";
/// The prefix of the parts that hold each spectator's notes, by user ID.
const SPECTATOR_NOTES: &str = "spectatorNotes";

/// A table as the database stores it.
pub struct Encoded {
    pub head: String,
    /// The parts by key, as JSON.
    pub parts: BTreeMap<String, String>,
}

/// A digest of a part's value, to tell which parts changed since the last save.
pub type PartDigest = [u8; 32];

pub fn digest(value: &str) -> PartDigest {
    Sha256::digest(value.as_bytes()).into()
}

fn key(prefix: &str, entry: impl std::fmt::Display) -> String {
    format!("{prefix}/{entry}")
}

/// Validates a table and splits it into its head and parts.
pub fn encode(table: &TableSnapshot) -> Result<Encoded> {
    table.validate()?;
    let mut head = table.clone();
    let mut parts = BTreeMap::new();
    for (index, chat) in std::mem::take(&mut head.chat).iter().enumerate() {
        parts.insert(key(CHAT, index), serde_json::to_string(chat)?);
    }
    if let Some(snapshot) = head.game_mut() {
        for (index, step) in snapshot.game.take_steps()?.into_iter().enumerate() {
            parts.insert(key(STEP, index), step);
        }
        for (seat, notes) in std::mem::take(&mut snapshot.notes).iter().enumerate() {
            parts.insert(key(NOTES, seat), serde_json::to_string(notes)?);
        }
        for (user, owner) in &std::mem::take(&mut snapshot.spectator_notes) {
            parts.insert(key(SPECTATOR_NOTES, user.0), serde_json::to_string(owner)?);
        }
    }
    let head = serde_json::to_string(&head)?;
    let size = head.len()
        + parts
            .iter()
            .map(|(key, value)| key.len() + value.len())
            .sum::<usize>();
    ensure!(
        size <= MAX_CHECKPOINT_BYTES,
        "Checkpoint exceeds the durable state limit"
    );
    Ok(Encoded { head, parts })
}

/// The entries of a list that parts hold by position, in order.
fn positional<'a>(prefix: &str, entries: Vec<(&str, &'a str)>) -> Result<Vec<&'a str>> {
    let mut indexed = entries
        .into_iter()
        .map(|(index, part)| Ok((index.parse::<usize>()?, part)))
        .collect::<Result<Vec<_>>>()?;
    indexed.sort_unstable_by_key(|(index, _)| *index);
    ensure!(
        indexed
            .iter()
            .enumerate()
            .all(|(position, (index, _))| position == *index),
        "Checkpoint parts {prefix} have a gap"
    );
    Ok(indexed.into_iter().map(|(_, part)| part).collect())
}

/// Rebuilds a table from its head and parts.
pub fn decode(head: &str, parts: &[(String, String)]) -> Result<TableSnapshot> {
    ensure!(head.len() <= MAX_CHECKPOINT_BYTES, "Oversized checkpoint");
    let mut table: TableSnapshot = serde_json::from_str(head)?;
    let mut grouped: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
    for (key, part) in parts {
        let (prefix, entry) = key
            .split_once('/')
            .with_context(|| format!("Invalid checkpoint part {key}"))?;
        grouped
            .entry(prefix)
            .or_default()
            .push((entry, part.as_str()));
    }
    let mut take = |prefix| grouped.remove(prefix).unwrap_or_default();
    ensure!(table.chat.is_empty(), "The checkpoint head holds chat");
    table.chat = positional(CHAT, take(CHAT))?
        .into_iter()
        .map(serde_json::from_str::<TableChat>)
        .collect::<Result<_, _>>()?;
    let (steps, notes, spectator_notes) = (take(STEP), take(NOTES), take(SPECTATOR_NOTES));
    if let Some(snapshot) = table.game_mut() {
        ensure!(
            snapshot.notes.is_empty() && snapshot.spectator_notes.is_empty(),
            "The checkpoint head holds notes"
        );
        snapshot.game.restore_steps(&positional(STEP, steps)?)?;
        snapshot.notes = positional(NOTES, notes)?
            .into_iter()
            .map(serde_json::from_str)
            .collect::<Result<_, _>>()?;
        snapshot.spectator_notes = spectator_notes
            .into_iter()
            .map(|(user, part)| {
                Ok((
                    UserId(user.parse()?),
                    serde_json::from_str::<NoteOwner>(part)?,
                ))
            })
            .collect::<Result<_>>()?;
    } else if !(steps.is_empty() && notes.is_empty() && spectator_notes.is_empty()) {
        bail!("A pregame checkpoint has game parts");
    }
    ensure!(
        grouped.is_empty(),
        "Unknown checkpoint parts: {:?}",
        grouped.keys().collect::<Vec<_>>()
    );
    table.validate()?;
    Ok(table)
}

/// What a save changes among a table's parts.
#[derive(Default)]
pub struct PartChanges {
    /// New or changed parts, by key.
    pub written: Vec<(String, String)>,
    pub removed: Vec<String>,
}

/// The parts of `encoded` that differ from the saved parts, whose digests are `saved`, and the
/// digests of the parts once `encoded` is saved.
pub fn changes(
    saved: &HashMap<String, PartDigest>,
    encoded: &Encoded,
) -> (PartChanges, HashMap<String, PartDigest>) {
    let digests = encoded
        .parts
        .iter()
        .map(|(key, value)| (key.clone(), digest(value)))
        .collect::<HashMap<_, _>>();
    let changes = PartChanges {
        written: encoded
            .parts
            .iter()
            .filter(|(key, _)| saved.get(*key) != digests.get(*key))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
        removed: saved
            .keys()
            .filter(|key| !encoded.parts.contains_key(*key))
            .cloned()
            .collect(),
    };
    (changes, digests)
}
