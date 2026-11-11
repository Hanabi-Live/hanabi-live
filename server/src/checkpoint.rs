//! How a live table is stored: a head, which is the table's JSON without its game's start and with
//! its growing lists left empty, and parts, which hold the rest. The game's start (its players and
//! its setup) does not change once the game begins, so it has a part of its own; the lists have one
//! part per entry. A save writes the head and only the parts that changed: the new chat messages
//! and game steps, and the notes and game start that differ.

use crate::{
    game::Steps,
    model::{FORMAT, NoteOwner, TableChat, TableSnapshot},
    state::MAX_CHECKPOINT_BYTES,
};
use anyhow::{Context, Result, bail, ensure};
use hanabi_protocol::UserId;
use serde_json::{Map, Value};
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
/// The key of the part that holds a game's start: its players and its setup.
const GAME_START: &str = "game/start";
/// Where the head of a table with a game holds the game's start: the game's players, and the setup
/// that the game began from. The start part holds them by their last key.
const START_PATHS: [&[&str]; 2] = [
    &["phase", "snapshot", "players"],
    &["phase", "snapshot", "game", "setup"],
];

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
/// only grow, so a save writes the entries after the saved ones. Notes and the game's start are
/// replaced as a whole, so a save compares each with what it saved.
#[derive(Clone, Debug, Default)]
pub struct SavedParts {
    chat: Tail,
    steps: Tail,
    /// The digests of the saved parts that a save replaces as a whole, by key.
    replaced: HashMap<String, PartDigest>,
    /// The bytes of those parts' keys and values.
    replaced_bytes: usize,
}

