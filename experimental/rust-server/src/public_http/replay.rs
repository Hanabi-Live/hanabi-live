use super::*;
use sqlx::Row;

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
    // All replay components share one statement snapshot.
    let row = sqlx::query(
        "SELECT to_jsonb(g) AS game, d.deck,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('name',u.username,'seat',p.seat,
          'character',p.character_assignment,'metadata',p.character_metadata) ORDER BY p.seat)
          FROM game_participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id),'[]') AS players,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('type',a.type,'target',a.target,'value',a.value)
          ORDER BY a.turn) FROM game_actions a WHERE a.game_id=g.id),'[]') AS actions,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('seat',p.seat,'order',n.card_order,'note',n.note))
          FROM game_participant_notes n JOIN game_participants p ON p.id=n.game_participant_id
          WHERE p.game_id=g.id),'[]') AS notes
        FROM games g LEFT JOIN game_custom_decks d ON d.game_id=g.id WHERE g.id=$1")
        .bind(id as i32).fetch_optional(&state.pool).await?
        .ok_or_else(|| Error::not_found("Error: That game does not exist in the database."))?;
    let g: Value = row.try_get("game")?;
    let players: Vec<Value> = row
        .try_get::<sqlx::types::Json<Vec<Value>>, _>("players")?
        .0;
    if players.len() as i64 != g["num_players"].as_i64().unwrap_or(-1)
        || !players
            .iter()
            .enumerate()
            .all(|(i, p)| p["seat"].as_u64() == Some(i as u64))
    {
        return Err(anyhow::anyhow!("Inconsistent historical participant seats").into());
    }
    let variant_id = g["variant_id"]
        .as_i64()
        .ok_or_else(|| anyhow::anyhow!("Missing variant"))?;
    let variant = catalog::variant(variant_id)
        .ok_or_else(|| anyhow::anyhow!("Unknown historical variant"))?;
    let custom: Option<Vec<u8>> = row.try_get("deck")?;
    let seed = g["seed"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Missing seed"))?;
    let deck = if let Some(bytes) = &custom {
        let count = bytes.len().saturating_sub(1);
        if !(1..=60).contains(&count)
            || count > (state.config.deck_size)(variant_id as i32)?
            || bytes[0] as usize != 128 + count
        {
            return Err(anyhow::anyhow!("Malformed custom deck length").into());
        }
        let suits = variant["suits"].as_array().expect("catalog suits").len();
        let mut deck = Vec::new();
        for byte in &bytes[1..] {
            let suit = (byte / 8) as usize;
            let rank = byte % 8;
            if suit >= suits || !(1..=6).contains(&rank) {
                return Err(anyhow::anyhow!("Malformed custom deck card").into());
            }
            deck.push(json!({"suitIndex":suit,"rank":rank}));
        }
        json!(deck)
    } else {
        // Never substitute a standard deck or claim a custom replay was seeded.
        (state.config.seeded_deck)(variant_id as i32, seed)?
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
    let stored_notes: Vec<Value> = row.try_get::<sqlx::types::Json<Vec<Value>>, _>("notes")?.0;
    for note in stored_notes {
        if let (Some(seat), Some(order), Some(text)) = (
            note["seat"].as_u64(),
            note["order"].as_u64(),
            note["note"].as_str(),
        ) && let Some(cell) = notes
            .get_mut(seat as usize)
            .and_then(|n| n.get_mut(order as usize))
        {
            *cell = text.to_owned();
        }
    }
    for notes in &mut notes {
        while notes.last().is_some_and(String::is_empty) {
            notes.pop();
        }
    }
    let mut options = serde_json::Map::new();
    if g["starting_player"] != 0 {
        options.insert("startingPlayer".into(), g["starting_player"].clone());
    }
    if variant_id != 0 {
        options.insert("variant".into(), variant["name"].clone());
    }
    for (db, wire) in data::OPTION_FIELDS {
        if g[db] == true {
            options.insert(wire.into(), json!(true));
        }
    }
    if g["timed"] == true {
        options.insert("timeBase".into(), g["time_base"].clone());
        options.insert("timePerTurn".into(), g["time_per_turn"].clone());
    }
    let mut result = json!({"id":id,"players":players.iter().map(|p| &p["name"]).collect::<Vec<_>>(),
        "deck":deck,"actions":row.try_get::<Value,_>("actions")?});
    if !options.is_empty() {
        result["options"] = json!(options);
    }
    if notes.iter().any(|n| !n.is_empty()) {
        result["notes"] = json!(notes);
    }
    if custom.is_none() {
        result["seed"] = json!(seed);
    }
    if g["detrimental_characters"] == true {
        let mut characters = Vec::new();
        for p in &players {
            let id = p["character"]
                .as_i64()
                .ok_or_else(|| anyhow::anyhow!("Invalid character"))?;
            let name = if id == -1 {
                ""
            } else {
                catalog::character(id)
                    .ok_or_else(|| anyhow::anyhow!("Unknown historical character"))?
            };
            characters.push(json!({"name":name,"metadata":p["metadata"].as_i64().ok_or_else(|| anyhow::anyhow!("Invalid character metadata"))? - 1}));
        }
        result["characters"] = json!(characters);
    }
    Ok(result)
}
