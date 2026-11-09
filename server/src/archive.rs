//! Finished games in the database: archiving one, and reading one back as a replay.

use crate::{
    game::{Game, Options},
    model::{FORMAT, IDLE_TIMEOUT_MS, Player, Snapshot, Tag},
    stats::zero_stats,
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{NO_VALUE, ReplayAction};
use serde::Deserialize;
use sqlx::{PgPool, types::Json};
use sqlx::{Postgres, Transaction};
use std::collections::BTreeMap;
#[cfg(test)]
#[path = "archive_tests.rs"]
mod tests;

#[derive(Debug, Deserialize)]
pub(crate) struct ArchivePlayer {
    pub user_id: i32,
    pub name: String,
    pub seat: i16,
    pub character_assignment: i16,
    pub character_metadata: i16,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ArchiveNote {
    pub seat: i16,
    pub order: i16,
    pub note: String,
}

#[derive(Debug, Deserialize, sqlx::FromRow)]
pub struct GameRecord {
    pub id: i32,
    pub name: String,
    pub num_players: i16,
    pub variant_id: i16,
    pub timed: bool,
    pub time_base: i32,
    pub time_per_turn: i32,
    pub speedrun: bool,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
    pub detrimental_characters: bool,
    pub seed: String,
    pub score: i16,
    pub num_turns: i16,
    pub end_condition: i16,
    pub datetime_started: DateTime<Utc>,
    pub datetime_finished: DateTime<Utc>,
}

pub(crate) struct Archive {
    pub game: GameRecord,
    pub players: Vec<ArchivePlayer>,
    pub actions: Vec<ReplayAction>,
    pub notes: Vec<ArchiveNote>,
    pub tags: Vec<Tag>,
}

pub(crate) async fn load(pool: &PgPool, id: i32) -> Result<Option<Archive>> {
    // One statement preserves a consistent snapshot without per-player note queries.
    let Some(row) = sqlx::query!(
        "SELECT to_jsonb(g) AS \"game!: Json<GameRecord>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'user_id',p.user_id,'name',u.username,'seat',p.seat,
          'character_assignment',p.character_assignment,'character_metadata',p.character_metadata)
          ORDER BY p.seat) FROM game_participants p JOIN users u ON u.id=p.user_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS \"archive_players!: Json<Vec<ArchivePlayer>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'type',a.type,'target',a.target,'value',a.value) ORDER BY a.turn)
          FROM game_actions a WHERE a.game_id=g.id),'[]'::jsonb) AS \"archive_actions!: Json<Vec<ReplayAction>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('seat',p.seat,'order',n.card_order,'note',n.note)
          ORDER BY p.seat,n.card_order) FROM game_participant_notes n
          JOIN game_participants p ON p.id=n.game_participant_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS \"archive_notes!: Json<Vec<ArchiveNote>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('user',t.user_id,'tag',t.tag)
          ORDER BY t.user_id,t.tag) FROM game_tags t
          WHERE t.game_id=g.id),'[]'::jsonb) AS \"archive_tags!: Json<Vec<Tag>>\"
        FROM games g WHERE g.id=$1",
        id
    )
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    Ok(Some(Archive {
        players: row.archive_players.0,
        actions: row.archive_actions.0,
        notes: row.archive_notes.0,
        tags: row.archive_tags.0,
        game: row.game.0,
    }))
}

/// The whole seconds that the database stores for a time base, which option validation bounds.
#[expect(
    clippy::cast_possible_truncation,
    reason = "option validation bounds the time base"
)]
fn stored_seconds(time_base: f64) -> i32 {
    time_base as i32
}

/// The stored character assignment of a player without a character.
pub const NO_CHARACTER_ASSIGNMENT: i16 = -1;

