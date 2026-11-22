use crate::recipe::{self, RecipeSuits};
use crate::{ClueType, int};
use anyhow::{Result, anyhow, ensure};
use hanabi_protocol::{
    CatalogColor, CatalogSuit, CatalogVariant, EVEN_RANK_CLUE, MAX_RANK, MIN_RANK, ODD_RANK_CLUE,
    START_CARD_RANK, VariantRules,
};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    sync::{OnceLock, RwLock},
};

pub use hanabi_protocol::CatalogCharacter as Character;

/// A suit as the rules use it. The game library derives the same values in `suitsInit.ts`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
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
    pub recipe: String,
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
        if entry.all_clue_colors || entry.no_clue_colors || entry.prism {
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
    let stack_size = entry.stack_size.map_or(MAX_RANK, |size| size.get().into());
    let mut ranks: Vec<i32> = (MIN_RANK..=stack_size).collect();
    if entry.up_or_down {
        ranks.push(START_CARD_RANK);
    }
    Variant {
        id: entry.id.get(),
        recipe: entry.recipe,
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

/// Panics unless the entry has exactly the rules that its recipe describes. The client builds its
/// variants from the entry's fields, and the recipe is the variant's identity, so both must agree.
fn check_recipe(entry: &CatalogVariant, suits: &RecipeSuits) {
    let mut expected = recipe::catalog_fields(&entry.recipe, suits)
        .unwrap_or_else(|error| panic!("variants.json: {}: {error:#}", entry.name));
    expected.insert("id".into(), serde_json::json!(entry.id));
    expected.insert("recipe".into(), serde_json::json!(entry.recipe));
    expected.insert("name".into(), serde_json::json!(entry.name));
    let actual = serde_json::to_value(entry).expect("a catalog entry serializes");
    assert!(
        actual == Value::Object(expected.clone()),
        "variants.json: {} does not match its recipe \"{}\"\nentry:  {actual}\nrecipe: {}",
        entry.name,
        entry.recipe,
        Value::Object(expected)
    );
}

fn catalog_colors() -> &'static [CatalogColor] {
    static DATA: OnceLock<Vec<CatalogColor>> = OnceLock::new();
    DATA.get_or_init(|| {
        catalog(
            "colors.json",
            include_str!("../../../packages/game/src/json/colors.json"),
        )
    })
}

fn catalog_suits() -> &'static [CatalogSuit] {
    static DATA: OnceLock<Vec<CatalogSuit>> = OnceLock::new();
    DATA.get_or_init(|| {
        catalog(
            "suits.json",
            include_str!("../../../packages/game/src/json/suits.json"),
        )
    })
}

/// The suits of `suits.json`, each with its ID.
pub(crate) fn suits_by_id() -> Vec<(String, Suit)> {
    catalog_suits()
        .iter()
        .map(|entry| (entry.id.clone(), suit(entry.clone(), catalog_colors())))
        .collect()
}

/// The suits that recipes use: by name, including each suit's reversed version, and by ID.
struct RecipeData {
    by_name: HashMap<String, Suit>,
    by_id: RecipeSuits,
}

fn recipe_data() -> &'static RecipeData {
    static DATA: OnceLock<RecipeData> = OnceLock::new();
    DATA.get_or_init(|| {
        let suits_by_id = suits_by_id();
        let by_id = RecipeSuits::new(&suits_by_id).unwrap_or_else(|error| {
            panic!("suits.json: {error:#}");
        });
        let mut by_name = HashMap::new();
        for (_, mut suit) in suits_by_id {
            by_name.insert(suit.name.clone(), suit.clone());
            suit.reversed = true;
            by_name.insert(format!("{} Reversed", suit.name), suit);
        }
        RecipeData { by_name, by_id }
    })
}

/// Builds the variant that a recipe describes, without checking that its parts work together.
fn build_variant(recipe: &str, id: u32, name: &str) -> Result<Variant> {
    let data = recipe_data();
    let mut fields = recipe::catalog_fields(recipe, &data.by_id)?;
    fields.insert("id".into(), id.into());
    fields.insert("recipe".into(), recipe.into());
    fields.insert("name".into(), name.into());
    let entry: CatalogVariant = hanabi_protocol::decode(&Value::Object(fields))?;
    Ok(variant(entry, &data.by_name))
}

/// The variant's entry as `variants.json` writes it, from its recipe.
fn catalog_entry(variant: &Variant) -> Result<CatalogVariant> {
    let mut fields = recipe::catalog_fields(&variant.recipe, &recipe_data().by_id)?;
    fields.insert("id".into(), variant.id.into());
    fields.insert("recipe".into(), variant.recipe.as_str().into());
    fields.insert("name".into(), variant.name.as_str().into());
    hanabi_protocol::decode(&Value::Object(fields))
}

