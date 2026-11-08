use super::{Error, Params, PublicState, Result, StatusCode, catalog, integer};

/// An archived game that cannot be exported. Its code and game ID reach the server log and the
/// error alerts, so the game and the failed check can be found later.
fn export_failure(code: &'static str, problem: &str, id: i64) -> Error {
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
        .get("databaseID")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| Error::not_found("You must specify a database game ID."))?;
    let id = integer(raw).ok_or_else(|| Error::bad("That is not a valid database game ID."))?;
    let Some(game_id) = i32::try_from(id).ok().filter(|id| *id >= 1) else {
        return Err(Error::not_found(
            "That game does not exist in the database.",
        ));
    };
    let archive = crate::archive::load(&state.pool, game_id)
        .await?
        .ok_or_else(|| Error::not_found("That game does not exist in the database."))?;
    let row = archive.game;
    let players = archive.players;
    if players.len() != usize::try_from(row.num_players)?
        || !players
            .iter()
            .enumerate()
            .all(|(i, p)| i16::try_from(i).ok() == Some(p.seat))
    {
        return Err(export_failure(
            "archive_inconsistent_players",
            "The archived game's players do not match its seats",
            id,
        ));
    }
    let variant_id = i64::from(row.variant_id);
    let variant = catalog::variant(variant_id).ok_or_else(|| {
        export_failure(
            "archive_unknown_variant",
            "The archived game's variant is not in the catalog",
            id,
        )
    })?;
    let seed = row.seed.clone();
    let deck = (state.config.seeded_deck)(i32::from(row.variant_id), &seed).map_err(|_| {
        export_failure(
            "archive_invalid_seed",
            "The archived game's seed cannot produce a deck",
            id,
        )
    })?;
    let deck: Vec<hanabi_protocol::ReplayCard> = serde_json::from_value(deck)?;
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
    let flag = |enabled: bool| enabled.then_some(true);
    let options = hanabi_protocol::ReplayOptions {
        variant: (variant_id != 0).then(|| variant.name.clone()),
        starting_player: (row.starting_player != 0).then_some(i64::from(row.starting_player)),
        timed: flag(row.timed),
        time_base: row.timed.then_some(i64::from(row.time_base)),
        time_per_turn: row.timed.then_some(i64::from(row.time_per_turn)),
        speedrun: flag(row.speedrun),
        card_cycle: flag(row.card_cycle),
        deck_plays: flag(row.deck_plays),
        empty_clues: flag(row.empty_clues),
        one_extra_card: flag(row.one_extra_card),
        one_less_card: flag(row.one_less_card),
        all_or_nothing: flag(row.all_or_nothing),
        detrimental_characters: flag(row.detrimental_characters),
    };
    let characters = if row.detrimental_characters {
        let mut characters = Vec::new();
        for p in &players {
            let character = i64::from(p.character_assignment);
            let name = if character == -1 {
                ""
            } else {
                catalog::character(character).ok_or_else(|| {
                    export_failure(
                        "archive_unknown_character",
                        "The archived game's character is not in the catalog",
                        id,
                    )
                })?
            };
            characters.push(hanabi_protocol::ReplayCharacter {
                name: name.into(),
                metadata: i32::from(p.character_metadata) - 1,
            });
        }
        Some(characters)
    } else {
        None
    };
    Ok(hanabi_protocol::ReplayGame {
        id,
        players: players.iter().map(|p| p.name.clone()).collect(),
        deck,
        actions: archive.actions,
        options: (options != hanabi_protocol::ReplayOptions::default()).then_some(options),
        notes: notes.iter().any(|n| !n.is_empty()).then_some(notes),
        characters,
        seed,
    })
}
