use crate::int;
use anyhow::{Result, anyhow};
use hanabi_protocol::{
    CatalogColor, CatalogSuit, CatalogVariant, ClueType, MAX_RANK, MIN_RANK, START_CARD_RANK,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{collections::HashMap, sync::OnceLock};

pub use hanabi_protocol::CatalogCharacter as Character;

/// A suit as the rules use it. The game library derives the same values in `suitsInit.ts`.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
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

/// A variant as the rules use it. The game library derives the same values in `variantsInit.ts`;
/// the `catalog` example prints these so that its tests can compare them.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub id: u32,
    #[serde(rename = "newId")]
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
impl Variant {
    pub fn has_reversed_suits(&self) -> bool {
        self.up_or_down || self.suits.iter().any(|s| s.reversed)
    }
}

/// Decodes a checked-in catalog file, validating each entry against its wire contract.
fn catalog<T: hanabi_protocol::JsonSchema + DeserializeOwned + 'static>(
    file: &str,
    json: &str,
) -> Vec<T> {
    let entries: Vec<Value> = serde_json::from_str(json).expect("checked-in catalog JSON");
    assert!(!entries.is_empty(), "{file} is empty");
    entries
        .iter()
        .map(|entry| {
            hanabi_protocol::decode(entry).unwrap_or_else(|error| panic!("{file}: {error:#}"))
        })
        .collect()
}

pub fn characters() -> &'static [Character] {
    static DATA: OnceLock<Vec<Character>> = OnceLock::new();
    DATA.get_or_init(|| {
        catalog(
            "characters.json",
            include_str!("../../../packages/game/src/json/characters.json"),
        )
    })
}

fn suit(entry: CatalogSuit, colors: &[CatalogColor]) -> Suit {
    let clue_colors = entry.clue_colors.unwrap_or_else(|| {
        if entry.all_clue_colors || entry.no_clue_colors || entry.prism || entry.name == "Unknown" {
            vec![]
        } else {
            assert!(
                colors.iter().any(|color| color.name == entry.name),
                "The {} suit has no clue colors and no color of the same name",
                entry.name
            );
            vec![entry.name.clone()]
        }
    });
    Suit {
        name: entry.name,
        clue_colors,
        one_of_each: entry.one_of_each,
        all_clue_colors: entry.all_clue_colors,
        no_clue_colors: entry.no_clue_colors,
        all_clue_ranks: entry.all_clue_ranks,
        no_clue_ranks: entry.no_clue_ranks,
        prism: entry.prism,
        inverted: entry.inverted,
        reversed: false,
    }
}

fn variant(entry: CatalogVariant, suits: &HashMap<String, Suit>) -> Variant {
    let variant_suits: Vec<Suit> = entry
        .suits
        .iter()
        .map(|name| {
            suits
                .get(name)
                .unwrap_or_else(|| panic!("The {} variant has an unknown suit: {name}", entry.name))
                .clone()
        })
        .collect();
    let clue_colors = entry.clue_colors.unwrap_or_else(|| {
        let mut colors = Vec::new();
        for suit in variant_suits.iter().filter(|suit| !suit.all_clue_colors) {
            for color in &suit.clue_colors {
                if !colors.contains(color) {
                    colors.push(color.clone());
                }
            }
        }
        colors
    });
    let stack_size = entry.stack_size.map_or(MAX_RANK, i32::from);
    let mut ranks: Vec<i32> = (MIN_RANK..=stack_size).collect();
    if entry.up_or_down {
        ranks.push(START_CARD_RANK);
    }
    Variant {
        id: entry.id.0,
        new_id: entry.new_id,
        name: entry.name,
        max_score: int(variant_suits.len()) * stack_size,
        has_inverted: variant_suits.iter().any(|suit| suit.inverted),
        suits: variant_suits,
        ranks,
        clue_colors,
        clue_ranks: entry.clue_ranks.map_or_else(
            || (MIN_RANK..=MAX_RANK).collect(),
            |ranks| ranks.into_iter().map(i32::from).collect(),
        ),
        stack_size,
        special_rank: entry.special_rank.map(i32::from),
        special_rank_all_clue_colors: entry.special_rank_all_clue_colors,
        special_rank_all_clue_ranks: entry.special_rank_all_clue_ranks,
        special_rank_no_clue_colors: entry.special_rank_no_clue_colors,
        special_rank_no_clue_ranks: entry.special_rank_no_clue_ranks,
        special_rank_deceptive: entry.special_rank_deceptive,
        critical_rank: entry.critical_rank.map(i32::from),
        scarce_ones: entry.scarce_ones,
        clue_starved: entry.clue_starved,
        color_clues_touch_nothing: entry.color_clues_touch_nothing,
        rank_clues_touch_nothing: entry.rank_clues_touch_nothing,
        alternating_clues: entry.alternating_clues,
        cow_and_pig: entry.cow_and_pig,
        duck: entry.duck,
        odds_and_evens: entry.odds_and_evens,
        synesthesia: entry.synesthesia,
        up_or_down: entry.up_or_down,
        throw_it_in_a_hole: entry.throw_it_in_a_hole,
        funnels: entry.funnels,
        chimneys: entry.chimneys,
        sudoku: entry.sudoku,
    }
}

pub fn variants() -> &'static [Variant] {
    static DATA: OnceLock<Vec<Variant>> = OnceLock::new();
    DATA.get_or_init(|| {
        let colors: Vec<CatalogColor> = catalog(
            "colors.json",
            include_str!("../../../packages/game/src/json/colors.json"),
        );
        let mut suits = HashMap::new();
        for entry in catalog::<CatalogSuit>(
            "suits.json",
            include_str!("../../../packages/game/src/json/suits.json"),
        ) {
            let mut suit = suit(entry, &colors);
            suits.insert(suit.name.clone(), suit.clone());
            suit.reversed = true;
            suits.insert(format!("{} Reversed", suit.name), suit);
        }
        catalog::<CatalogVariant>(
            "variants.json",
            include_str!("../../../packages/game/src/json/variants.json"),
        )
        .into_iter()
        .map(|entry| variant(entry, &suits))
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
        MIN_RANK if variant.up_or_down || suit.reversed => 1,
        MIN_RANK if variant.scarce_ones => 2,
        MIN_RANK => 3,
        _ if (MIN_RANK..MAX_RANK).contains(&rank) => 2,
        MAX_RANK if suit.reversed => 3,
        MAX_RANK => 1,
        START_CARD_RANK if variant.up_or_down => 1,
        _ => 0,
    }
}

pub fn is_card_touched(
    variant: &Variant,
    clue_type: ClueType,
    value: i32,
    suit_index: usize,
    rank: i32,
) -> bool {
    let Some(suit) = variant.suits.get(suit_index) else {
        return false;
    };
    match clue_type {
        ClueType::Color => {
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
                && (rank - MIN_RANK) % int(variant.clue_colors.len()) == value
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
                    == if rank == START_CARD_RANK {
                        int(variant.clue_colors.len()) - 1
                    } else {
                        (rank - MIN_RANK) % int(variant.clue_colors.len())
                    };
            }
            suit.clue_colors.contains(color)
        }
        ClueType::Rank => {
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
                // The 1 clue touches the odd ranks and the 2 clue the even ones, but not a start card.
                return (MIN_RANK..=MAX_RANK).contains(&rank) && rank % 2 == value % 2;
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
        }
    }
}
