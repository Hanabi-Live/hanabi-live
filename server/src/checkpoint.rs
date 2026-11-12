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
    ("hanabi-live-3", "hanabi-live-4", clues_and_identities),
    ("hanabi-live-4", "hanabi-live-5", time_control),
    ("hanabi-live-5", "hanabi-live-6", server_chat_authors),
    ("hanabi-live-6", "hanabi-live-7", camel_case_variant_id),
    ("hanabi-live-7", "hanabi-live-8", seats_without_users),
    ("hanabi-live-8", "hanabi-live-9", nested_best_scores),
    ("hanabi-live-9", "hanabi-live-10", wire_renames),
    ("hanabi-live-10", "hanabi-live-11", untimed_clocks),
    ("hanabi-live-11", "hanabi-live-12", clue_player_index),
    ("hanabi-live-12", "hanabi-live-13", consistent_wire_names),
    ("hanabi-live-13", "hanabi-live-14", suggested_deals),
    ("hanabi-live-14", "hanabi-live-15", characters_with_names),
    (
        "hanabi-live-15",
        "hanabi-live-16",
        clue_fields_and_morphed_identities,
    ),
    ("hanabi-live-16", "hanabi-live-17", suggested_variant_ids),
    ("hanabi-live-17", "hanabi-live-18", chat_kinds),
    ("hanabi-live-18", "hanabi-live-19", owner_names),
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

/// Format 3 named a turn's clue in its type, such as `{"type":"rankClue","target":1,"rank":3}`,
/// and held the suit and rank of a hypothetical's cards in the event itself.
fn clues_and_identities(head: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    if let Some(Value::Array(actions)) = head.pointer_mut("/extra/customActions") {
        actions.iter_mut().for_each(nest_clue);
    }
    if let Some(Value::Array(events)) = head.pointer_mut("/phase/replay/hypotheticalActions") {
        // A morph can name a suit or a rank alone, so it keeps them apart.
        for event in events
            .iter_mut()
            .filter_map(Value::as_object_mut)
            .filter(|event| event.get("type").is_none_or(|kind| kind != "morph"))
        {
            let suit_index = event.remove("suitIndex");
            let rank = event.remove("rank");
            if let (Some(suit_index), Some(rank)) = (suit_index, rank) {
                event.insert(
                    "identity".into(),
                    serde_json::json!({ "suitIndex": suit_index, "rank": rank }),
                );
            }
        }
    }
    edit_parts(parts, STEP, |step| {
        if let Some(action) = step.get_mut("action") {
            nest_clue(action);
        }
    })
}

/// Format 4 gave a suggested table's options `timed`, `timeBaseSeconds`, and
/// `timePerTurnSeconds`, with 0 for each time of an untimed table.
fn time_control(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        let Some(options) = chat
            .pointer_mut("/message/suggestion/options")
            .and_then(Value::as_object_mut)
        else {
            return;
        };
        let timed = options.remove("timed");
        let base_seconds = options.remove("timeBaseSeconds");
        let per_turn_seconds = options.remove("timePerTurnSeconds");
        if timed == Some(Value::Bool(true)) {
            options.insert(
                "timeControl".into(),
                serde_json::json!({
                    "baseSeconds": base_seconds.unwrap_or_else(|| 0.into()),
                    "perTurnSeconds": per_turn_seconds.unwrap_or_else(|| 0.into()),
                }),
            );
        }
    })
}

/// Format 5 gave the chat that the server wrote the user 0.
fn server_chat_authors(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        if let Some(chat) = chat.as_object_mut()
            && chat.get("user") == Some(&Value::from(0))
        {
            chat.remove("user");
        }
    })
}

