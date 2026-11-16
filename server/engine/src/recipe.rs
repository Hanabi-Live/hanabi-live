//! Builds a variant's catalog entry from its recipe. `hanabi_protocol::Recipe` reads the text; this
//! module looks up its suits and applies its modifiers.

use crate::catalog::Suit;
use anyhow::{Result, anyhow, bail, ensure};
use hanabi_protocol::{
    EVEN_RANK_CLUE, MAX_RANK, MIN_RANK, ODD_RANK_CLUE, RECIPE_CRITICAL_RANK, RECIPE_DECEPTIVE_RANK,
    RECIPE_SCARCE_RANK, RECIPE_SUIT_FLAG_SEPARATOR, RankRule, Recipe, RecipeFlag, SuitFlag,
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
        ] {
            assert!(
                catalog_fields(recipe, &suits).is_err(),
                "{recipe} was accepted"
            );
        }
        Ok(())
    }
}
