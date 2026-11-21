//! Builds a variant's catalog entry from its recipe. `hanabi_protocol::Recipe` reads the text; this
//! module looks up its suits and applies its modifiers.

use crate::catalog::{Suit, Variant, is_card_touched, num_copies_of_card};
use crate::{ClueType, int};
use anyhow::{Result, anyhow, bail, ensure};
use hanabi_protocol::{
    EVEN_RANK_CLUE, MAX_RANK, MIN_RANK, ODD_RANK_CLUE, RECIPE_CRITICAL_RANK, RECIPE_DECEPTIVE_RANK,
    RECIPE_MODIFIER_SEPARATOR, RECIPE_SCARCE_RANK, RECIPE_SUIT_FLAG_SEPARATOR, RankRule, Recipe,
    RecipeFlag, SuitFlag,
};
use serde_json::{Map, Value, json};
use std::collections::HashMap;

/// How clues touch a suit, or a special rank that is touched like it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct Touch {
    all_clue_colors: bool,
    all_clue_ranks: bool,
    no_clue_colors: bool,
    no_clue_ranks: bool,
}

impl Touch {
    const fn of(suit: &Suit) -> Self {
        Self {
            all_clue_colors: suit.all_clue_colors,
            all_clue_ranks: suit.all_clue_ranks,
            no_clue_colors: suit.no_clue_colors,
            no_clue_ranks: suit.no_clue_ranks,
        }
    }

    const fn is_special(self) -> bool {
        self.all_clue_colors || self.all_clue_ranks || self.no_clue_colors || self.no_clue_ranks
    }

    /// Whether a rank touched like this has a rank clue of its own that would be pointless or too
    /// easy, so that the variant removes it.
    const fn removes_rank_clue(self) -> bool {
        self.all_clue_ranks || self.no_clue_ranks
    }
}

/// The suits that recipes name, by ID.
pub(crate) struct RecipeSuits {
    names: HashMap<String, String>,
    /// The suits whose ID a special rank may use, such as `ra` in `1ra`.
    special: HashMap<String, Touch>,
}

impl RecipeSuits {
    /// Checks the suits' IDs, and indexes them. `suits` pairs each ID with its suit.
    pub(crate) fn new(suits: &[(String, Suit)]) -> Result<Self> {
        let by_id: HashMap<&str, &Suit> =
            suits.iter().map(|(id, suit)| (id.as_str(), suit)).collect();
        ensure!(by_id.len() == suits.len(), "Two suits have the same ID");
        let mut names = HashMap::new();
        let mut special = HashMap::new();
        for (id, suit) in suits {
            let dark_suffix = format!("{RECIPE_SUIT_FLAG_SEPARATOR}{}", SuitFlag::Dark.name());
            if let Some(light_id) = id.strip_suffix(&dark_suffix) {
                let light = by_id
                    .get(light_id)
                    .ok_or_else(|| anyhow!("The dark suit {id} has no light suit {light_id}"))?;
                let as_light = Suit {
                    name: light.name.clone(),
                    one_of_each: false,
                    ..suit.clone()
                };
                ensure!(
                    suit.one_of_each && as_light == **light,
                    "The dark suit {id} must have the rules of {light_id}, with one card of each rank"
                );
            } else {
                ensure!(
                    !id.is_empty() && id.bytes().all(|byte| byte.is_ascii_lowercase()),
                    "Suit ID {id} is not lowercase letters, with an optional {dark_suffix}"
                );
                ensure!(
                    ![
                        RECIPE_DECEPTIVE_RANK,
                        RECIPE_CRITICAL_RANK,
                        RECIPE_SCARCE_RANK
                    ]
                    .contains(&id.as_str()),
                    "Suit ID {id} is a rank modifier"
                );
                let touch = Touch::of(suit);
                if touch.is_special() && !suit.one_of_each && !suit.prism && !suit.inverted {
                    ensure!(
                        !special.values().any(|other| *other == touch),
                        "Suit {id} is touched like another suit, so a special rank would have two recipes"
                    );
                    special.insert(id.clone(), touch);
                }
            }
            names.insert(id.clone(), suit.name.clone());
        }
        Ok(Self { names, special })
    }

