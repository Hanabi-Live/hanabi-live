use super::chat::server_chat;
use crate::{
    game::Options,
    model::{
        ExtraOptions, FORMAT, MAX_TABLE_NAME_LENGTH, Phase, ReplayState, Snapshot, TableSnapshot,
        engine_options, small, wire_options,
    },
    store::Store,
    transport::Session,
};
use anyhow::{Context, Result, bail, ensure};
use chrono::Utc;
use hanabi_protocol::{Chat, MAX_SEED_LENGTH, MIN_PLAYERS, NO_VALUE, ReplayAction};
use std::{collections::BTreeMap, fmt::Write as _};

/// The longest table password, in bytes.
const MAX_TABLE_PASSWORD_BYTES: usize = 1024;

/// Whether an untimed game, or a timed game within the clock limits.
/// Clears the clock of an untimed or speedrun game and the hand-size options when both are set,
/// then checks that a timed game is within the clock limits.
pub(super) fn normalize_options(options: &mut Options) -> Result<()> {
    if options.speedrun || !options.timed {
        options.timed = false;
        options.time_base = 0.0;
        options.time_per_turn = 0;
    }
    if options.one_extra_card && options.one_less_card {
        options.one_extra_card = false;
        options.one_less_card = false;
    }
    ensure!(
        !options.timed
            || (options.time_base > 0.0
                && options.time_base <= f64::from(hanabi_protocol::MAX_TIME_BASE_SECONDS)
                && (1..=hanabi_protocol::MAX_TIME_PER_TURN_SECONDS)
                    .contains(&options.time_per_turn)),
        "Invalid timed options"
    );
    Ok(())
}

pub(super) fn validate_table_name(name: &str) -> Result<()> {
    ensure!(
        name.chars().all(|c| c.is_alphanumeric()
            || unicode_normalization::char::is_combining_mark(c)
            || " _!#$'()+,-.:;=?@".contains(c)),
        "Invalid table name"
    );
    Ok(())
}

/// Reads a requested seed: blank deals the next seed that none of the players have played.
pub(super) fn requested_seed(seed: Option<&str>) -> Result<String> {
    let seed = seed.unwrap_or_default().trim();
    ensure!(
        seed.len() <= MAX_SEED_LENGTH,
        "Seeds cannot be longer than {MAX_SEED_LENGTH} characters"
    );
    ensure!(
        seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
        "Seeds can only contain letters, numbers, and hyphens"
    );
    Ok(seed.into())
}

/// The seed after a requested one, counting up its trailing number: "game-9" becomes "game-10",
/// "007" becomes "008", and "game" becomes "game1". Blank stays blank.
pub(super) fn next_requested_seed(seed: &str) -> Result<String> {
    if seed.is_empty() {
        return Ok(String::new());
    }
    let split = seed
        .rfind(|c: char| !c.is_ascii_digit())
        .map_or(0, |i| i + 1);
    let (prefix, number) = seed.split_at(split);
    let next = if number.is_empty() {
        format!("{seed}1")
    } else {
        format!(
            "{prefix}{:0width$}",
            number
                .parse::<u64>()?
                .checked_add(1)
                .context("Seed suffix exhausted")?,
            width = number.len()
        )
    };
    requested_seed(Some(&next))
}

