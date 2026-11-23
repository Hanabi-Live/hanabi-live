use super::chat::table_notice;
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::Options,
    model::{
        ExtraOptions, FORMAT, Phase, ReplayState, Snapshot, TableSnapshot, engine_options,
        num_players, wire_options,
    },
    store::{Saved, Store},
    transport::Session,
};
use hanabi_protocol::TableId;
use hanabi_protocol::{MAX_SEED_LENGTH, MAX_TABLE_NAME_LENGTH, TableSettingsSuggestion, Turn};
use std::{collections::BTreeMap, fmt::Write as _};
use time::OffsetDateTime;

/// The longest table password, in bytes.
const MAX_TABLE_PASSWORD_BYTES: usize = 1024;

/// Clears the clock of a speedrun game and the hand-size options when both are set, then checks
/// that a timed game is within the clock limits.
pub(super) fn normalize_options(options: &mut Options) -> CommandResult<()> {
    if options.speedrun {
        options.time_control = None;
    }
    if options.one_extra_card && options.one_less_card {
        options.one_extra_card = false;
        options.one_less_card = false;
    }
    ensure_or_reject!(
        options.time_control.is_none_or(|time| {
            time.base_seconds.get() >= 1 && time.per_turn_seconds.get() >= 1
        }),
        "Invalid timed options."
    );
    Ok(())
}

/// Reads a requested table name: trimmed, cut to the longest name, and checked.
pub(super) fn table_name(requested: &str) -> CommandResult<String> {
    let name = crate::accounts::truncate_to_max_chars(requested.trim(), MAX_TABLE_NAME_LENGTH)
        .trim_end()
        .to_owned();
    ensure_or_reject!(!name.is_empty(), "Table names cannot be blank.");
    validate_table_name(&name)?;
    Ok(name)
}

fn validate_table_name(name: &str) -> CommandResult<()> {
    ensure_or_reject!(
        name.chars().all(|c| c.is_alphanumeric()
            || unicode_normalization::char::is_combining_mark(c)
            || " _!#$'()+,-.:;=?@".contains(c)),
        "Invalid table name."
    );
    Ok(())
}

/// Reads a requested seed: blank deals the next seed that none of the players have played.
pub(super) fn requested_seed(seed: Option<&str>) -> CommandResult<Option<String>> {
    let seed = seed.unwrap_or_default().trim();
    ensure_or_reject!(
        seed.chars().count() <= MAX_SEED_LENGTH,
        "Seeds cannot be longer than {MAX_SEED_LENGTH} characters."
    );
    ensure_or_reject!(
        crate::model::is_valid_seed(seed),
        "Seeds can only contain letters, numbers, and hyphens."
    );
    Ok((!seed.is_empty()).then(|| seed.into()))
}

/// The seed after a requested one, counting up its trailing number: "game-9" becomes "game-10",
/// "007" becomes "008", and "game" becomes "game1". No requested seed stays none.
pub(super) fn next_requested_seed(seed: Option<&str>) -> CommandResult<Option<String>> {
    let Some(seed) = seed else {
        return Ok(None);
    };
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
                .parse::<u64>()
                .ok()
                .and_then(|number| number.checked_add(1))
                .or_reject("Seed suffix exhausted.")?,
            width = number.len()
        )
    };
    requested_seed(Some(&next))
}

