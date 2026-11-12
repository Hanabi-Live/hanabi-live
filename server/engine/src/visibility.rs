use crate::{Character, EngineEvent, EngineState, rules::variant_for};
use anyhow::{Result, bail};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Recipient {
    Player { player_index: i32 },
    Spectator { shadowing_player_index: Option<i32> },
}

/// Project either the complete history or a transition's event slice. Historical
/// draws stay hidden even after the corresponding card leaves its holder's hand.
pub fn events_for_recipient(
    state: &EngineState,
    recipient: Recipient,
    events: Option<&[EngineEvent]>,
) -> Result<Vec<EngineEvent>> {
    let index = match recipient {
        Recipient::Player { player_index } => {
            let Some(index) = usize::try_from(player_index)
                .ok()
                .filter(|&i| i < state.players.len())
            else {
                bail!("Invalid game recipient.");
            };
            Some(index)
        }
        Recipient::Spectator {
            shadowing_player_index,
        } => shadowing_player_index
            .and_then(|i| usize::try_from(i).ok())
            .filter(|i| *i < state.players.len()),
    };
    let events = events.unwrap_or(&state.events);
    let Some(index) = index else {
        return Ok(events.to_vec());
    };
    let player = &state.players[index];
    let count = state.players.len();
    Ok(events
        .iter()
        .cloned()
        .map(|mut event| {
            match &mut event {
                EngineEvent::Clue {
                    clue: clue @ Some(_),
                    clue_type,
                    giver,
                    ..
                } => {
                    let variant = variant_for(state);
                    let quacker = state.options.detrimental_characters
                        && state.players[*giver].is(Character::Quacker);
                    if variant.duck || quacker {
                        *clue = None;
                    } else if variant.cow_and_pig {
                        *clue_type = clue.take().map(|clue| clue.clue_type);
                    }
                }
                EngineEvent::Draw {
                    player_index,
                    suit_index,
                    rank,
                    ..
                } => {
                    let hidden = *player_index == index
                        || (state.options.detrimental_characters
                            && (player.is(Character::SlowWitted)
                                || (player.is(Character::BlindSpot)
                                    && *player_index == (index + 1) % count)
                                || (player.is(Character::Oblivious)
                                    && *player_index == (index + count - 1) % count)));
                    if hidden {
                        *suit_index = None;
                        *rank = None;
                    }
                }
                EngineEvent::CardIdentity {
                    player_index,
                    suit_index,
                    rank,
                    ..
                } => {
                    if *player_index == index {
                        *suit_index = None;
                        *rank = None;
                    }
                }
                EngineEvent::Play {
                    suit_index, rank, ..
                }
                | EngineEvent::Discard {
                    suit_index,
                    rank,
                    failed: true,
                    ..
                } if variant_for(state).throw_it_in_a_hole => {
                    *suit_index = None;
                    *rank = None;
                }
                _ => {}
            }
            event
        })
        .collect())
}
