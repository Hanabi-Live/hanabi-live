//! How a live table is stored: a head, which is the table's JSON with its growing lists left empty,
//! and parts, which hold those lists one entry at a time. A save writes the head and only the parts
//! that changed: the new chat messages and game steps, and the notes that differ.

use crate::{
    game::Steps,
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

/// What a save writes: the table's head, and the changes to its parts.
pub struct Encoded {
    pub head: String,
    pub changes: PartChanges,
}

/// A digest of a part's value, to tell which parts changed since the last save.
pub type PartDigest = [u8; 32];

pub fn digest(value: &str) -> PartDigest {
    Sha256::digest(value.as_bytes()).into()
}

fn key(prefix: &str, entry: impl std::fmt::Display) -> String {
    format!("{prefix}/{entry}")
}

/// What the database holds of a table's parts, which tells a save what to write. Chat and steps
/// only grow, so a save writes the entries after the saved ones; notes can change anywhere, so a
/// save compares each seat's and spectator's notes with what it saved.
#[derive(Clone, Debug, Default)]
pub struct SavedParts {
    chat: Tail,
    steps: Tail,
    /// The digests of the saved notes, by key.
    notes: HashMap<String, PartDigest>,
    /// The bytes of the saved notes' keys and values.
    notes_bytes: usize,
}

/// The saved entries of a list that only grows.
#[derive(Clone, Debug, Default)]
struct Tail {
    count: usize,
    /// The digest of the last saved entry, to tell that the list still continues it.
    last: Option<PartDigest>,
    /// The bytes of the saved entries' keys and values.
    bytes: usize,
}

impl SavedParts {
    /// What the database holds, from the parts that it loaded.
    pub fn of(parts: &[(String, String)]) -> Self {
        let mut saved = Self::default();
        let mut lists: HashMap<&str, BTreeMap<usize, &str>> = HashMap::new();
        for (key, value) in parts {
            let Some((prefix, entry)) = key.split_once('/') else {
                continue;
            };
            if prefix == NOTES || prefix == SPECTATOR_NOTES {
                saved.notes.insert(key.clone(), digest(value));
                saved.notes_bytes += key.len() + value.len();
            } else if let Ok(index) = entry.parse() {
                lists.entry(prefix).or_default().insert(index, value);
            }
        }
        for (prefix, tail) in [(CHAT, &mut saved.chat), (STEP, &mut saved.steps)] {
            let entries = lists.remove(prefix).unwrap_or_default();
            *tail = Tail {
                count: entries.len(),
                last: entries.values().next_back().map(|value| digest(value)),
                bytes: entries
                    .iter()
                    .map(|(index, value)| key(prefix, index).len() + value.len())
                    .sum(),
            };
        }
        saved
    }
}

/// Adds to `changes` the entries of a list that only grows, of length `len`, that the database
/// does not hold. A list that does not continue the saved one is rewritten. Returns what the
/// database holds after the save.
fn grow(
    prefix: &str,
    len: usize,
    saved: &Tail,
    part: impl Fn(usize) -> Result<String>,
    changes: &mut PartChanges,
) -> Result<Tail> {
    let continues = len >= saved.count
        && match saved.count.checked_sub(1) {
            None => true,
            Some(last) => Some(digest(&part(last)?)) == saved.last,
        };
    let mut tail = if continues {
        saved.clone()
    } else {
        changes
            .removed
            .extend((len..saved.count).map(|index| key(prefix, index)));
        Tail::default()
    };
    for index in tail.count..len {
        let (key, value) = (key(prefix, index), part(index)?);
        tail.bytes += key.len() + value.len();
        tail.last = Some(digest(&value));
        changes.written.push((key, value));
    }
    tail.count = len;
    Ok(tail)
}

/// Validates a table, and encodes what saving it over `saved` writes. Returns what the database
/// holds after the save. The table's lists are taken out while its head is encoded, then put back.
pub fn encode(table: &mut TableSnapshot, saved: &SavedParts) -> Result<(Encoded, SavedParts)> {
    table.validate()?;
    let chat = std::mem::take(&mut table.chat);
    let game = table.game_mut().map(|snapshot| {
        (
            snapshot.game.take_steps(),
            std::mem::take(&mut snapshot.notes),
            std::mem::take(&mut snapshot.spectator_notes),
        )
    });
    let encoded = encode_parts(table, &chat, game.as_ref(), saved);
    table.chat = chat;
    if let (Some(snapshot), Some((steps, notes, spectator_notes))) = (table.game_mut(), game) {
        snapshot.game.put_steps(steps);
        snapshot.notes = notes;
        snapshot.spectator_notes = spectator_notes;
    }
    encoded
}

/// A game's lists that `encode` takes out of it: its steps, each seat's notes, and each
/// spectator's notes.
type GameLists = (Steps, Vec<Vec<String>>, BTreeMap<UserId, NoteOwner>);

/// Encodes a table whose lists `encode` took out of it.
fn encode_parts(
    head: &TableSnapshot,
    chat: &[TableChat],
    game: Option<&GameLists>,
    saved: &SavedParts,
) -> Result<(Encoded, SavedParts)> {
    let head = serde_json::to_string(head)?;
    let mut changes = PartChanges::default();
    let chat = grow(
        CHAT,
        chat.len(),
        &saved.chat,
        |index| Ok(serde_json::to_string(&chat[index])?),
        &mut changes,
    )?;
    let no_steps = Steps::default();
    let (steps, notes, spectator_notes) = match game {
        Some((steps, notes, spectator_notes)) => (steps, notes.as_slice(), Some(spectator_notes)),
        None => (&no_steps, &[][..], None),
    };
    let steps = grow(
        STEP,
        steps.len(),
        &saved.steps,
        |index| steps.part(index),
        &mut changes,
    )?;
    let mut note_parts = Vec::new();
    for (seat, notes) in notes.iter().enumerate() {
        note_parts.push((key(NOTES, seat), serde_json::to_string(notes)?));
    }
    for (user, owner) in spectator_notes.into_iter().flatten() {
        note_parts.push((key(SPECTATOR_NOTES, user.0), serde_json::to_string(owner)?));
    }
    let mut after = SavedParts {
        chat,
        steps,
        ..SavedParts::default()
    };
    for (key, value) in note_parts {
        let part = digest(&value);
        after.notes_bytes += key.len() + value.len();
        if saved.notes.get(&key) != Some(&part) {
            changes.written.push((key.clone(), value));
        }
        after.notes.insert(key, part);
    }
    changes.removed.extend(
        saved
            .notes
            .keys()
            .filter(|key| !after.notes.contains_key(*key))
            .cloned(),
    );
    let size = head.len() + after.chat.bytes + after.steps.bytes + after.notes_bytes;
    ensure!(
        size <= MAX_CHECKPOINT_BYTES,
        "Checkpoint exceeds the durable state limit"
    );
    Ok((Encoded { head, changes }, after))
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
