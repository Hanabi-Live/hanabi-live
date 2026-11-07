use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::OnceLock};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Suit {
    pub name: String,
    pub clue_colors: Vec<String>,
    pub one_of_each: bool,
    pub all_clue_colors: bool,
    pub no_clue_colors: bool,
    pub all_clue_ranks: bool,
    pub no_clue_ranks: bool,
    pub prism: bool,
    pub inverted: bool,
    pub reversed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Variant {
    pub id: u32,
    #[serde(rename = "newID")]
    pub new_id: String,
    pub name: String,
    pub suits: Vec<Suit>,
    pub ranks: Vec<i32>,
    pub clue_colors: Vec<String>,
    pub clue_ranks: Vec<i32>,
    pub stack_size: i32,
    pub max_score: i32,
    pub special_rank: Option<i32>,
    pub special_rank_all_clue_colors: bool,
    pub special_rank_all_clue_ranks: bool,
    pub special_rank_no_clue_colors: bool,
    pub special_rank_no_clue_ranks: bool,
    pub special_rank_deceptive: bool,
    pub critical_rank: Option<i32>,
    pub scarce_ones: bool,
    pub clue_starved: bool,
    pub color_clues_touch_nothing: bool,
    pub rank_clues_touch_nothing: bool,
    pub alternating_clues: bool,
    pub cow_and_pig: bool,
    pub duck: bool,
    pub odds_and_evens: bool,
    pub synesthesia: bool,
    pub up_or_down: bool,
    pub throw_it_in_a_hole: bool,
    pub funnels: bool,
    pub chimneys: bool,
    pub sudoku: bool,
    pub has_inverted: bool,
}
impl Default for Variant {
    fn default() -> Self {
        Self {
            id: 0,
            new_id: String::new(),
            name: String::new(),
            suits: vec![],
            ranks: vec![1, 2, 3, 4, 5],
            clue_colors: vec![],
            clue_ranks: vec![1, 2, 3, 4, 5],
            stack_size: 5,
            max_score: 0,
            special_rank: None,
            special_rank_all_clue_colors: false,
            special_rank_all_clue_ranks: false,
            special_rank_no_clue_colors: false,
            special_rank_no_clue_ranks: false,
            special_rank_deceptive: false,
            critical_rank: None,
            scarce_ones: false,
            clue_starved: false,
            color_clues_touch_nothing: false,
            rank_clues_touch_nothing: false,
            alternating_clues: false,
            cow_and_pig: false,
            duck: false,
            odds_and_evens: false,
            synesthesia: false,
            up_or_down: false,
            throw_it_in_a_hole: false,
            funnels: false,
            chimneys: false,
            sudoku: false,
            has_inverted: false,
        }
    }
}
impl Variant {
    pub fn has_reversed_suits(&self) -> bool {
        self.up_or_down || self.suits.iter().any(|s| s.reversed)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub name: String,
    pub id: u32,
    #[serde(default, rename = "not2P")]
    pub not_two_player: bool,
    pub description: String,
}

pub fn characters() -> &'static [Character] {
    static DATA: OnceLock<Vec<Character>> = OnceLock::new();
    DATA.get_or_init(|| {
        serde_json::from_str(include_str!(
            "../../../packages/game/src/json/characters.json"
        ))
        .expect("checked-in characters")
    })
}

pub fn variants() -> &'static [Variant] {
    static DATA: OnceLock<Vec<Variant>> = OnceLock::new();
    DATA.get_or_init(|| {
        let colors: Vec<Value> =
            serde_json::from_str(include_str!("../../../packages/game/src/json/colors.json"))
                .expect("checked-in colors");
        let raw: Vec<Value> =
            serde_json::from_str(include_str!("../../../packages/game/src/json/suits.json"))
                .expect("checked-in suits");
        let mut suits = HashMap::new();
        for value in raw {
            let mut suit: Suit = serde_json::from_value(value.clone()).expect("checked-in suit");
            if value.get("clueColors").is_none()
                && !suit.all_clue_colors
                && !suit.no_clue_colors
                && !suit.prism
                && suit.name != "Unknown"
            {
                assert!(colors.iter().any(|c| c["name"] == suit.name));
                suit.clue_colors.push(suit.name.clone());
            }
            suits.insert(suit.name.clone(), suit.clone());
            suit.reversed = true;
            suits.insert(format!("{} Reversed", suit.name), suit);
        }
        let raw: Vec<Value> = serde_json::from_str(include_str!(
            "../../../packages/game/src/json/variants.json"
        ))
        .expect("checked-in variants");
        raw.into_iter()
            .map(|mut value| {
                let suit_names = value
                    .as_object_mut()
                    .expect("variant")
                    .remove("suits")
                    .expect("variant suits");
                let mut variant: Variant =
                    serde_json::from_value(value.clone()).expect("checked-in variant");
                variant.suits = suit_names
                    .as_array()
                    .expect("suits")
                    .iter()
                    .map(|name| suits[name.as_str().expect("suit name")].clone())
                    .collect();
                if value.get("clueColors").is_none() {
                    for suit in &variant.suits {
                        if !suit.all_clue_colors {
                            for color in &suit.clue_colors {
                                if !variant.clue_colors.contains(color) {
                                    variant.clue_colors.push(color.clone());
                                }
                            }
                        }
                    }
                }
                variant.ranks = (1..=variant.stack_size).collect();
                if variant.up_or_down {
                    variant.ranks.push(7);
                }
                variant.max_score = variant.suits.len() as i32 * variant.stack_size;
                variant.has_inverted = variant.suits.iter().any(|s| s.inverted);
                variant
            })
            .collect()
    })
}