/// Whether a part is replaced as a whole when it changes, rather than one entry of a list.
fn replaced(key: &str, prefix: &str) -> bool {
    key == GAME_START || prefix == NOTES || prefix == SPECTATOR_NOTES
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
            if replaced(key, prefix) {
                saved.replaced.insert(key.clone(), digest(value));
                saved.replaced_bytes += key.len() + value.len();
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

/// Removes a game's start from a table's head, and returns it as the start part's value. A table
/// without a game has none.
fn take_start(head: &mut Value) -> Result<Option<String>> {
    if head.pointer("/phase/snapshot").is_none() {
        return Ok(None);
    }
    let mut start = Map::new();
    for path in START_PATHS {
        let (name, parent) = path.split_last().context("Empty game start path")?;
        let removed = head
            .pointer_mut(&format!("/{}", parent.join("/")))
            .and_then(Value::as_object_mut)
            .and_then(|object| object.remove(*name))
            .with_context(|| format!("The checkpoint head has no game {name}"))?;
        start.insert((*name).to_owned(), removed);
    }
    Ok(Some(serde_json::to_string(&start)?))
}

/// Puts a game's start back into a table's head.
fn put_start(head: &mut Value, start: &str) -> Result<()> {
    let mut start: Map<String, Value> = serde_json::from_str(start)?;
    for path in START_PATHS {
        let (name, parent) = path.split_last().context("Empty game start path")?;
        let object = head
            .pointer_mut(&format!("/{}", parent.join("/")))
            .and_then(Value::as_object_mut)
            .context("A checkpoint has a game start but no game")?;
        ensure!(
            !object.contains_key(*name),
            "The checkpoint head holds the game {name}"
        );
        let value = start
            .remove(*name)
            .with_context(|| format!("The game start has no {name}"))?;
        object.insert((*name).to_owned(), value);
    }
    ensure!(start.is_empty(), "The game start has unknown fields");
    Ok(())
}

/// Encodes a table whose lists `encode` took out of it.
fn encode_parts(
    head: &TableSnapshot,
    chat: &[TableChat],
    game: Option<&GameLists>,
    saved: &SavedParts,
) -> Result<(Encoded, SavedParts)> {
    let mut head = serde_json::to_value(head)?;
    let start = take_start(&mut head)?;
    let head = serde_json::to_string(&head)?;
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
    let mut replaced_parts = Vec::new();
    replaced_parts.extend(start.map(|start| (GAME_START.to_owned(), start)));
    for (seat, notes) in notes.iter().enumerate() {
        replaced_parts.push((key(NOTES, seat), serde_json::to_string(notes)?));
    }
    for (user, owner) in spectator_notes.into_iter().flatten() {
        replaced_parts.push((key(SPECTATOR_NOTES, user.0), serde_json::to_string(owner)?));
    }
    let mut after = SavedParts {
        chat,
        steps,
        ..SavedParts::default()
    };
    for (key, value) in replaced_parts {
        let part = digest(&value);
        after.replaced_bytes += key.len() + value.len();
        if saved.replaced.get(&key) != Some(&part) {
            changes.written.push((key.clone(), value));
        }
        after.replaced.insert(key, part);
    }
    changes.removed.extend(
        saved
            .replaced
            .keys()
            .filter(|key| !after.replaced.contains_key(*key))
            .cloned(),
    );
    let size = head.len() + after.chat.bytes + after.steps.bytes + after.replaced_bytes;
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

/// Rebuilds a table from its head and parts. A head that still holds its game's start, as servers
/// wrote before the start had a part of its own, is read as it is.
pub fn decode(head: &str, parts: &[(String, String)]) -> Result<TableSnapshot> {
    ensure!(head.len() <= MAX_CHECKPOINT_BYTES, "Oversized checkpoint");
    let mut head: Value = serde_json::from_str(head)?;
    if let Some((_, start)) = parts.iter().find(|(key, _)| key == GAME_START) {
        put_start(&mut head, start)?;
    }
    let upgraded;
    let parts = if head["format"] == FORMAT {
        parts
    } else {
        let mut owned = parts.to_vec();
        upgrade(&mut head, &mut owned)?;
        upgraded = owned;
        &upgraded
    };
    let mut table: TableSnapshot = serde_json::from_value(head)?;
    let mut grouped: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
    for (key, part) in parts.iter().filter(|(key, _)| key != GAME_START) {
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

/// Rewrites a table's head and parts in one format into the next one.
type Upgrade = fn(&mut Value, &mut [(String, String)]) -> Result<()>;

/// The formats that older servers wrote, each with the format after it and the upgrade between
/// them. A graceful restart keeps the live tables that the deployed server saved, so remove a step
/// only once no deployed server writes its format.
const UPGRADES: &[(&str, &str, Upgrade)] = &[
    ("hanabi-live-1", "hanabi-live-2", camel_case_ids),
    ("hanabi-live-2", "hanabi-live-3", seed_suffix_and_turn),
];

/// Rewrites a table that an older server saved, one format at a time, into the current format.
/// `head` holds the game's start.
fn upgrade(head: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    while head["format"] != FORMAT {
        let (_, next, step) = UPGRADES
            .iter()
            .find(|(format, ..)| head["format"] == *format)
            .with_context(|| format!("Unknown checkpoint format {}", head["format"]))?;
        step(head, parts)?;
        head["format"] = (*next).into();
        if let Some(snapshot) = head.pointer_mut("/phase/snapshot") {
            snapshot["format"] = (*next).into();
        }
    }
    Ok(())
}

/// Applies `edit` to each of the parts with this prefix.
fn edit_parts(
    parts: &mut [(String, String)],
    prefix: &str,
    edit: impl Fn(&mut Value),
) -> Result<()> {
    for (key, part) in parts {
        if key
            .split_once('/')
            .is_some_and(|(found, _)| found == prefix)
        {
            let mut value: Value = serde_json::from_str(part)?;
            edit(&mut value);
            *part = serde_json::to_string(&value)?;
        }
    }
    Ok(())
}

/// Renames a field of an object, if it has it.
fn rename(object: Option<&mut Value>, from: &str, to: &str) {
    if let Some(object) = object.and_then(Value::as_object_mut)
        && let Some(value) = object.remove(from)
    {
        object.insert(to.to_owned(), value);
    }
}

/// Format 1 spelled the "ID" of the wire's ID fields in capitals, such as `tableID`.
fn camel_case_ids(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        rename(chat.get_mut("message"), "tableID", "tableId");
        rename(chat.get_mut("message"), "chatID", "chatId");
        rename(
            chat.pointer_mut("/message/suggestion"),
            "replayGameID",
            "replayGameId",
        );
    })
}

/// Format 2 named a suggested table's seed suffix `seed`, and counted its replay turn from 1.
fn seed_suffix_and_turn(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        let suggestion = chat.pointer_mut("/message/suggestion");
        rename(suggestion, "seed", "seedSuffix");
        if let Some(turn) = chat.pointer_mut("/message/suggestion/replayTurn")
            && let Some(counted) = turn.as_u64()
        {
            *turn = counted.saturating_sub(1).into();
        }
    })
}

/// What a save changes among a table's parts.
#[derive(Default)]
pub struct PartChanges {
    /// New or changed parts, by key.
    pub written: Vec<(String, String)>,
    pub removed: Vec<String>,
}