/// Format 7 gave each seat of a replay that is not saved a negative user ID: -1 for the first seat,
/// -2 for the second, and so on.
#[expect(
    clippy::unnecessary_wraps,
    reason = "every upgrade step has the `Upgrade` signature"
)]
fn seats_without_users(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    if let Some(Value::Array(players)) = head.pointer_mut("/phase/snapshot/players") {
        for player in players.iter_mut().filter_map(Value::as_object_mut) {
            if player
                .get("id")
                .and_then(Value::as_i64)
                .is_some_and(|id| id < 0)
            {
                player.remove("id");
            }
        }
    }
    Ok(())
}

/// Format 8 held a player's best score, its modifier, and its option flags side by side, with a
/// modifier of 0 and no flags for a player count without a score.
#[expect(
    clippy::unnecessary_wraps,
    reason = "every upgrade step has the `Upgrade` signature"
)]
fn nested_best_scores(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    const BEST_FIELDS: [&str; 7] = [
        "score",
        "modifier",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
    ];
    for path in ["/phase/players", "/phase/snapshot/players"] {
        let Some(Value::Array(players)) = head.pointer_mut(path) else {
            continue;
        };
        for player in players {
            let Some(Value::Array(scores)) = player.pointer_mut("/stats/variant/bestScores") else {
                continue;
            };
            for entry in scores.iter_mut().filter_map(Value::as_object_mut) {
                let best = BEST_FIELDS
                    .iter()
                    .filter_map(|field| Some(((*field).to_owned(), entry.remove(*field)?)))
                    .collect::<Map<_, _>>();
                if best.contains_key("score") {
                    entry.insert("best".into(), Value::Object(best));
                }
            }
        }
    }
    Ok(())
}

/// Format 9 gave a best score its modifier and option flags instead of whether it is modified,
/// named a chat message's time `datetime`, and named a hypothetical turn's number `num`.
fn wire_renames(head: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    const MODIFIER_FIELDS: [&str; 6] = [
        "modifier",
        "deckPlays",
        "emptyClues",
        "oneExtraCard",
        "oneLessCard",
        "allOrNothing",
    ];
    for path in ["/phase/players", "/phase/snapshot/players"] {
        let Some(Value::Array(players)) = head.pointer_mut(path) else {
            continue;
        };
        for player in players {
            let Some(Value::Array(scores)) = player.pointer_mut("/stats/variant/bestScores") else {
                continue;
            };
            for best in scores
                .iter_mut()
                .filter_map(|entry| entry.get_mut("best"))
                .filter_map(Value::as_object_mut)
            {
                if let Some(modifier) = best.get("modifier").and_then(Value::as_i64) {
                    best.insert("modified".into(), (modifier != 0).into());
                }
                for field in MODIFIER_FIELDS {
                    best.remove(field);
                }
            }
        }
    }
    if let Some(Value::Array(events)) = head.pointer_mut("/phase/replay/hypotheticalActions") {
        for event in events
            .iter_mut()
            .filter(|event| event.get("type").is_some_and(|kind| kind == "turn"))
        {
            rename(Some(event), "num", "turn");
        }
    }
    edit_parts(parts, CHAT, |chat| {
        rename(chat.get_mut("message"), "datetime", "sentAt");
    })
}

/// Format 10 gave a game's options `timed`, `timeBase`, and `timePerTurn`, with 0 for each time of
/// an untimed game. It also counted an untimed game's clocks down from 0, so that they held the
/// time taken as a negative number.
fn untimed_clocks(head: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    for path in ["/options", "/phase/snapshot/game/setup/options"] {
        if let Some(options) = head.pointer_mut(path).and_then(Value::as_object_mut)
            && let Some(timed) = options.remove("timed")
        {
            let base = options.remove("timeBase");
            let per_turn = options.remove("timePerTurn");
            let time_control = if timed == Value::Bool(true) {
                serde_json::json!({
                    "baseSeconds": whole_seconds(base)?,
                    "perTurnSeconds": whole_seconds(per_turn)?,
                })
            } else {
                Value::Null
            };
            options.insert("timeControl".into(), time_control);
        }
    }
    if head
        .pointer("/phase/snapshot/game/setup/options/timeControl")
        .is_some_and(Value::is_null)
    {
        if let Some(clocks) = head.pointer_mut("/phase/snapshot/clocks") {
            negate_all(clocks);
        }
        edit_parts(parts, STEP, |step| {
            if let Some(times) = step.pointer_mut("/timing/playerTimes") {
                negate_all(times);
            }
        })?;
    }
    Ok(())
}

