//! Finished games in the database: archiving one, and reading one back as a replay.

use crate::{
    game::{Game, Options},
    model::{Player, Snapshot, Tag},
    stats::zero_stats,
};
use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Utc};
use hanabi_engine::{AssignedCharacter, EndCondition, GameSetup, Interpretation};
use hanabi_protocol::GameId;
use hanabi_protocol::TableId;
use hanabi_protocol::UserId;
use hanabi_protocol::{NO_VALUE, RecordedActionType, ReplayAction};
use serde::Deserialize;
use sqlx::{PgPool, types::Json};
use sqlx::{Postgres, Transaction};
#[cfg(test)]
#[path = "archive_tests.rs"]
mod tests;

#[derive(Debug, Deserialize)]
pub(crate) struct ArchivePlayer {
    pub user_id: i32,
    pub name: String,
    pub seat: i16,
    /// Absent when the player has no character.
    pub character_id: Option<i16>,
    /// Absent when the player's character has no assigned metadata.
    pub assigned_metadata: Option<i16>,
}

/// An action as `game_actions` stores it: NULL for a game over's target when no player caused it,
/// and for a play's or a discard's value. The engine's records use `NO_VALUE` and 0 instead.
#[derive(Debug, Deserialize)]
struct ArchiveAction {
    #[serde(rename = "type")]
    kind: RecordedActionType,
    target: Option<i32>,
    value: Option<i32>,
}

impl From<ArchiveAction> for ReplayAction {
    fn from(action: ArchiveAction) -> Self {
        Self {
            kind: action.kind,
            target: action.target.unwrap_or(NO_VALUE),
            value: action.value.unwrap_or(0),
        }
    }
}

/// The target that `game_actions` stores: NULL for a game over that no player caused.
fn stored_target(target: i32) -> Result<Option<i16>> {
    Ok((target != NO_VALUE)
        .then(|| i16::try_from(target))
        .transpose()?)
}