/// Reads the options that a table's name and requested seed set. A `!replay` name also replaces
/// `options` with the replayed game's options.
pub(super) async fn special_game_options(
    store: &Store,
    name: &str,
    seed: String,
    table_id: u64,
    user: i32,
    options: &mut Options,
) -> Result<ExtraOptions> {
    let mut extra = ExtraOptions {
        set_seed_suffix: seed,
        ..ExtraOptions::default()
    };
    if !name.starts_with('!') {
        return Ok(extra);
    }
    let parts = name.split_whitespace().collect::<Vec<_>>();
    match parts.first().copied() {
        Some("!replay") => {
            ensure!(
                (2..=3).contains(&parts.len()),
                "Expected !replay [game ID] [turn]"
            );
            ensure!(
                extra.set_seed_suffix.is_empty(),
                "A replay keeps its game's seed"
            );
            let historical = store.historical(parts[1].parse()?, table_id, user).await?;
            let turn = if parts.len() == 3 {
                parts[2]
                    .parse::<usize>()?
                    .checked_sub(1)
                    .context("Turn must be positive")?
            } else {
                0
            };
            ensure!(
                usize::try_from(historical.game.turn).is_ok_and(|limit| turn < limit),
                "Replay turn exceeds game"
            );
            *options = historical.game.options.clone();
            extra.custom_seed = Some(historical.seed);
            extra.custom_num_players = Some(options.num_players);
            extra.set_replay = true;
            extra.set_replay_turn = turn;
            extra.custom_characters = Some(
                historical
                    .game
                    .players
                    .iter()
                    .map(|p| hanabi_engine::AssignedCharacter {
                        name: if p.character.is_empty() {
                            "n/a".into()
                        } else {
                            p.character.clone()
                        },
                        metadata: p.assigned_metadata().unwrap_or(NO_VALUE),
                    })
                    .collect(),
            );
            extra.custom_actions = historical
                .game
                .actions
                .iter()
                .map(|a| ReplayAction {
                    kind: a.action_type,
                    target: a.target,
                    value: a.value,
                })
                .collect();
        }
        _ => bail!("Unknown special game prefix"),
    }
    Ok(extra)
}
/// A table's requested seed as the wire carries it.
pub(super) fn wire_seed(seed: &str) -> Option<String> {
    (!seed.is_empty()).then(|| seed.into())
}
/// A table's options as the lobby and its players see them.
pub(super) fn table_options(table: &TableSnapshot) -> hanabi_protocol::GameOptions {
    hanabi_protocol::GameOptions {
        seed: wire_seed(&table.extra.set_seed_suffix),
        ..wire_options(&table.options)
    }
}
/// A private message to a table's owner, with a button that applies the suggested options.
pub(super) fn options_suggestion(
    id: u64,
    owner: &str,
    options: &Options,
    name: &str,
    max_players: usize,
    seed: &str,
) -> Chat {
    Chat {
        recipient: Some(owner.into()),
        suggested_options: Some(hanabi_protocol::GameOptions {
            table_name: Some(name.into()),
            max_players: Some(small(max_players)),
            seed: wire_seed(seed),
            ..wire_options(options)
        }),
        ..server_chat(
            id,
            "<span class=\"cp\"><button class=\"new-options\">click to apply the suggestion</button></span>",
        )
    }
}
#[expect(
    clippy::float_cmp,
    reason = "any change to the time setting is reported"
)]
pub(super) fn option_changes(
    table: &TableSnapshot,
    options: &Options,
    name: &str,
    max_players: usize,
    seed: &str,
) -> String {
    let current = &table.options;
    let mut changes = String::new();
    let mut add = |label: &str, value: &str| {
        write!(
            changes,
            "<span class=\"cp\">{label}: <b>{}</b></span>",
            crate::accounts::escape_html(value)
        )
        .expect("writing to a string cannot fail");
    };
    if name != table.name {
        add("Table Name", name);
    }
    if options.variant_name != current.variant_name {
        add("Variant", &options.variant_name);
    }
    if options.timed {
        if !current.timed
            || options.time_base != current.time_base
            || options.time_per_turn != current.time_per_turn
        {
            add(
                "Timed",
                &format!("{} / {}", options.time_base, options.time_per_turn),
            );
        }
    } else if current.timed {
        add("Timed", "No");
    }
    if seed != table.extra.set_seed_suffix {
        add("Seed", if seed.is_empty() { "Any" } else { seed });
    }
    if max_players != table.max_players {
        add("Max Players", &max_players.to_string());
        if max_players < table.players().len() {
            add("Warning", "Players above the new limit will be removed.");
        }
    }
    for (label, proposed, previous) in [
        ("Speedrun", options.speedrun, current.speedrun),
        ("Bottom-Deck", options.deck_plays, current.deck_plays),
        ("Empty Clues", options.empty_clues, current.empty_clues),
        (
            "One Extra Card",
            options.one_extra_card,
            current.one_extra_card,
        ),
        (
            "One Less Card",
            options.one_less_card,
            current.one_less_card,
        ),
        (
            "All or Nothing",
            options.all_or_nothing,
            current.all_or_nothing,
        ),
        (
            "Detrimental Characters",
            options.detrimental_characters,
            current.detrimental_characters,
        ),
    ] {
        if proposed != previous {
            add(label, if proposed { "Yes" } else { "No" });
        }
    }
    changes
}
pub(super) fn replay_table(
    mut snapshot: Snapshot,
    shared: bool,
    spoiler_free: bool,
    owner: i32,
    owner_name: &str,
) -> TableSnapshot {
    let id = snapshot.table_id;
    let options = snapshot.game.options.clone();
    for (index, player) in snapshot.players.iter_mut().enumerate() {
        player.id = crate::model::placeholder_player_id(index);
    }
    let name = format!(
        "{} replay for {}",
        if shared { "Shared" } else { "Solo" },
        if snapshot.game_id == 0 {
            format!(
                "{owner_name}{} JSON game",
                if owner_name.ends_with('s') { "'" } else { "'s" }
            )
        } else {
            format!("game #{}", snapshot.game_id)
        }
    );
    TableSnapshot {
        format: FORMAT.into(),
        id,
        name,
        owner,
        visible: shared,
        max_players: snapshot.players.len(),
        password_hash: None,
        extra: ExtraOptions {
            no_write_to_database: true,
            custom_seed: Some(snapshot.seed.clone()),
            ..ExtraOptions::default()
        },
        created: Utc::now(),
        options,
        phase: Phase::Replay {
            snapshot: Box::new(snapshot),
            replay: ReplayState {
                leader: owner,
                segment: 0,
                efficiency_modifier: 0,
                hypothetical: false,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
                spoiler_free,
                restart_declined: vec![],
            },
        },
        chat: vec![],
        chat_archived: 0,
        shadows: BTreeMap::new(),
        pending_spawn: None,
        retire_after_spawn: false,
        pending_tag: None,
    }
}
/// A request to create a table or a replay, decoded from its wire contract.
pub(super) enum Creation {
    Table(hanabi_protocol::TableCreateRequest),
    Replay(hanabi_protocol::ReplayCreateRequest),
}
pub(super) async fn prepare_table(
    store: &Store,
    session: &Session,
    creation: Creation,
) -> Result<(TableSnapshot, i64, Vec<String>)> {
    ensure!(session.active(), "Stale session");
    let id = store.allocate_table().await?;
    let result = async {
        let r = match creation {
            Creation::Table(r) => r,
            Creation::Replay(r) => {
                ensure!(
                    r.password.is_empty(),
                    "You cannot create a replay with a password."
                );
                let shared = r.visibility == hanabi_protocol::ReplayVisibility::Shared;
                ensure!(
                    shared || !r.spoiler_free,
                    "Only a shared replay can be a spoiler-free review."
                );
                let mut warnings = vec![];
                let mut custom_seed = None;
                let snapshot = if r.source == hanabi_protocol::ReplaySource::Json {
                    let imported = super::replay_helpers::parse(
                        r.game_json.as_ref().context("Missing game JSON")?,
                    )?;
                    warnings.clone_from(&imported.warnings);
                    custom_seed = Some(imported.custom_seed.clone());
                    super::replay_helpers::snapshot(imported, id, session.user)
                } else {
                    store
                        .historical(
                            r.database_id.context("Missing databaseID")?,
                            id,
                            session.user,
                        )
                        .await?
                };
                let mut table = replay_table(
                    snapshot,
                    shared,
                    r.spoiler_free,
                    session.user,
                    &session.name,
                );
                if let Some(seed) = custom_seed {
                    table.extra.custom_seed = seed;
                }
                let revision = store.save(&table, 0).await?;
                return Ok((table, revision, warnings));
            }
        };
        let mut name = crate::accounts::truncate_to_max_bytes(r.name.trim(), MAX_TABLE_NAME_LENGTH)
            .trim_end()
            .to_owned();
        if name.is_empty() {
            name = format!(
                "{}{}",
                session.name,
                hanabi_protocol::DEFAULT_TABLE_NAME_SUFFIX
            );
        }
        validate_table_name(&name)?;
        let mut options = engine_options(&r.options);
        normalize_options(&mut options)?;
        let extra = special_game_options(
            store,
            &name,
            requested_seed(r.options.seed.as_deref())?,
            id,
            session.user,
            &mut options,
        )
        .await?;
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        let player = store
            .player_for_variant(session.user, session.name.clone(), variant.id)
            .await?;
        let max_players = usize::try_from(r.max_players)
            .ok()
            .filter(|n| hanabi_protocol::is_player_count(*n))
            .unwrap_or(usize::from(hanabi_protocol::DEFAULT_MAX_PLAYERS))
            .max(extra.custom_num_players.unwrap_or(MIN_PLAYERS));
        let password = r.password;
        let password_hash = if password.is_empty() {
            None
        } else {
            ensure!(
                password.len() <= MAX_TABLE_PASSWORD_BYTES,
                "Passwords cannot be longer than {MAX_TABLE_PASSWORD_BYTES} bytes"
            );
            Some(crate::accounts::hash_password(&session.ip, password).await?)
        };
        ensure!(session.active(), "Creator disconnected during preparation");
        let table = TableSnapshot {
            format: FORMAT.into(),
            id,
            name,
            owner: session.user,
            visible: true,
            options,
            max_players,
            password_hash,
            extra,
            created: Utc::now(),
            phase: Phase::Pregame {
                players: vec![player],
                automatic_start: None,
                countdown: None,
                kicked: vec![],
            },
            chat: vec![],
            chat_archived: 0,
            shadows: BTreeMap::new(),
            pending_spawn: None,
            retire_after_spawn: false,
            pending_tag: None,
        };
        let revision = store.save(&table, 0).await?;
        Ok((table, revision, vec![]))
    }
    .await;
    if result.is_err() {
        let _ = store.remove(id, 0).await;
    }
    result
}