pub fn get_variant(name: &str) -> Result<&'static Variant> {
    static INDEX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    let index = INDEX.get_or_init(|| {
        variants()
            .iter()
            .enumerate()
            .map(|(i, v)| (v.name.as_str(), i))
            .collect()
    });
    index
        .get(name)
        .map(|i| &variants()[*i])
        .ok_or_else(|| anyhow!("Unknown game variant: {name}"))
}
pub fn get_variant_by_id(id: u32) -> Result<&'static Variant> {
    variants()
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| anyhow!("Unknown game variant ID: {id}"))
}
pub fn variant_names() -> impl Iterator<Item = &'static str> {
    variants().iter().map(|v| v.name.as_str())
}

pub fn num_copies_of_card(variant: &Variant, suit: &Suit, rank: i32) -> usize {
    if suit.one_of_each || variant.critical_rank == Some(rank) {
        return 1;
    }
    if variant.sudoku {
        return 2;
    }
    match rank {
        1 if variant.up_or_down || suit.reversed => 1,
        1 if variant.scarce_ones => 2,
        1 => 3,
        2..=4 => 2,
        5 if suit.reversed => 3,
        5 => 1,
        7 if variant.up_or_down => 1,
        _ => 0,
    }
}

pub fn is_card_touched(
    variant: &Variant,
    clue_type: i32,
    value: i32,
    suit_index: usize,
    rank: i32,
) -> bool {
    let Some(suit) = variant.suits.get(suit_index) else {
        return false;
    };
    if clue_type == 0 {
        let Some(color) = usize::try_from(value)
            .ok()
            .and_then(|i| variant.clue_colors.get(i))
        else {
            return false;
        };
        if variant.color_clues_touch_nothing {
            return false;
        }
        if variant.synesthesia
            && !suit.no_clue_ranks
            && (rank - 1) % variant.clue_colors.len() as i32 == value
        {
            return true;
        }
        if suit.all_clue_colors {
            return true;
        }
        if suit.no_clue_colors {
            return false;
        }
        if variant.special_rank == Some(rank) {
            if variant.special_rank_all_clue_colors {
                return true;
            }
            if variant.special_rank_no_clue_colors {
                return false;
            }
        }
        if suit.prism {
            return value
                == if rank == 7 {
                    variant.clue_colors.len() as i32 - 1
                } else {
                    (rank - 1) % variant.clue_colors.len() as i32
                };
        }
        suit.clue_colors.contains(color)
    } else if clue_type == 1 {
        if variant.rank_clues_touch_nothing {
            return false;
        }
        if suit.all_clue_ranks {
            return true;
        }
        if suit.no_clue_ranks {
            return false;
        }
        if variant.funnels {
            return rank <= value;
        }
        if variant.chimneys {
            return rank >= value;
        }
        if variant.odds_and_evens {
            return if value == 1 {
                [1, 3, 5].contains(&rank)
            } else {
                [2, 4].contains(&rank)
            };
        }
        if variant.special_rank == Some(rank) {
            if variant.special_rank_all_clue_ranks {
                return true;
            }
            if variant.special_rank_no_clue_ranks {
                return false;
            }
            if variant.special_rank_deceptive {
                return value == variant.clue_ranks[suit_index % variant.clue_ranks.len()];
            }
        }
        rank == value
    } else {
        false
    }
}