    fn suit_name(&self, id: &str, flags: &[SuitFlag]) -> Result<String> {
        let mut key = id.to_owned();
        let mut reversed = false;
        for flag in flags {
            match flag {
                SuitFlag::Dark => {
                    key = format!("{key}{RECIPE_SUIT_FLAG_SEPARATOR}{}", flag.name());
                }
                SuitFlag::Reversed => reversed = true,
            }
        }
        let name = self
            .names
            .get(&key)
            .ok_or_else(|| anyhow!("There is no suit {key}"))?;
        Ok(if reversed {
            format!("{name} Reversed")
        } else {
            name.clone()
        })
    }
}

/// The ranks that players can clue when a special rank removes its own rank clue.
fn clue_ranks_without(rank: i32) -> Vec<i32> {
    (MIN_RANK..=MAX_RANK).filter(|clue| *clue != rank).collect()
}

/// The fields of the `variants.json` entry that `recipe` describes, apart from `id` and `name`.
/// Each modifier sets its own fields, and two modifiers may not set the same one, so that the order
/// of the modifiers never changes the result.
pub(crate) fn catalog_fields(recipe: &str, suits: &RecipeSuits) -> Result<Map<String, Value>> {
    let parsed: Recipe = recipe.parse()?;
    let mut fields = Map::new();
    let mut set = |field: &str, value: Value| -> Result<()> {
        if fields.insert(field.to_owned(), value).is_some() {
            bail!("Two modifiers of recipe \"{recipe}\" set {field}");
        }
        Ok(())
    };

    let names = parsed
        .suits
        .iter()
        .map(|suit| suits.suit_name(&suit.id, &suit.flags))
        .collect::<Result<Vec<_>>>()
        .map_err(|error| anyhow!("Recipe \"{recipe}\": {error}"))?;
    let num_suits = names.len();
    for (index, suit) in parsed.suits.iter().enumerate() {
        ensure!(
            parsed.suits[..index]
                .iter()
                .all(|other| other.id != suit.id),
            "Recipe \"{recipe}\" has the suit \"{}\" twice",
            suit.id
        );
    }
    set("suits", json!(names))?;

    for modifier in &parsed.ranks {
        let rank = modifier.rank;
        match &modifier.rule {
            RankRule::Suit(id) => {
                let touch = suits.special.get(id).ok_or_else(|| {
                    anyhow!("Recipe \"{recipe}\" has an unknown rank modifier: \"{rank}{id}\"")
                })?;
                set("specialRank", json!(rank))?;
                for (field, value) in [
                    ("specialRankAllClueColors", touch.all_clue_colors),
                    ("specialRankAllClueRanks", touch.all_clue_ranks),
                    ("specialRankNoClueColors", touch.no_clue_colors),
                    ("specialRankNoClueRanks", touch.no_clue_ranks),
                ] {
                    if value {
                        set(field, json!(true))?;
                    }
                }
                if touch.removes_rank_clue() {
                    set("clueRanks", json!(clue_ranks_without(rank)))?;
                }
            }
            RankRule::Deceptive => {
                set("specialRank", json!(rank))?;
                set("specialRankDeceptive", json!(true))?;
                set("clueRanks", json!(clue_ranks_without(rank)))?;
            }
            RankRule::Critical => set("criticalRank", json!(rank))?,
            RankRule::Scarce => set("scarceOnes", json!(true))?,
        }
    }

    for flag in &parsed.flags {
        match flag {
            RecipeFlag::ClueStarved => set("clueStarved", json!(true))?,
            RecipeFlag::ColorBlind => set("colorCluesTouchNothing", json!(true))?,
            RecipeFlag::NumberBlind => set("rankCluesTouchNothing", json!(true))?,
            RecipeFlag::ColorMute => set("clueColors", json!([]))?,
            RecipeFlag::NumberMute => set("clueRanks", json!([]))?,
            RecipeFlag::AlternatingClues => set("alternatingClues", json!(true))?,
            RecipeFlag::CowAndPig => set("cowAndPig", json!(true))?,
            RecipeFlag::Duck => set("duck", json!(true))?,
            RecipeFlag::OddsAndEvens => {
                set("oddsAndEvens", json!(true))?;
                set("clueRanks", json!([ODD_RANK_CLUE, EVEN_RANK_CLUE]))?;
            }
            RecipeFlag::Synesthesia => {
                set("synesthesia", json!(true))?;
                set("clueRanks", json!([]))?;
            }
            RecipeFlag::UpOrDown => set("upOrDown", json!(true))?,
            RecipeFlag::ThrowItInAHole => set("throwItInAHole", json!(true))?,
            RecipeFlag::Funnels => set("funnels", json!(true))?,
            RecipeFlag::Chimneys => set("chimneys", json!(true))?,
            RecipeFlag::Sudoku => {
                set("sudoku", json!(true))?;
                ensure!(
                    num_suits <= usize::try_from(MAX_RANK)?,
                    "Recipe \"{recipe}\" has Sudoku with more than {MAX_RANK} suits, but a Sudoku stack has one rank for each suit"
                );
                // A Sudoku stack has one card of each rank for each suit.
                let stack_size = i32::try_from(num_suits)?;
                if stack_size != MAX_RANK {
                    set("stackSize", json!(stack_size))?;
                    set(
                        "clueRanks",
                        json!((MIN_RANK..=stack_size).collect::<Vec<_>>()),
                    )?;
                }
            }
        }
    }
    Ok(fields)
}

