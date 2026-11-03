use crate::{game::Action, model::Tag};
use anyhow::Result;
use serde::Deserialize;
use sqlx::{PgPool, Row, postgres::PgRow, types::Json};
#[cfg(test)]
#[path = "archive_tests.rs"]
mod tests;

#[derive(Deserialize)]
pub(crate) struct ArchivePlayer {
    pub user_id: i32,
    pub name: String,
    pub seat: i16,
    pub character_assignment: i16,
    pub character_metadata: i16,
}

#[derive(Deserialize)]
pub(crate) struct ArchiveNote {
    pub seat: i16,
    pub order: i16,
    pub note: String,
}

pub(crate) struct Archive {
    pub game: PgRow,
    pub deck: Option<Vec<u8>>,
    pub players: Vec<ArchivePlayer>,
    pub actions: Vec<Action>,
    pub notes: Vec<ArchiveNote>,
    pub tags: Vec<Tag>,
}

pub(crate) async fn load(pool: &PgPool, id: i32) -> Result<Option<Archive>> {
    // One statement preserves a consistent snapshot without per-player note queries.
    let Some(row) = sqlx::query(
        "SELECT g.*, d.deck AS archive_deck,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'user_id',p.user_id,'name',u.username,'seat',p.seat,
          'character_assignment',p.character_assignment,'character_metadata',p.character_metadata)
          ORDER BY p.seat) FROM game_participants p JOIN users u ON u.id=p.user_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS archive_players,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'type',a.type,'target',a.target,'value',a.value) ORDER BY a.turn)
          FROM game_actions a WHERE a.game_id=g.id),'[]'::jsonb) AS archive_actions,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('seat',p.seat,'order',n.card_order,'note',n.note)
          ORDER BY p.seat,n.card_order) FROM game_participant_notes n
          JOIN game_participants p ON p.id=n.game_participant_id
          WHERE p.game_id=g.id),'[]'::jsonb) AS archive_notes,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('user',t.user_id,'tag',t.tag)
          ORDER BY t.user_id,t.tag) FROM game_tags t
          WHERE t.game_id=g.id),'[]'::jsonb) AS archive_tags
        FROM games g LEFT JOIN game_custom_decks d ON d.game_id=g.id WHERE g.id=$1",
    ).bind(id).fetch_optional(pool).await? else { return Ok(None); };
    Ok(Some(Archive {
        deck: row.try_get("archive_deck")?,
        players: row
            .try_get::<Json<Vec<ArchivePlayer>>, _>("archive_players")?
            .0,
        actions: row.try_get::<Json<Vec<Action>>, _>("archive_actions")?.0,
        notes: row.try_get::<Json<Vec<ArchiveNote>>, _>("archive_notes")?.0,
        tags: row.try_get::<Json<Vec<Tag>>, _>("archive_tags")?.0,
        game: row,
    }))
}