/// A time option as a whole number of seconds. Servers before whole-second time bases stored the
/// time base as a number with a fraction, which this drops.
fn whole_seconds(seconds: Option<Value>) -> Result<Value> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "the largest safe integer is exact as a float"
    )]
    const LIMIT: f64 = hanabi_protocol::MAX_SAFE_INTEGER as f64;
    let seconds = seconds.unwrap_or_else(|| 0.into());
    if seconds.is_i64() {
        return Ok(seconds);
    }
    let seconds = seconds
        .as_f64()
        .filter(|seconds| seconds.is_finite() && seconds.abs() <= LIMIT)
        .context("Invalid time option")?;
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the check above bounds the value, and the fraction is dropped on purpose"
    )]
    Ok((seconds as i64).into())
}

/// Negates each integer of an array.
fn negate_all(values: &mut Value) {
    if let Value::Array(values) = values {
        for value in values {
            if let Some(number) = value.as_i64() {
                *value = (-number).into();
            }
        }
    }
}

/// Format 11 named the player who gives a hypothetical's clue `giver`.
#[expect(
    clippy::unnecessary_wraps,
    reason = "every upgrade has the signature of `Upgrade`"
)]
fn clue_player_index(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    if let Some(Value::Array(events)) = head.pointer_mut("/phase/replay/hypotheticalActions") {
        for event in events
            .iter_mut()
            .filter(|event| event.get("type").is_some_and(|kind| kind == "clue"))
        {
            rename(Some(event), "giver", "playerIndex");
        }
    }
    Ok(())
}

/// Format 12 named the player who receives a clue `target`, gave a failed play the type `discard`
/// with `"failed": true` (and other discards `"failed": false`), named a chat message's suggested
/// table `suggestion`, and did not bound a shared replay's efficiency modifier.
fn consistent_wire_names(head: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    let receiver = |clue: &mut Value| {
        if clue.get("type").is_some_and(|kind| kind == "clue") {
            rename(Some(clue), "target", "receiverIndex");
        }
    };
    if let Some(Value::Array(actions)) = head.pointer_mut("/extra/customActions") {
        actions.iter_mut().for_each(receiver);
    }
    if let Some(Value::Array(events)) = head.pointer_mut("/phase/replay/hypotheticalActions") {
        for event in events.iter_mut() {
            receiver(event);
            if let Some(event) = event.as_object_mut()
                && event.get("type").is_some_and(|kind| kind == "discard")
                && event.remove("failed") == Some(Value::Bool(true))
            {
                event.insert("type".into(), "misplay".into());
            }
        }
    }
    if let Some(modifier) = head.pointer_mut("/phase/replay/efficiencyModifier")
        && let Some(value) = modifier.as_i64()
    {
        let limit = i64::from(hanabi_protocol::MAX_EFFICIENCY_MODIFIER);
        *modifier = value.clamp(-limit, limit).into();
    }
    edit_parts(parts, STEP, |step| {
        if let Some(action) = step.get_mut("action") {
            receiver(action);
        }
    })?;
    edit_parts(parts, CHAT, |chat| {
        rename(chat.get_mut("message"), "suggestion", "suggestedSettings");
    })
}