/// What a variant does in a game. Two variants that do the same thing have the same behavior, even
/// when their rules are written differently.
#[derive(PartialEq, Eq)]
struct Behavior {
    ranks: Vec<i32>,
    /// The copies of each card, by suit and then by rank.
    copies: Vec<usize>,
    /// Whether each suit plays from the top down.
    reversed: Vec<bool>,
    num_clue_colors: usize,
    clue_ranks: Vec<i32>,
    /// Whether each clue touches each card, by clue, then suit, then rank.
    touches: Vec<bool>,
    /// How much of a clue the other players see: all of it, its type, or nothing.
    hidden: u8,
    clue_starved: bool,
    alternating_clues: bool,
    up_or_down: bool,
    throw_it_in_a_hole: bool,
    sudoku: bool,
}

impl Behavior {
    fn of(variant: &Variant) -> Self {
        let clues: Vec<(ClueType, i32)> = (0..variant.clue_colors.len())
            .map(|color| (ClueType::Color, int(color)))
            .chain(
                variant
                    .clue_ranks
                    .iter()
                    .map(|&rank| (ClueType::Rank, rank)),
            )
            .collect();
        let mut copies = Vec::new();
        let mut touches = Vec::new();
        for (index, suit) in variant.suits.iter().enumerate() {
            for &rank in &variant.ranks {
                copies.push(num_copies_of_card(variant, suit, rank));
                for &(clue_type, value) in &clues {
                    touches.push(is_card_touched(variant, clue_type, value, index, rank));
                }
            }
        }
        Self {
            ranks: variant.ranks.clone(),
            copies,
            reversed: variant
                .suits
                .iter()
                .map(|suit| suit.reversed && !variant.up_or_down)
                .collect(),
            num_clue_colors: variant.clue_colors.len(),
            clue_ranks: variant.clue_ranks.clone(),
            touches,
            hidden: if variant.duck {
                2
            } else {
                u8::from(variant.cow_and_pig)
            },
            clue_starved: variant.clue_starved,
            alternating_clues: variant.alternating_clues,
            up_or_down: variant.up_or_down,
            throw_it_in_a_hole: variant.throw_it_in_a_hole,
            sudoku: variant.sudoku,
        }
    }
}

