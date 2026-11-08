use crate::model::Tag;
use anyhow::Result;
use chrono::{DateTime, Utc};
use hanabi_protocol::ReplayAction;
use serde::Deserialize;
use sqlx::{PgPool, types::Json};
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