/// The rules that a client builds a variant from. See `VariantRules`.
pub fn variant_rules(variant: &Variant) -> Result<VariantRules> {
    let mut suits: Vec<CatalogSuit> = Vec::new();
    for suit in &variant.suits {
        if suits.iter().all(|entry| entry.name != suit.name) {
            let entry = catalog_suits()
                .iter()
                .find(|entry| entry.name == suit.name)
                .ok_or_else(|| anyhow!("There is no suit named {}", suit.name))?;
            suits.push(entry.clone());
        }
    }
    // A suit takes the color of its own name, unless it lists its clue colors.
    let used: HashSet<&str> = suits
        .iter()
        .flat_map(|entry| {
            std::iter::once(entry.name.as_str())
                .chain(entry.clue_colors.iter().flatten().map(String::as_str))
        })
        .chain(variant.clue_colors.iter().map(String::as_str))
        .collect();
    let colors = catalog_colors()
        .iter()
        .filter(|color| used.contains(color.name.as_str()))
        .cloned()
        .collect();
    Ok(VariantRules {
        variant: catalog_entry(variant)?,
        suits,
        colors,
    })
}

/// The variant that a recipe describes. It fails for a recipe whose parts do not work together, or
/// that has a modifier that changes nothing.
pub fn variant_from_recipe(recipe: &str, id: u32, name: &str) -> Result<Variant> {
    let variant = build_variant(recipe, id, name)?;
    recipe::check_rules(&variant, |other| build_variant(other, id, name))?;
    Ok(variant)
}

pub fn variants() -> &'static [Variant] {
    static DATA: OnceLock<Vec<Variant>> = OnceLock::new();
    DATA.get_or_init(|| {
        let data = recipe_data();
        let mut recipes = HashSet::new();
        catalog::<CatalogVariant>(
            "variants.json",
            include_str!("../../../packages/game/src/json/variants.json"),
        )
        .into_iter()
        .map(|entry| {
            check_recipe(&entry, &data.by_id);
            assert!(
                recipes.insert(entry.recipe.clone()),
                "variants.json: two variants have the recipe \"{}\"",
                entry.recipe
            );
            let (id, name) = (entry.id.get(), entry.name.clone());
            let variant = variant(entry, &data.by_name);
            recipe::check_rules(&variant, |other| build_variant(other, id, &name))
                .unwrap_or_else(|error| panic!("variants.json: {name}: {error:#}"));
            variant
        })
        .collect()
    })
}

/// Old variant names, each with the new one: live tables, links, and bots can still use an old name.
/// Each entry replaces the start of a name.
const RENAMED_VARIANTS: &[(&str, &str)] = &[("Cow & Pig (", "Cow and Pig (")];

pub fn get_variant(name: &str) -> Result<&'static Variant> {
    static INDEX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    let index = INDEX.get_or_init(|| {
        variants()
            .iter()
            .enumerate()
            .map(|(i, v)| (v.name.as_str(), i))
            .collect()
    });
    let renamed = RENAMED_VARIANTS
        .iter()
        .find_map(|(old, new)| name.strip_prefix(old).map(|rest| format!("{new}{rest}")));
    index
        .get(name)
        .or_else(|| renamed.and_then(|renamed| index.get(renamed.as_str())))
        .map(|i| &variants()[*i])
        .or_else(|| added_variants().read().ok()?.get(name).copied())
        .ok_or_else(|| anyhow!("Unknown game variant: {name}"))
}

/// The variants outside the catalog that `add_variant` added, by name.
fn added_variants() -> &'static RwLock<HashMap<String, &'static Variant>> {
    static ADDED: OnceLock<RwLock<HashMap<String, &'static Variant>>> = OnceLock::new();
    ADDED.get_or_init(RwLock::default)
}

/// Adds a variant outside the catalog, such as one from `variant_from_recipe`, so that games can
/// use it by name. Adding the same variant again does nothing. It fails for a name that another
/// variant has.
pub fn add_variant(variant: Variant) -> Result<&'static Variant> {
    let same = |existing: &Variant| {
        ensure!(
            existing.recipe == variant.recipe && existing.id == variant.id,
            "Another variant is named {}",
            variant.name
        );
        Ok(())
    };
    if let Some(existing) = variants().iter().find(|v| v.name == variant.name) {
        same(existing)?;
        return Ok(existing);
    }
    let mut added = added_variants()
        .write()
        .map_err(|_| anyhow!("The added variants are poisoned"))?;
    if let Some(existing) = added.get(&variant.name) {
        same(existing)?;
        return Ok(existing);
    }
    let leaked: &'static Variant = Box::leak(Box::new(variant));
    added.insert(leaked.name.clone(), leaked);
    Ok(leaked)
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

/// The number of cards in a variant's deck.
pub fn deck_size(variant: &Variant) -> usize {
    variant
        .suits
        .iter()
        .flat_map(|suit| {
            variant
                .ranks
                .iter()
                .map(move |&rank| num_copies_of_card(variant, suit, rank))
        })
        .sum()
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
                // The odd clue touches the odd ranks and the even clue the even ones, but not a
                // start card.
                let odd = match value {
                    ODD_RANK_CLUE => true,
                    EVEN_RANK_CLUE => false,
                    _ => return false,
                };
                return (MIN_RANK..=MAX_RANK).contains(&rank) && (rank % 2 == 1) == odd;
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
