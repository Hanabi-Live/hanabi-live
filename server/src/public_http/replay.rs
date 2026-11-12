use super::{HttpError, Params, PublicState, Result, StatusCode, catalog, integer};
use hanabi_protocol::GameId;

/// An archived game that cannot be exported. Its code and game ID reach the server log and the
/// error alerts, so the game and the failed check can be found later.
fn export_failure(code: hanabi_protocol::NoticeCode, problem: &str, id: i64) -> HttpError {
    crate::errors::Fault::new(
        code,
        format!("{problem}: {id}"),
        StatusCode::INTERNAL_SERVER_ERROR,
    )
    .into()
}

pub(super) async fn export(
    state: &PublicState,
    params: &Params,
) -> Result<hanabi_protocol::ReplayGame> {
    let raw = params
        .get("databaseId")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| HttpError::not_found("You must specify a database game ID."))?;
    let id = integer(raw).ok_or_else(|| HttpError::bad("That is not a valid database game ID."))?;
    let Some(game_id) = i32::try_from(id).ok().filter(|id| *id >= 1) else {
        return Err(HttpError::not_found(
            "That game does not exist in the database.",
        ));
    };
    let archive = crate::archive::load(&state.pool, GameId(game_id))
        .await?
        .ok_or_else(|| HttpError::not_found("That game does not exist in the database."))?;
    let row = archive.game;
    let players = archive.players;
    if players.len() != usize::try_from(row.num_players)?
        || !players
            .iter()
            .enumerate()
            .all(|(i, p)| i16::try_from(i).ok() == Some(p.seat))
    {
        return Err(export_failure(
            hanabi_protocol::NoticeCode::ArchiveInconsistentPlayers,
            "The archived game's players do not match its seats",
            id,
        ));
    }
    let variant_id = i64::from(row.variant_id);
    let variant = catalog::variant(variant_id).ok_or_else(|| {
        export_failure(
            hanabi_protocol::NoticeCode::ArchiveUnknownVariant,
            "The archived game's variant is not in the catalog",
            id,
        )
    })?;
    let deck = crate::game::seeded_deck(i32::from(row.variant_id), &row.seed).map_err(|_| {
        export_failure(
            hanabi_protocol::NoticeCode::ArchiveInvalidSeed,
            "The archived game's seed cannot produce a deck",
            id,
        )
    })?;
    let deck_len = deck.len();
    let mut notes = vec![vec![String::new(); deck_len + variant.suits.len()]; players.len()];
    for note in archive.notes {
        if let (Ok(seat), Ok(order)) = (usize::try_from(note.seat), usize::try_from(note.order))
            && let Some(cell) = notes.get_mut(seat).and_then(|n| n.get_mut(order))
        {
            *cell = note.note;
        }
    }
    for notes in &mut notes {
        while notes.last().is_some_and(String::is_empty) {
            notes.pop();
        }
    }
    let options = hanabi_protocol::GameOptions {
        variant_id: hanabi_protocol::VariantId(variant.id),
        time_control: row.time_control(),
        speedrun: row.speedrun,
        deck_plays: row.deck_plays,
        empty_clues: row.empty_clues,
        one_extra_card: row.one_extra_card,
        one_less_card: row.one_less_card,
        all_or_nothing: row.all_or_nothing,
        detrimental_characters: row.detrimental_characters,
    };
    let characters = if row.detrimental_characters {
        let mut characters = Vec::new();
        for p in &players {
            let invalid = || {
                export_failure(
                    hanabi_protocol::NoticeCode::ArchiveInvalidCharacter,
                    "The archived game's character is not in the catalog, or has an invalid value",
                    id,
                )
            };
            let character = p
                .character_id
                .and_then(|character| catalog::character(i64::from(character)))
                .and_then(hanabi_engine::Character::from_name)
                .ok_or_else(invalid)?;
            characters.push(
                crate::game::character_assignment(character, p.assigned_metadata.map(i32::from))
                    .map_err(|_| invalid())?,
            );
        }
        characters
    } else {
        Vec::new()
    };
    let actions = archive
        .actions
        .into_iter()
        .map(hanabi_protocol::ReplayGameAction::try_from)
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| {
            export_failure(
                hanabi_protocol::NoticeCode::ArchiveInvalidAction,
                "The archived game has an action that the replay format cannot hold",
                id,
            )
        })?;
    Ok(hanabi_protocol::ReplayGame {
        player_names: players.iter().map(|p| p.name.clone()).collect(),
        deck,
        actions,
        options,
        notes: if notes.iter().any(|n| !n.is_empty()) {
            notes
        } else {
            vec![]
        },
        characters,
        seed: Some(row.seed.into()),
    })
}
