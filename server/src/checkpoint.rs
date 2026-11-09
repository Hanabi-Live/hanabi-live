//! How a live table is stored: a head, which is the table's JSON without its growing lists, and
//! parts, which hold those lists one entry at a time. A change then rewrites the head and only the
//! parts that changed, rather than the whole table.
//!
//! A checkpoint written before parts existed keeps these lists in its head and has no parts. It
//! still decodes, and the first save after that moves its lists into parts.

use crate::{model::TableSnapshot, state::MAX_CHECKPOINT_BYTES};
use anyhow::{Context, Result, bail, ensure};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};

/// A list that the head leaves out and the parts hold, one entry per part.
struct List {
    /// The prefix of its parts' keys, such as `chat` in `chat/3`.
    prefix: &'static str,
    /// The JSON pointer to the object that holds the list.
    parent: &'static str,
    /// The list's field in that object.
    field: &'static str,
    /// Whether the list is an array, keyed by position, rather than an object.
    array: bool,
}

const LISTS: [List; 4] = [
    List {
        prefix: "chat",
        parent: "",
        field: "chat",
        array: true,
    },
    List {
        prefix: "step",
        parent: "/phase/snapshot/game",
        field: "steps",
        array: true,
    },
    // Each seat's notes.
    List {
        prefix: "notes",
        parent: "/phase/snapshot",
        field: "notes",
        array: true,
    },
    // Each spectator's notes, by user ID.
    List {
        prefix: "spectatorNotes",
        parent: "/phase/snapshot",
        field: "spectator_notes",
        array: false,
    },
];

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

/// Validates a table and splits it into its head and parts.
pub fn encode(table: &TableSnapshot) -> Result<Encoded> {
    table.validate()?;
    let mut head = serde_json::to_value(table)?;
    let mut parts = BTreeMap::new();
    for list in &LISTS {
        let Some(parent) = head.pointer_mut(list.parent).and_then(Value::as_object_mut) else {
            continue;
        };
        match parent.remove(list.field) {
            Some(Value::Array(entries)) if list.array => {
                for (index, entry) in entries.iter().enumerate() {
                    parts.insert(format!("{}/{index}", list.prefix), entry.to_string());
                }
            }
            Some(Value::Object(entries)) if !list.array => {
                for (key, entry) in &entries {
                    parts.insert(format!("{}/{key}", list.prefix), entry.to_string());
                }
            }
            Some(_) => bail!("Unexpected checkpoint field {}", list.field),
            None => {}
        }
    }
    let head = head.to_string();
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

/// Rebuilds a table from its head and parts.
pub fn decode(head: &str, parts: &[(String, String)]) -> Result<TableSnapshot> {
    ensure!(head.len() <= MAX_CHECKPOINT_BYTES, "Oversized checkpoint");
    let mut value: Value = serde_json::from_str(head)?;
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
    for list in &LISTS {
        let entries = grouped.remove(list.prefix).unwrap_or_default();
        let Some(parent) = value
            .pointer_mut(list.parent)
            .and_then(Value::as_object_mut)
        else {
            ensure!(
                entries.is_empty(),
                "Checkpoint parts {} have no place in the table",
                list.prefix
            );
            continue;
        };
        if parent.contains_key(list.field) {
            // A checkpoint from before parts existed.
            ensure!(
                entries.is_empty(),
                "Checkpoint field {} is stored twice",
                list.field
            );
            continue;
        }
        let rebuilt = if list.array {
            let mut indexed = entries
                .into_iter()
                .map(|(index, part)| Ok((index.parse::<usize>()?, serde_json::from_str(part)?)))
                .collect::<Result<Vec<(usize, Value)>>>()?;
            indexed.sort_unstable_by_key(|(index, _)| *index);
            ensure!(
                indexed
                    .iter()
                    .enumerate()
                    .all(|(position, (index, _))| position == *index),
                "Checkpoint parts {} have a gap",
                list.prefix
            );
            Value::Array(indexed.into_iter().map(|(_, entry)| entry).collect())
        } else {
            Value::Object(
                entries
                    .into_iter()
                    .map(|(key, part)| Ok((key.to_owned(), serde_json::from_str(part)?)))
                    .collect::<Result<Map<String, Value>>>()?,
            )
        };
        parent.insert(list.field.to_owned(), rebuilt);
    }
    ensure!(
        grouped.is_empty(),
        "Unknown checkpoint parts: {:?}",
        grouped.keys().collect::<Vec<_>>()
    );
    TableSnapshot::from_value(value)
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