/// Format 13 gave a chat message's suggested table its deal in three fields: `seedSuffix`, or
/// `replayGameId` with an optional `replayTurn`.
fn suggested_deals(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        let Some(settings) = chat
            .pointer_mut("/message/suggestedSettings")
            .and_then(Value::as_object_mut)
        else {
            return;
        };
        let seed = settings.remove("seedSuffix");
        let game = settings.remove("replayGameId");
        let turn = settings.remove("replayTurn");
        let deal = match (game, seed) {
            (Some(game), _) => {
                let mut deal = serde_json::json!({ "type": "replay", "gameId": game });
                if let Some(turn) = turn {
                    deal["turn"] = turn;
                }
                deal
            }
            (None, Some(suffix)) => serde_json::json!({ "type": "seed", "suffix": suffix }),
            (None, None) => return,
        };
        settings.insert("deal".into(), deal);
    })
}

/// Format 14 could list a character without a name for a player who had none. Such a list came from
/// a game without detrimental characters, which ignores it, so it is dropped.
#[expect(
    clippy::unnecessary_wraps,
    reason = "every upgrade step has the `Upgrade` signature"
)]
fn characters_with_names(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    for path in [
        "/extra/customCharacters",
        "/phase/snapshot/game/setup/characters",
    ] {
        if let Some(characters) = head.pointer_mut(path)
            && characters
                .as_array()
                .is_some_and(|list| list.iter().any(|c| c.get("name").is_none()))
        {
            *characters = Value::Null;
        }
    }
    Ok(())
}

/// Format 15 named the color or rank of a clue `value`, and held the suit and rank of a
/// hypothetical's morphed card in the event itself.
fn clue_fields_and_morphed_identities(
    head: &mut Value,
    parts: &mut [(String, String)],
) -> Result<()> {
    if let Some(Value::Array(actions)) = head.pointer_mut("/extra/customActions") {
        actions.iter_mut().for_each(name_clue_field);
    }
    if let Some(Value::Array(events)) = head.pointer_mut("/phase/replay/hypotheticalActions") {
        for event in events.iter_mut() {
            name_clue_field(event);
            if let Some(event) = event.as_object_mut()
                && event.get("type").is_some_and(|kind| kind == "morph")
            {
                let identity = ["suitIndex", "rank"]
                    .into_iter()
                    .filter_map(|field| Some((field.to_owned(), event.remove(field)?)))
                    .collect::<Map<_, _>>();
                event.insert("identity".into(), Value::Object(identity));
            }
        }
    }
    edit_parts(parts, STEP, |step| {
        if let Some(action) = step.get_mut("action") {
            name_clue_field(action);
        }
    })
}

/// Format 16 named the variant of a chat message's suggested table by its name. A suggestion of a
/// variant that the catalog no longer has cannot be applied, so it is dropped.
fn suggested_variant_ids(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        let Some(message) = chat.get_mut("message").and_then(Value::as_object_mut) else {
            return;
        };
        let Some(options) = message
            .get_mut("suggestedSettings")
            .and_then(|settings| settings.get_mut("options"))
            .and_then(Value::as_object_mut)
        else {
            return;
        };
        let Some(name) = options.remove("variantName") else {
            return;
        };
        match name
            .as_str()
            .and_then(|name| hanabi_engine::get_variant(name).ok())
        {
            Some(variant) => {
                options.insert("variantId".into(), variant.id.into());
            }
            None => {
                message.remove("suggestedSettings");
            }
        }
    })
}

/// Format 17 gave a chat message its author's source and name, and a recipient and suggested
/// settings that only some messages had, side by side.
fn chat_kinds(_: &mut Value, parts: &mut [(String, String)]) -> Result<()> {
    edit_parts(parts, CHAT, |chat| {
        let Some(message) = chat.get_mut("message").and_then(Value::as_object_mut) else {
            return;
        };
        let source = message.remove("source");
        let username = message.remove("username");
        let recipient = message.remove("recipient");
        let settings = message.remove("suggestedSettings");
        let mut author = Map::new();
        author.insert("type".into(), source.unwrap_or_else(|| "server".into()));
        if let Some(username) = username {
            author.insert("username".into(), username);
        }
        let kind = match (recipient, settings) {
            (Some(recipient), Some(settings)) => serde_json::json!({
                "type": "suggestion", "recipient": recipient, "settings": settings,
            }),
            (Some(recipient), None) => serde_json::json!({
                "type": "private", "author": author, "recipient": recipient,
            }),
            (None, _) => serde_json::json!({ "type": "public", "author": author }),
        };
        message.insert("kind".into(), kind);
    })
}