/// Reads the custom seed that a table requests.
pub(super) fn requested_extra(
    request: &hanabi_protocol::TableSettings,
) -> CommandResult<ExtraOptions> {
    Ok(ExtraOptions {
        set_seed_suffix: requested_seed(request.seed_suffix.as_deref())?,
        ..ExtraOptions::default()
    })
}
/// A table's settings as the lobby and its players see them, with its custom seed.
pub(super) fn table_settings(
    name: &str,
    max_players: usize,
    options: &Options,
    extra: &ExtraOptions,
) -> hanabi_protocol::TableSettings {
    hanabi_protocol::TableSettings {
        name: name.into(),
        max_players: num_players(max_players),
        options: wire_options(options),
        seed_suffix: extra.set_seed_suffix.clone(),
    }
}
/// Settings that the client offers a table's owner to apply.
pub(super) fn options_suggestion(
    id: TableId,
    options: &Options,
    name: &str,
    max_players: usize,
    extra: &ExtraOptions,
) -> TableSettingsSuggestion {
    TableSettingsSuggestion {
        table_id: id,
        settings: table_settings(name, max_players, options, extra),
    }
}
pub(super) fn option_changes(
    table: &TableSnapshot,
    options: &Options,
    name: &str,
    max_players: usize,
    extra: &ExtraOptions,
) -> String {
    let current = &table.options;
    let mut changes = String::new();
    // Each change is on its own line.
    let mut add = |label: &str, value: &str| {
        write!(changes, "\n{label}: {value}").expect("writing to a string cannot fail");
    };
    if name != table.name {
        add("Table Name", name);
    }
    if options.variant_name != current.variant_name {
        add("Variant", &options.variant_name);
    }
    if options.time_control != current.time_control {
        match options.time_control {
            Some(time) => add(
                "Timed",
                &format!("{} / {}", time.base_seconds, time.per_turn_seconds),
            ),
            None => add("Timed", "No"),
        }
    }
    let seed = &extra.set_seed_suffix;
    if *seed != table.extra.set_seed_suffix {
        add("Seed", seed.as_deref().unwrap_or("Any"));
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
    owner: hanabi_protocol::UserRef,
) -> TableSnapshot {
    let id = snapshot.table_id;
    let owner_id = owner.user_id;
    let options = snapshot.game.options.clone();
    for player in &mut snapshot.players {
        player.id = None;
    }
    let name = format!(
        "{} replay for {}",
        if shared { "Shared" } else { "Solo" },
        snapshot.game_id.map_or_else(
            || {
                let owner_name = owner.username.as_str();
                format!(
                    "{owner_name}{} JSON game",
                    if owner_name.ends_with('s') { "'" } else { "'s" }
                )
            },
            |id| format!("game #{id}")
        )
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
            custom_seed: snapshot.seed.clone(),
            ..ExtraOptions::default()
        },
        created: OffsetDateTime::now_utc(),
        options,
        phase: Phase::Replay {
            snapshot: Box::new(snapshot),
            replay: ReplayState {
                leader: owner_id,
                segment: Turn::default(),
                efficiency_modifier: hanabi_protocol::EfficiencyModifier::default(),
                hypothetical: false,
                hypothetical_actions: vec![],
                show_drawn_cards: false,
                spoiler_free,
                restart_declined: vec![],
            },
            runtime: crate::model::ReplayRuntime::default(),
        },
        chat: vec![],
        shadows: BTreeMap::new(),
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
) -> CommandResult<(TableSnapshot, Saved, Vec<String>)> {
    ensure_or_reject!(session.active(), "Stale session.");
    let id = store.allocate_table().await?;
    let result = async {
        let r = match creation {
            Creation::Table(r) => r,
            Creation::Replay(r) => {
                let (shared, spoiler_free) = match r.visibility {
                    hanabi_protocol::ReplayVisibility::Solo {} => (false, false),
                    hanabi_protocol::ReplayVisibility::Shared { spoiler_free, .. } => {
                        (true, spoiler_free)
                    }
                };
                let mut warnings = vec![];
                let mut custom_seed = None;
                let snapshot = match &r.source {
                    hanabi_protocol::ReplaySource::Imported { game } => {
                        let imported = super::replay_helpers::parse(game)?;
                        warnings.clone_from(&imported.warnings);
                        custom_seed = Some(imported.custom_seed.clone());
                        super::replay_helpers::snapshot(imported, id, session.user)
                    }
                    hanabi_protocol::ReplaySource::Saved { game_id } => {
                        crate::archive::replay(&store.primary, *game_id, id, session.user).await?
                    }
                };
                let mut table = replay_table(snapshot, shared, spoiler_free, session.user_ref());
                if let Some(seed) = custom_seed {
                    table.extra.custom_seed = seed;
                }
                let mut saved = Saved::default();
                store.save(&mut table, &mut saved).await?;
                // Temporary: measures how often spoiler-free reviews are used, to decide whether
                // to remove them.
                tracing::info!(
                    "Created a {} replay (spoiler-free: {}) for user {}.",
                    if shared { "shared" } else { "solo" },
                    spoiler_free,
                    session.user,
                );
                return Ok((table, saved, warnings));
            }
        };
        let settings = r.settings;
        let name = table_name(&settings.name)?;
        let mut options = engine_options(&settings.options)?;
        normalize_options(&mut options)?;
        let extra = requested_extra(&settings)?;
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        let player = crate::stats::player(&store.primary, &session.identity, variant.id).await?;
        let max_players = usize::from(settings.max_players);
        let password_hash = match r.password {
            Some(password) => {
                ensure_or_reject!(
                    password.len() <= MAX_TABLE_PASSWORD_BYTES,
                    "Passwords cannot be longer than {MAX_TABLE_PASSWORD_BYTES} bytes."
                );
                Some(crate::accounts::hash_password(&session.ip, password).await?)
            }
            None => None,
        };
        ensure_or_reject!(session.active(), "Creator disconnected during preparation.");
        let mut table = TableSnapshot {
            format: FORMAT.into(),
            id,
            name,
            owner: session.user_ref(),
            visible: true,
            options,
            max_players,
            password_hash,
            extra,
            created: OffsetDateTime::now_utc(),
            phase: Phase::Pregame {
                players: vec![player],
                kicked: vec![],
                runtime: crate::model::PregameRuntime::default(),
            },
            chat: vec![],
            shadows: BTreeMap::new(),
        };
        // Records when the table was created, for players who join later.
        table_notice(&mut table, &format!("{} created the table.", session.name));
        let mut saved = Saved::default();
        store.save(&mut table, &mut saved).await?;
        Ok((table, saved, vec![]))
    }
    .await;
    if result.is_err() {
        let _ = store.remove(id, 0).await;
    }
    result
}