/// The value that `game_actions` stores: NULL for a play or a discard, which has none.
fn stored_value(kind: RecordedActionType, value: i32) -> Result<Option<i16>> {
    Ok(
        (!matches!(kind, RecordedActionType::Play | RecordedActionType::Discard))
            .then(|| i16::try_from(value))
            .transpose()?,
    )
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
    /// NULL when the game is untimed.
    pub time_base: Option<i32>,
    pub time_per_turn: Option<i32>,
    pub speedrun: bool,
    pub deck_plays: bool,
    pub empty_clues: bool,
    pub one_extra_card: bool,
    pub one_less_card: bool,
    pub all_or_nothing: bool,
    pub detrimental_characters: bool,
    /// Absent for a game that was imported with its own deck.
    pub seed: Option<String>,
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

pub(crate) async fn load(pool: &PgPool, id: GameId) -> Result<Option<Archive>> {
    // One statement preserves a consistent snapshot without per-player note queries.
    let Some(row) = sqlx::query!(
        "SELECT to_jsonb(g) AS \"game!: Json<GameRecord>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'user_id',p.user_id,'name',u.username,'seat',p.seat,
          'character_id',p.character_id,'assigned_metadata',p.assigned_metadata)
          ORDER BY p.seat) FROM game_participants p JOIN users u ON u.id=p.user_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS \"archive_players!: Json<Vec<ArchivePlayer>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'type',a.type,'target',a.target,'value',a.value) ORDER BY a.turn)
          FROM game_actions a WHERE a.game_id=g.id),'[]'::jsonb) AS \"archive_actions!: Json<Vec<ArchiveAction>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('seat',p.seat,'order',n.card_order,'note',n.note)
          ORDER BY p.seat,n.card_order) FROM game_participant_notes n
          JOIN game_participants p ON p.id=n.game_participant_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS \"archive_notes!: Json<Vec<ArchiveNote>>\",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('user',t.user_id,'tag',t.tag)
          ORDER BY t.user_id,t.tag) FROM game_tags t
          WHERE t.game_id=g.id),'[]'::jsonb) AS \"archive_tags!: Json<Vec<Tag>>\"
        FROM games g WHERE g.id=$1",
        id.0
    )
    .fetch_optional(pool)
    .await?
    else {
        return Ok(None);
    };
    Ok(Some(Archive {
        players: row.archive_players.0,
        actions: row
            .archive_actions
            .0
            .into_iter()
            .map(ReplayAction::from)
            .collect(),
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

/// Rebuilds a finished game from the database as a replay at table `table_id`, owned by `owner`.
pub(crate) async fn replay(
    pool: &PgPool,
    id: GameId,
    table_id: TableId,
    owner: UserId,
) -> Result<Snapshot> {
    let archive = load(pool, id).await?.context("Unknown replay")?;
    let row = archive.game;
    let options = options(&row)?;
    let variant = hanabi_engine::get_variant(&options.variant_name)?;
    let seed = row
        .seed
        .clone()
        .context("A game without a seed has no deck to replay")?;
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
            bot: false,
            stats: zero_stats(),
        });
        let character = r
            .character_id
            .map(|id| {
                hanabi_engine::characters()
                    .iter()
                    .find(|c| i16::try_from(c.id).ok() == Some(id))
                    .context("Unknown stored character")
            })
            .transpose()?;
        characters.push(AssignedCharacter {
            name: character.map(|c| c.name.clone()),
            metadata: r.assigned_metadata.map(i32::from),
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
            seed: Some(seed.clone()),
            deck: Some(deck),
            characters: Some(characters),
            interpretation: Interpretation::Recorded,
        },
        &archive.actions,
    )?;
    ensure!(
        game.score == i32::from(row.score)
            && game.end_condition as i32 == i32::from(row.end_condition),
        "Historical replay result mismatch"
    );
    Ok(Snapshot {
        started: row.datetime_started,
        finished: Some(row.datetime_finished),
        notes,
        tags: archive.tags,
        ..Snapshot::new(
            table_id,
            Some(GameId(row.id)),
            owner,
            row.name.clone(),
            players,
            game,
        )
    })
}

/// A finished game's tags, or `None` if the game does not exist.
pub(crate) async fn tags(pool: &PgPool, id: GameId) -> Result<Option<Vec<Tag>>> {
    let rows=sqlx::query!("SELECT t.user_id AS \"user_id?\",t.tag AS \"tag?\" FROM games g LEFT JOIN game_tags t ON t.game_id=g.id WHERE g.id=$1 ORDER BY t.user_id,t.tag", id.0).fetch_all(pool).await?;
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
    let id = s.game_id.context("Cannot archive a JSON game")?;
    ensure!(
        s.game.end_condition != EndCondition::InProgress,
        "Cannot archive an ongoing game"
    );
    let finished = s.finished.context("Missing completion time")?;
    let o = &s.game.options;
    let variant = hanabi_engine::get_variant(&o.variant_name)?;
    let tx = transaction;
    sqlx::query!("INSERT INTO games(id,name,num_players,variant_id,timed,time_base,time_per_turn,speedrun,deck_plays,empty_clues,one_extra_card,one_less_card,all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)", id.0, &s.name, i16::try_from(o.num_players)?, i16::try_from(variant.id)?, o.timed, o.timed.then(|| stored_seconds(o.time_base)), o.timed.then(|| i32::try_from(o.time_per_turn)).transpose()?, o.speedrun, o.deck_plays, o.empty_clues, o.one_extra_card, o.one_less_card, o.all_or_nothing, o.detrimental_characters, s.seed.as_deref(), i16::try_from(s.game.score)?, i16::try_from(s.game.turn)?, s.game.end_condition as i16, s.started, finished).execute(&mut **tx).await?;
    let mut users = vec![];
    let mut seats = vec![];
    let mut character_ids = vec![];
    let mut assigned_metadata = vec![];
    for (seat, p) in s.players.iter().enumerate() {
        let (character_id, assigned) = character_columns(&s.game.players[seat])?;
        users.push(p.id.0);
        seats.push(i16::try_from(seat)?);
        character_ids.push(character_id);
        assigned_metadata.push(assigned);
    }
    let participants = sqlx::query!(
        "INSERT INTO game_participants(game_id,user_id,seat,character_id,assigned_metadata)
         SELECT $1,p.user_id,p.seat,p.character_id,p.assigned_metadata
         FROM UNNEST($2::integer[],$3::smallint[],$4::smallint[],$5::smallint[])
         AS p(user_id,seat,character_id,assigned_metadata)
         RETURNING id,seat",
        id.0,
        &users,
        &seats,
        &character_ids as &[Option<i16>],
        &assigned_metadata as &[Option<i16>]
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
    let targets: Vec<Option<i16>> = s
        .game
        .actions
        .iter()
        .map(|a| stored_target(a.target))
        .collect::<Result<_, _>>()?;
    let values: Vec<Option<i16>> = s
        .game
        .actions
        .iter()
        .map(|a| stored_value(a.action_type, a.value))
        .collect::<Result<_, _>>()?;
    sqlx::query!("INSERT INTO game_actions(game_id,turn,type,target,value) SELECT $1,(a.turn-1)::smallint,a.kind,a.target,a.value FROM UNNEST($2::smallint[],$3::smallint[],$4::smallint[]) WITH ORDINALITY AS a(kind,target,value,turn)", id.0, &kinds, &targets as &[Option<i16>], &values as &[Option<i16>]).execute(&mut **tx).await?;
    let tag_users = s.tags.iter().map(|tag| tag.user.0).collect::<Vec<_>>();
    let tags = s
        .tags
        .iter()
        .map(|tag| tag.tag.as_str())
        .collect::<Vec<_>>();
    sqlx::query!(
        "INSERT INTO game_tags(game_id,user_id,tag) SELECT $1,t.user_id,t.tag FROM UNNEST($2::integer[],$3::text[]) AS t(user_id,tag)",
        id.0,
        &tag_users,
        &tags as &[&str]
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// A player's character and its assigned metadata, as the `character_id` and `assigned_metadata`
/// columns store them, with `None` for none.
fn character_columns(player: &hanabi_engine::EnginePlayer) -> Result<(Option<i16>, Option<i16>)> {
    let character_id = hanabi_engine::characters()
        .iter()
        .find(|c| c.name == player.character)
        .map(|c| i16::try_from(c.id))
        .transpose()?;
    let metadata = player.assigned_metadata().map(i16::try_from).transpose()?;
    Ok((character_id, metadata))
}

pub fn options(row: &GameRecord) -> Result<Options> {
    let variant = hanabi_engine::get_variant_by_id(u32::try_from(row.variant_id)?)?;
    Ok(Options {
        num_players: usize::try_from(row.num_players)?,
        variant_name: variant.name.clone(),
        variant_id: Some(variant.id),
        timed: row.timed,
        time_base: row.time_base.map_or(0.0, f64::from),
        time_per_turn: row.time_per_turn.map_or(0, i64::from),
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