/// The key under which `recover` gives a head of format 18 or older its owner's name, which those
/// formats did not keep.
pub const OWNER_NAME: &str = "ownerName";

/// The owner's ID of a head of format 18 or older, which does not keep the owner's name.
pub fn unnamed_owner(head: &str) -> Option<UserId> {
    let head: Value = serde_json::from_str(head).ok()?;
    head["owner"]
        .as_i64()
        .and_then(|id| i32::try_from(id).ok())
        .map(UserId)
}

/// Adds the owner's name to a head of format 18 or older, for `owner_names`.
pub fn name_owner(head: &str, name: &str) -> Result<String> {
    let mut head: Value = serde_json::from_str(head)?;
    head[OWNER_NAME] = name.into();
    Ok(serde_json::to_string(&head)?)
}

/// Format 18 kept only the owner's ID. The name comes from `OWNER_NAME`, which `recover` adds from
/// the database, or else from the owner's seat.
fn owner_names(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    let id = head["owner"].clone();
    let seated = ["/phase/players", "/phase/snapshot/players"]
        .into_iter()
        .filter_map(|path| head.pointer(path).and_then(Value::as_array))
        .flatten()
        .find(|player| player["id"] == id)
        .map(|player| player["name"].clone());
    let name = head
        .as_object_mut()
        .and_then(|head| head.remove(OWNER_NAME))
        .or(seated)
        .filter(Value::is_string)
        .context("The owner has no name")?;
    head["owner"] = serde_json::json!({ "userId": id, "username": name });
    Ok(())
}

/// Renames the `value` of a turn's or an event's clue to the field of its type.
fn name_clue_field(holder: &mut Value) {
    let Some(clue) = holder.get_mut("clue") else {
        return;
    };
    let field = match clue["type"].as_str() {
        Some("color") => "color",
        Some("rank") => "rank",
        _ => return,
    };
    rename(Some(clue), "value", field);
}

/// Rewrites a clue that a turn of format 3 gives.
fn nest_clue(action: &mut Value) {
    let (kind, field) = match action["type"].as_str() {
        Some("colorClue") => ("color", "colorIndex"),
        Some("rankClue") => ("rank", "rank"),
        _ => return,
    };
    *action = serde_json::json!({
        "type": "clue",
        "target": action["target"],
        "clue": { "type": kind, "value": action[field] },
    });
}

/// Format 6 spelled the "ID" of a game's `variantID` option in capitals.
#[expect(
    clippy::unnecessary_wraps,
    reason = "every upgrade has the signature of `Upgrade`"
)]
fn camel_case_variant_id(head: &mut Value, _: &mut [(String, String)]) -> Result<()> {
    rename_everywhere(head, "variantID", "variantId");
    Ok(())
}

/// Renames a field of every object in a value.
fn rename_everywhere(value: &mut Value, from: &str, to: &str) {
    match value {
        Value::Object(object) => {
            if let Some(field) = object.remove(from) {
                object.insert(to.to_owned(), field);
            }
            object
                .values_mut()
                .for_each(|value| rename_everywhere(value, from, to));
        }
        Value::Array(items) => items
            .iter_mut()
            .for_each(|value| rename_everywhere(value, from, to)),
        _ => {}
    }
}

/// What a save changes among a table's parts.
#[derive(Default)]
pub struct PartChanges {
    /// New or changed parts, by key.
    pub written: Vec<(String, String)>,
    pub removed: Vec<String>,
}