/// Rebuilds a finished game from the database as a replay at table `table_id`, owned by `owner`.
pub(crate) async fn replay(
    pool: &PgPool,
    id: i32,
    table_id: TableId,
    owner: UserId,
) -> Result<Snapshot> {
    let archive = load(pool, id).await?.context("Unknown replay")?;
    let row = archive.game;
    let options = options(&row)?;
    let variant = hanabi_engine::get_variant(&options.variant_name)?;
    let seed: String = row.seed.clone();
    let deck = hanabi_engine::create_shuffled_deck(variant, &seed);
    ensure!(
        deck.len() <= hanabi_engine::create_deck(variant).len()
            && deck.iter().all(|c| c.suit_index < variant.suits.len()),
        "Malformed stored deck"
    );
    let rows = archive.players;
    ensure!(rows.len() == options.num_players, "Invalid replay roster");
    let mut players = vec![];
    let mut characters = vec![];
    let mut notes = vec![vec![String::new(); deck.len() + variant.suits.len()]; rows.len()];
    for (seat, r) in rows.iter().enumerate() {
        ensure!(
            i16::try_from(seat).ok() == Some(r.seat),
            "Invalid replay seat"
        );
        players.push(Player {
            id: UserId(r.user_id),
            name: r.name.clone(),
            stats: zero_stats(),
        });
        let assignment = r.character_assignment;
        let character = hanabi_engine::characters()
            .iter()
            .find(|c| i16::try_from(c.id).ok() == Some(assignment));
        ensure!(
            assignment == NO_CHARACTER_ASSIGNMENT || character.is_some(),
            "Unknown stored character"
        );
        let name = character.map_or("", |c| c.name.as_str());
        characters.push(AssignedCharacter {
            name: name.into(),
            metadata: if hanabi_engine::Character::from_name(name)
                .is_some_and(hanabi_engine::Character::has_assigned_metadata)
            {
                i32::from(r.character_metadata)
            } else {
                NO_VALUE
            },
        });
    }
    for note in archive.notes {
        let cell = notes
            .get_mut(usize::try_from(note.seat)?)
            .and_then(|notes| {
                usize::try_from(note.order)
                    .ok()
                    .and_then(|order| notes.get_mut(order))
            })
            .context("Invalid stored note")?;
        *cell = note.note;
    }
    let game = Game::replay(
        GameSetup {
            options,
            player_names: players.iter().map(|p| p.name.clone()).collect(),
            seed: seed.clone(),
            deck: Some(deck),
            characters: Some(characters),
            interpretation: Interpretation::Recorded,
        },
        archive.actions,
    )?;
    ensure!(
        game.score == i32::from(row.score)
            && game.end_condition as i32 == i32::from(row.end_condition),
        "Historical replay result mismatch"
    );
    let n = players.len();
    Ok(Snapshot {
        format: FORMAT.into(),
        table_id,
        game_id: row.id,
        owner,
        name: row.name.clone(),
        players,
        seed,
        created: Utc::now(),
        started: row.datetime_started,
        finished: Some(row.datetime_finished),
        game,
        clocks: vec![0; n],
        duration: 0,
        turn_elapsed: 0,
        timer_started: false,
        idle_remaining: IDLE_TIMEOUT_MS,
        pause_player_index: NO_VALUE,
        queued_pauses: vec![false; n],
        notes,
        spectator_notes: BTreeMap::new(),
        tags: archive.tags,
        votes: vec![false; n],
        maintenance_applied: false,
    })
}

/// A finished game's tags, or `None` if the game does not exist.
pub(crate) async fn tags(pool: &PgPool, id: i32) -> Result<Option<Vec<Tag>>> {
    let rows=sqlx::query!("SELECT t.user_id AS \"user_id?\",t.tag AS \"tag?\" FROM games g LEFT JOIN game_tags t ON t.game_id=g.id WHERE g.id=$1 ORDER BY t.user_id,t.tag", id).fetch_all(pool).await?;
    if rows.is_empty() {
        return Ok(None);
    }
    let mut tags = vec![];
    for row in rows {
        if let Some(tag) = row.tag.clone() {
            tags.push(Tag {
                user: UserId(row.user_id.context("Missing tag author")?),
                tag,
            });
        }
    }
    Ok(Some(tags))
}

