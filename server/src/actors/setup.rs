use super::chat::{server_chat, table_notice};
use crate::errors::CommandResult;
use crate::errors::OrReject;
use crate::{
    game::Options,
    model::{
        ExtraOptions, FORMAT, MAX_TABLE_NAME_LENGTH, Phase, ReplayState, Snapshot, TableReplay,
        TableSnapshot, engine_options, small, wire_options,
    },
    store::{Saved, Store},
    transport::Session,
};
use chrono::Utc;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{Chat, GameId, MAX_SEED_LENGTH, MIN_PLAYERS, Turn};
use std::{collections::BTreeMap, fmt::Write as _};

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
            (1..=hanabi_protocol::MAX_TIME_BASE_SECONDS).contains(&time.base_seconds)
                && (1..=hanabi_protocol::MAX_TIME_PER_TURN_SECONDS).contains(&time.per_turn_seconds)
        }),
        "Invalid timed options"
    );
    Ok(())
}

pub(super) fn validate_table_name(name: &str) -> CommandResult<()> {
    ensure_or_reject!(
        name.chars().all(|c| c.is_alphanumeric()
            || unicode_normalization::char::is_combining_mark(c)
            || " _!#$'()+,-.:;=?@".contains(c)),
        "Invalid table name"
    );
    Ok(())
}

/// Reads a requested seed: blank deals the next seed that none of the players have played.
pub(super) fn requested_seed(seed: Option<&str>) -> CommandResult<Option<String>> {
    let seed = seed.unwrap_or_default().trim();
    ensure_or_reject!(
        seed.len() <= MAX_SEED_LENGTH,
        "Seeds cannot be longer than {MAX_SEED_LENGTH} characters"
    );
    ensure_or_reject!(
        seed.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'),
        "Seeds can only contain letters, numbers, and hyphens"
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
                .or_reject("Seed suffix exhausted")?,
            width = number.len()
        )
    };
    requested_seed(Some(&next))
}

/// Reads the custom seed and the replayed game that a table requests, without loading the game.
pub(super) fn requested_extra(
    request: &hanabi_protocol::TableSettings,
) -> CommandResult<ExtraOptions> {
    let mut extra = ExtraOptions {
        set_seed_suffix: requested_seed(request.seed_suffix.as_deref())?,
        ..ExtraOptions::default()
    };
    let Some(GameId(game_id)) = request.replay_game_id else {
        ensure_or_reject!(
            request.replay_turn.is_none(),
            "A replay turn needs a game to replay"
        );
        return Ok(extra);
    };
    ensure_or_reject!(
        extra.set_seed_suffix.is_none(),
        "A replay keeps its game's seed"
    );
    extra.replay = Some(TableReplay {
        game_id: GameId(game_id),
        turns: request.replay_turn.map_or(0, Turn::index),
    });
    Ok(extra)
}

