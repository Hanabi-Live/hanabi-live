use super::*;

pub(super) async fn export(state: &PublicState, params: &Params) -> Result<Value> {
    let raw = params
        .get("databaseID")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| Error::not_found("Error: You must specify a database game ID."))?;
    let id =
        integer(raw).ok_or_else(|| Error::bad("Error: That is not a valid database game ID."))?;
    if !(1..=i32::MAX as i64).contains(&id) {
        return Err(Error::not_found(
            "Error: That game does not exist in the database.",
        ));
    }
    let archive = crate::archive::load(&state.pool, id as i32)
        .await?
        .ok_or_else(|| Error::not_found("Error: That game does not exist in the database."))?;
    let row = archive.game;
    let players = archive.players;
    if players.len() != usize::try_from(row.num_players)?
        || !players
            .iter()
            .enumerate()
            .all(|(i, p)| i16::try_from(i).ok() == Some(p.seat))
    {
        return Err(anyhow::anyhow!("Inconsistent historical participant seats").into());
    }
    let variant_id = i64::from(row.variant_id);
    let variant = catalog::variant(variant_id)
        .ok_or_else(|| anyhow::anyhow!("Unknown historical variant"))?;
    let custom = archive.deck;
    let seed: String = row.seed.clone();
    let deck = if let Some(bytes) = &custom {
        let cards = crate::game::decode_deck(bytes)?;
        if cards.len() > (state.config.deck_size)(variant_id as i32)? {
            return Err(anyhow::anyhow!("Malformed custom deck length").into());
        }
        let suits = variant["suits"].as_array().expect("catalog suits").len();
        if cards.iter().any(|card| card.suit_index >= suits) {
            return Err(anyhow::anyhow!("Malformed custom deck card").into());
        }
        json!(cards)
    } else {
        // Never substitute a standard deck or claim a custom replay was seeded.
        (state.config.seeded_deck)(variant_id as i32, &seed)?
    };
    let deck_len = deck
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("Engine returned invalid deck"))?
        .len();
    let mut notes =
        vec![
            vec![String::new(); deck_len + variant["suits"].as_array().expect("suits").len()];
            players.len()
        ];
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
    let mut options = serde_json::Map::new();
    let starting_player: i16 = row.starting_player;
    if starting_player != 0 {
        options.insert("startingPlayer".into(), json!(starting_player));
    }
    if variant_id != 0 {
        options.insert("variant".into(), variant["name"].clone());
    }
    for (enabled, wire) in [
        (row.timed, "timed"),
        (row.speedrun, "speedrun"),
        (row.card_cycle, "cardCycle"),
        (row.deck_plays, "deckPlays"),
        (row.empty_clues, "emptyClues"),
        (row.one_extra_card, "oneExtraCard"),
        (row.one_less_card, "oneLessCard"),
        (row.all_or_nothing, "allOrNothing"),
        (row.detrimental_characters, "detrimentalCharacters"),
    ] {
        if enabled {
            options.insert(wire.into(), json!(true));
        }
    }
    if row.timed {
        options.insert("timeBase".into(), json!(row.time_base));
        options.insert("timePerTurn".into(), json!(row.time_per_turn));
    }
    let mut result = json!({"id":id,"players":players.iter().map(|p| &p.name).collect::<Vec<_>>(),
        "deck":deck,"actions":archive.actions});
    if !options.is_empty() {
        result["options"] = json!(options);
    }
    if notes.iter().any(|n| !n.is_empty()) {
        result["notes"] = json!(notes);
    }
    if custom.is_none() {
        result["seed"] = json!(seed);
    }
    if row.detrimental_characters {
        let mut characters = Vec::new();
        for p in &players {
            let id = i64::from(p.character_assignment);
            let name = if id == -1 {
                ""
            } else {
                catalog::character(id)
                    .ok_or_else(|| anyhow::anyhow!("Unknown historical character"))?
            };
            characters.push(json!({"name":name,"metadata":i32::from(p.character_metadata) - 1}));
        }
        result["characters"] = json!(characters);
    }
    Ok(result)
}