/// Adds a finished game to the database.
pub(crate) async fn insert(
    transaction: &mut Transaction<'static, Postgres>,
    s: &Snapshot,
) -> Result<()> {
    ensure!(
        s.game_id > 0 && s.game.end_condition != EndCondition::InProgress,
        "Cannot archive an ongoing/JSON game"
    );
    let finished = s.finished.context("Missing completion time")?;
    let o = &s.game.options;
    let variant = hanabi_engine::get_variant(&o.variant_name)?;
    let tx = transaction;
    sqlx::query!("INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)", s.game_id, &s.name, i16::try_from(o.num_players)?, i16::try_from(variant.id)?, o.timed, stored_seconds(o.time_base), i32::try_from(o.time_per_turn)?, o.speedrun, o.deck_plays, o.empty_clues, o.one_extra_card, o.one_less_card, o.all_or_nothing, o.detrimental_characters, &s.seed, i16::try_from(s.game.score)?, i16::try_from(s.game.turn)?, s.game.end_condition as i16, s.started, finished).execute(&mut **tx).await?;
    let mut users = vec![];
    let mut seats = vec![];
    let mut assignments = vec![];
    let mut metadata = vec![];
    for (seat, p) in s.players.iter().enumerate() {
        let (assignment, value) = stored_character(&s.game.players[seat])?;
        users.push(p.id.0);
        seats.push(i16::try_from(seat)?);
        assignments.push(assignment);
        metadata.push(value);
    }
    let participants = sqlx::query!(
        "INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
         SELECT $1,p.user_id,p.seat,p.assignment,p.metadata
         FROM UNNEST($2::integer[],$3::smallint[],$4::smallint[],$5::smallint[])
         AS p(user_id,seat,assignment,metadata)
         RETURNING id,seat",
        s.game_id,
        &users,
        &seats,
        &assignments,
        &metadata
    )
    .fetch_all(&mut **tx)
    .await?;
    let (mut note_participants, mut note_orders, mut notes) = (vec![], vec![], vec![]);
    for participant in participants {
        let seat_notes = s
            .notes
            .get(usize::try_from(participant.seat)?)
            .context("Missing participant notes")?;
        for (order, note) in seat_notes.iter().enumerate().filter(|(_, n)| !n.is_empty()) {
            note_participants.push(participant.id);
            note_orders.push(i16::try_from(order)?);
            notes.push(note.as_str());
        }
    }
    sqlx::query!(
        "INSERT INTO game_participant_notes(game_participant_id,card_order,note)
         SELECT n.participant,n.card_order,n.note
         FROM UNNEST($1::integer[],$2::smallint[],$3::text[]) AS n(participant,card_order,note)",
        &note_participants,
        &note_orders,
        &notes as &[&str]
    )
    .execute(&mut **tx)
    .await?;
    let kinds: Vec<i16> = s
        .game
        .actions
        .iter()
        .map(|a| i16::try_from(i32::from(a.action_type)))
        .collect::<Result<_, _>>()?;
    let targets: Vec<i16> = s
        .game
        .actions
        .iter()
        .map(|a| i16::try_from(a.target))
        .collect::<Result<_, _>>()?;
    let values: Vec<i16> = s
        .game
        .actions
        .iter()
        .map(|a| i16::try_from(a.value))
        .collect::<Result<_, _>>()?;
    sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) SELECT $1,(a.turn-1)::smallint,a.kind,a.target,a.value FROM UNNEST($2::smallint[],$3::smallint[],$4::smallint[]) WITH ORDINALITY AS a(kind,target,value,turn)", s.game_id, &kinds, &targets, &values).execute(&mut **tx).await?;
    let tag_users = s.tags.iter().map(|tag| tag.user.0).collect::<Vec<_>>();
    let tags = s
        .tags
        .iter()
        .map(|tag| tag.tag.as_str())
        .collect::<Vec<_>>();
    sqlx::query!(
        "INSERT INTO game_tags(game_id,user_id,tag) SELECT $1,t.user_id,t.tag FROM UNNEST($2::integer[],$3::text[]) AS t(user_id,tag)",
        s.game_id,
        &tag_users,
        &tags as &[&str]
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// The character assignment and metadata that `game_participants` stores for a player.
fn stored_character(player: &hanabi_engine::EnginePlayer) -> Result<(i16, i16)> {
    let assignment = hanabi_engine::characters()
        .iter()
        .find(|c| c.name == player.character)
        .map_or(Ok(NO_CHARACTER_ASSIGNMENT), |c| i16::try_from(c.id))?;
    let metadata = player.assigned_metadata().map_or(Ok(0), i16::try_from)?;
    Ok((assignment, metadata))
}

pub fn options(row: &GameRecord) -> Result<Options> {
    let variant = hanabi_engine::get_variant_by_id(u32::try_from(row.variant_id)?)?;
    Ok(Options {
        num_players: usize::try_from(row.num_players)?,
        variant_name: variant.name.clone(),
        variant_id: Some(variant.id),
        timed: row.timed,
        time_base: f64::from(row.time_base),
        time_per_turn: i64::from(row.time_per_turn),
        speedrun: row.speedrun,
        deck_plays: row.deck_plays,
        empty_clues: row.empty_clues,
        one_extra_card: row.one_extra_card,
        one_less_card: row.one_less_card,
        all_or_nothing: row.all_or_nothing,
        detrimental_characters: row.detrimental_characters,
        table_name: None,
        max_players: None,
    })
}