/// Loads the finished game that a table replays, if any. Its options replace `options`.
pub(super) async fn load_replay(
    store: &Store,
    extra: &mut ExtraOptions,
    table_id: TableId,
    user: UserId,
    options: &mut Options,
) -> CommandResult<()> {
    let Some(TableReplay { game_id, turns }) = extra.replay else {
        return Ok(());
    };
    let historical = crate::archive::replay(&store.primary, game_id, table_id, user).await?;
    ensure_or_reject!(
        usize::try_from(historical.game.turn).is_ok_and(|limit| turns < limit),
        "Replay turn exceeds game"
    );
    *options = historical.game.options.clone();
    extra.custom_seed = historical.seed;
    extra.custom_num_players = Some(options.num_players);
    extra.custom_characters = Some(
        historical
            .game
            .players
            .iter()
            .map(|p| hanabi_engine::AssignedCharacter {
                name: p.character.map(|c| c.name().into()),
                metadata: p.assigned_metadata(),
            })
            .collect(),
    );
    extra.custom_actions.clone_from(&historical.game.actions);
    Ok(())
}
/// A table's settings as the lobby and its players see them, with its custom seed and replayed
/// game.
pub(super) fn table_settings(
    name: &str,
    max_players: usize,
    options: &Options,
    extra: &ExtraOptions,
) -> hanabi_protocol::TableSettings {
    hanabi_protocol::TableSettings {
        name: name.into(),
        max_players: small(max_players),
        options: wire_options(options),
        seed_suffix: extra.set_seed_suffix.clone(),
        replay_game_id: extra.replay.map(|replay| replay.game_id),
        replay_turn: replay_turn(extra),
    }
}
/// The turn that a replayed game starts from, unless it is the first turn.
fn replay_turn(extra: &ExtraOptions) -> Option<Turn> {
    let replay = extra.replay.filter(|replay| replay.turns > 0)?;
    Turn::new(replay.turns)
}
/// A private message to a table's owner, with a button that applies the suggested options.
pub(super) fn options_suggestion(
    id: TableId,
    owner: &str,
    options: &Options,
    name: &str,
    max_players: usize,
    extra: &ExtraOptions,
) -> Chat {
    Chat {
        recipient: Some(owner.into()),
        suggestion: Some(table_settings(name, max_players, options, extra)),
        ..server_chat(
            id,
            "<span class=\"cp\"><button class=\"new-options\">click to apply the suggestion</button></span>",
        )
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
    if extra.replay != table.extra.replay {
        add(
            "Replay",
            &extra.replay.map_or_else(
                || "No".into(),
                |TableReplay { game_id: id, .. }| match replay_turn(extra) {
                    // Players count turns from 1.
                    Some(turn) => format!("Game #{id} from turn {}", turn.index() + 1),
                    None => format!("Game #{id}"),
                },
            ),
        );
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
    owner: UserId,
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
        snapshot.game_id.map_or_else(
            || {
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
        created: Utc::now(),
        options,
        phase: Phase::Replay {
            snapshot: Box::new(snapshot),
            replay: ReplayState {
                leader: owner,
                segment: Turn::default(),
                efficiency_modifier: 0,
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
    ensure_or_reject!(session.active(), "Stale session");
    let id = store.allocate_table().await?;
    let result = async {
        let r = match creation {
            Creation::Table(r) => r,
            Creation::Replay(r) => {
                let shared = r.visibility() == hanabi_protocol::ReplayVisibility::Shared;
                let spoiler_free = r.spoiler_free();
                ensure_or_reject!(
                    shared || !spoiler_free,
                    "Only a shared replay can be a spoiler-free review."
                );
                let mut warnings = vec![];
                let mut custom_seed = None;
                let snapshot = match &r {
                    hanabi_protocol::ReplayCreateRequest::Json { game_json, .. } => {
                        let imported = super::replay_helpers::parse(game_json)?;
                        warnings.clone_from(&imported.warnings);
                        custom_seed = Some(imported.custom_seed.clone());
                        super::replay_helpers::snapshot(imported, id, session.user)
                    }
                    hanabi_protocol::ReplayCreateRequest::Id { game_id, .. } => {
                        crate::archive::replay(&store.primary, *game_id, id, session.user).await?
                    }
                };
                let mut table =
                    replay_table(snapshot, shared, spoiler_free, session.user, &session.name);
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
        let mut name =
            crate::accounts::truncate_to_max_bytes(settings.name.trim(), MAX_TABLE_NAME_LENGTH)
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
        let mut options = engine_options(&settings.options);
        normalize_options(&mut options)?;
        let mut extra = requested_extra(&settings)?;
        load_replay(store, &mut extra, id, session.user, &mut options).await?;
        let variant = hanabi_engine::get_variant(&options.variant_name)?;
        options.variant_id = Some(variant.id);
        let player = crate::stats::player(&store.primary, &session.identity, variant.id).await?;
        let max_players =
            usize::from(settings.max_players).max(extra.custom_num_players.unwrap_or(MIN_PLAYERS));
        let password = r.password;
        let password_hash = if password.is_empty() {
            None
        } else {
            ensure_or_reject!(
                password.len() <= MAX_TABLE_PASSWORD_BYTES,
                "Passwords cannot be longer than {MAX_TABLE_PASSWORD_BYTES} bytes"
            );
            Some(crate::accounts::hash_password(&session.ip, password).await?)
        };
        ensure_or_reject!(session.active(), "Creator disconnected during preparation");
        let mut table = TableSnapshot {
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
                kicked: vec![],
                runtime: crate::model::PregameRuntime::default(),
            },
            chat: vec![],
            shadows: BTreeMap::new(),
        };
        // Records when the table was created, for players who join later.
        table_notice(
            &mut table,
            &format!(
                "{} created the table.",
                crate::accounts::escape_html(&session.name)
            ),
        );
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