/// Checks that the parts of a variant's recipe work together, and that each modifier changes the
/// game. Otherwise, two recipes would describe the same game. `build` builds the variant of a
/// recipe without these checks.
pub(crate) fn check_rules(
    variant: &Variant,
    build: impl Fn(&str) -> Result<Variant>,
) -> Result<()> {
    let v = variant;
    let recipe = &v.recipe;
    let has_rank_clue_rule =
        v.special_rank_all_clue_ranks || v.special_rank_no_clue_ranks || v.special_rank_deceptive;
    for (broken, problem) in [
        (
            v.sudoku && v.has_reversed_suits(),
            "Sudoku cannot have reversed suits or Up or Down",
        ),
        (
            v.up_or_down && v.suits.iter().any(|suit| suit.reversed),
            "In Up or Down, a reversed suit is the same as a normal one",
        ),
        (
            v.clue_colors.is_empty() && v.clue_ranks.is_empty(),
            "There are no clues to give",
        ),
        (
            v.alternating_clues && (v.clue_colors.is_empty() || v.clue_ranks.is_empty()),
            "Alternating Clues needs color clues and rank clues",
        ),
        (
            v.synesthesia && v.color_clues_touch_nothing,
            "Synesthesia needs color clues that touch cards",
        ),
        (
            v.rank_clues_touch_nothing && (v.odds_and_evens || has_rank_clue_rule),
            "Rank clues touch nothing, so a rule for which cards they touch changes nothing",
        ),
        (
            (v.funnels || v.chimneys) && (v.odds_and_evens || has_rank_clue_rule),
            "Funnels and Chimneys decide which cards a rank clue touches, so no other rule may",
        ),
    ] {
        ensure!(!broken, "Recipe \"{recipe}\": {problem}.");
    }

    // The modifiers come after the suits, and none of them contains the separator.
    let tokens: Vec<&str> = recipe.split(RECIPE_MODIFIER_SEPARATOR).collect();
    let behavior = Behavior::of(v);
    for index in 1..tokens.len() {
        let without = tokens
            .iter()
            .enumerate()
            .filter(|&(other, _)| other != index)
            .map(|(_, token)| *token)
            .collect::<Vec<_>>()
            .join(RECIPE_MODIFIER_SEPARATOR);
        if build(&without).is_ok_and(|other| Behavior::of(&other) == behavior) {
            bail!(
                "Recipe \"{recipe}\": \"{}\" changes nothing.",
                tokens[index]
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_recipes_whose_modifiers_conflict_or_do_not_exist() -> Result<()> {
        let suits = RecipeSuits::new(&crate::catalog::suits_by_id())?;
        assert!(catalog_fields("r-g-b_1ra_cb_nb", &suits).is_ok());
        for recipe in [
            // Each sets the clue ranks, so the result would depend on which one wins.
            "r-g-b_1pi_nm",
            "r-g-b_oe_syn",
            "r-g-b_nm_syn",
            // Black is not touched in a special way, and dark suits are not rank modifiers.
            "r-g-b_1bk",
            "r-g-b_1x",
            // There is no dark Red.
            "r.dark-g-b",
            "r-g-b-x",
            // A suit may appear once, even with other flags.
            "r-g-r",
            "r-g-b-ra-ra.dark",
            // A Sudoku stack has one rank for each suit, and there are only five ranks.
            "r-y-g-b-p-ra_sudoku",
        ] {
            assert!(
                catalog_fields(recipe, &suits).is_err(),
                "{recipe} was accepted"
            );
        }
        Ok(())
    }
    #[test]
    fn rejects_parts_that_break_the_game_or_change_nothing() {
        for recipe in [
            "r-y-g-b-p_1ra_hole",
            "r-y-g-b-p.rev_1scarce",
            "r-y-g-b-p_cb_nb",
            "r-y-g-b-ra_4crit_updown_hole",
            "r-y-g-b-p_starved_alt_duck_funnels",
            "r-y-g-b_sudoku",
        ] {
            if let Err(error) = crate::variant_from_recipe(recipe, 0, recipe) {
                panic!("{recipe} was rejected: {error}");
            }
        }
        for (recipe, problem) in [
            // Sudoku plays each stack up from any rank, so it cannot play one down.
            ("r-y-g-b-p.rev_sudoku", "Sudoku cannot"),
            ("r-y-g-b-p_updown_sudoku", "Sudoku cannot"),
            // Up or Down plays every suit both ways.
            ("r-y-g-b-p.rev_updown", "In Up or Down"),
            ("r-y-g-b-p_cm_nm", "no clues"),
            ("r-y-g-b-p_nm_alt", "Alternating Clues"),
            ("r-y-g-b-p_cb_syn", "Synesthesia"),
            ("r-y-g-b-p_nb_oe", "Rank clues touch nothing"),
            ("r-y-g-b-p_1pi_nb", "Rank clues touch nothing"),
            ("r-y-g-b-p_oe_funnels", "Funnels and Chimneys"),
            ("r-y-g-b-p_1de_chimneys", "Funnels and Chimneys"),
            ("r-y-g-b-p_funnels_chimneys", "\"chimneys\" changes nothing"),
            ("r-y-g-b-p_cowpig_duck", "\"cowpig\" changes nothing"),
            ("r-y-g-b-p_cb_cm", "\"cb\" changes nothing"),
            ("r-y-g-b-p_1scarce_updown", "\"1scarce\" changes nothing"),
            // Each dark suit already has one copy of each card.
            ("ra.dark-pi.dark-wh.dark_4crit", "\"4crit\" changes nothing"),
            // A Sudoku stack of four suits has no fives.
            ("r-y-g-b_5ra_sudoku", "\"5ra\" changes nothing"),
        ] {
            let error = crate::variant_from_recipe(recipe, 0, recipe)
                .err()
                .unwrap_or_else(|| panic!("{recipe} was accepted"));
            assert!(error.to_string().contains(problem), "{recipe}: {error}");
        }
    }
}
