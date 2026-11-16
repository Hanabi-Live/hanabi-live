//! The recipe of a variant: the text that names its suits and modifiers, such as `r-y-g-b-p-ra_1pi`.
//!
//! Each variant has exactly one recipe. The parser rejects every other spelling of the same
//! variant, such as modifiers in another order, so that two recipes never mean the same variant.
//! The engine turns a recipe into the variant's rules; this module only reads and writes the text.
//!
//! The grammar:
//!
//! ```text
//! recipe   = suits ( "_" modifier )*
//! suits    = suit ( "-" suit )*
//! suit     = suitId ( "." suitFlag )*      such as "ra", "ra.dark", or "ra.rev"
//! modifier = rank code                     such as "1pi", "5de", "4crit", or "1scarce"
//!          | flag                          such as "cb" or "sudoku"
//! ```
//!
//! Suit IDs and codes are lowercase letters, and ranks are digits, so a recipe needs no encoding in
//! a URL.

use crate::{MAX_RANK, MAX_SUITS, MIN_RANK};
use anyhow::{Context, Result, bail, ensure};
use std::fmt;

named_enum! {
    /// A flag after a suit ID, in the order that a recipe writes them. `dark` names the dark
    /// version of the suit, which has one copy of each card. `rev` plays the suit from 5 down to 1.
    pub enum SuitFlag {
        Dark => "dark",
        Reversed => "rev",
    }
}

named_enum! {
    /// A modifier of a variant that takes no rank, in the order that a recipe writes them.
    pub enum RecipeFlag {
        ClueStarved => "starved",
        ColorBlind => "cb",
        NumberBlind => "nb",
        ColorMute => "cm",
        NumberMute => "nm",
        AlternatingClues => "alt",
        CowAndPig => "cowpig",
        Duck => "duck",
        OddsAndEvens => "oe",
        Synesthesia => "syn",
        UpOrDown => "updown",
        ThrowItInAHole => "hole",
        Funnels => "funnels",
        Chimneys => "chimneys",
        Sudoku => "sudoku",
    }
}

/// What a rank modifier does to the cards of its rank.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RankRule {
    /// Clues touch the rank like they touch the suit with this ID, such as `ra` for Rainbow.
    Suit(String),
    /// A rank clue does not touch the rank, but each other rank clue does.
    Deceptive,
    /// The rank has one copy in each suit.
    Critical,
    /// The rank has as many copies as the other ranks.
    Scarce,
}

impl RankRule {
    /// The rules in the order that a recipe writes them. A variant has at most one special rank,
    /// which is a `Suit` or `Deceptive` rule.
    const fn order(&self) -> u8 {
        match self {
            Self::Suit(_) | Self::Deceptive => 0,
            Self::Critical => 1,
            Self::Scarce => 2,
        }
    }

    fn code(&self) -> &str {
        match self {
            Self::Suit(id) => id,
            Self::Deceptive => crate::RECIPE_DECEPTIVE_RANK,
            Self::Critical => crate::RECIPE_CRITICAL_RANK,
            Self::Scarce => crate::RECIPE_SCARCE_RANK,
        }
    }

    fn from_code(code: &str) -> Self {
        match code {
            crate::RECIPE_DECEPTIVE_RANK => Self::Deceptive,
            crate::RECIPE_CRITICAL_RANK => Self::Critical,
            crate::RECIPE_SCARCE_RANK => Self::Scarce,
            id => Self::Suit(id.to_owned()),
        }
    }
}

/// A suit of a recipe.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RecipeSuit {
    pub id: String,
    pub flags: Vec<SuitFlag>,
}

/// A modifier that applies to one rank.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RankModifier {
    pub rank: i32,
    pub rule: RankRule,
}

/// A parsed recipe, which writes itself back as the same text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Recipe {
    pub suits: Vec<RecipeSuit>,
    pub ranks: Vec<RankModifier>,
    pub flags: Vec<RecipeFlag>,
}

/// Whether `text` is a non-empty run of lowercase ASCII letters.
fn is_word(text: &str) -> bool {
    !text.is_empty() && text.bytes().all(|byte| byte.is_ascii_lowercase())
}

/// Checks that `keys` only increase, so that each item appears once and in the written order.
fn ensure_in_order<T: PartialOrd>(keys: &[T], what: &str, recipe: &str) -> Result<()> {
    ensure!(
        keys.windows(2).all(|pair| pair[0] < pair[1]),
        "The {what} of recipe \"{recipe}\" repeat or are out of order"
    );
    Ok(())
}

fn index_of<T: PartialEq>(all: &[T], item: &T) -> usize {
    all.iter()
        .position(|member| member == item)
        .expect("ALL lists every member")
}

fn parse_suit(token: &str, recipe: &str) -> Result<RecipeSuit> {
    let mut parts = token.split(crate::RECIPE_SUIT_FLAG_SEPARATOR);
    let id = parts.next().unwrap_or_default();
    ensure!(
        is_word(id),
        "Recipe \"{recipe}\" has a suit ID that is not lowercase letters: \"{id}\""
    );
    let flags = parts
        .map(|flag| {
            SuitFlag::from_name(flag).ok_or_else(|| {
                anyhow::anyhow!("Recipe \"{recipe}\" has an unknown suit flag: \"{flag}\"")
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let order: Vec<usize> = flags
        .iter()
        .map(|flag| index_of(SuitFlag::ALL, flag))
        .collect();
    ensure_in_order(&order, &format!("flags of suit \"{id}\""), recipe)?;
    Ok(RecipeSuit {
        id: id.to_owned(),
        flags,
    })
}

fn parse_rank_modifier(token: &str, recipe: &str) -> Result<RankModifier> {
    let code_start = token
        .find(|character: char| !character.is_ascii_digit())
        .unwrap_or(token.len());
    let (digits, code) = token.split_at(code_start);
    ensure!(
        is_word(code),
        "Recipe \"{recipe}\" has a rank modifier without a code: \"{token}\""
    );
    let rank: i32 = digits.parse().with_context(|| {
        format!("Recipe \"{recipe}\" has a rank that is too large: \"{token}\"")
    })?;
    ensure!(
        rank.to_string() == digits && (MIN_RANK..=MAX_RANK).contains(&rank),
        "Recipe \"{recipe}\" has a rank modifier whose rank is not {MIN_RANK} to {MAX_RANK}: \"{token}\""
    );
    let rule = RankRule::from_code(code);
    ensure!(
        rule != RankRule::Scarce || rank == MIN_RANK,
        "Recipe \"{recipe}\" has a scarce rank other than {MIN_RANK}: \"{token}\""
    );
    Ok(RankModifier { rank, rule })
}

impl std::str::FromStr for Recipe {
    type Err = anyhow::Error;

    fn from_str(recipe: &str) -> Result<Self> {
        let mut tokens = recipe.split(crate::RECIPE_MODIFIER_SEPARATOR);
        let suits = tokens
            .next()
            .unwrap_or_default()
            .split(crate::RECIPE_SUIT_SEPARATOR)
            .map(|token| parse_suit(token, recipe))
            .collect::<Result<Vec<_>>>()?;
        ensure!(
            suits.len() <= MAX_SUITS,
            "Recipe \"{recipe}\" has more than {MAX_SUITS} suits"
        );

        let mut ranks = Vec::new();
        let mut flags = Vec::new();
        for token in tokens {
            if token.starts_with(|character: char| character.is_ascii_digit()) {
                ensure!(
                    flags.is_empty(),
                    "Recipe \"{recipe}\" has a rank modifier after a flag: \"{token}\""
                );
                ranks.push(parse_rank_modifier(token, recipe)?);
            } else if let Some(flag) = RecipeFlag::from_name(token) {
                flags.push(flag);
            } else {
                bail!("Recipe \"{recipe}\" has an unknown modifier: \"{token}\"");
            }
        }
        let rank_order: Vec<u8> = ranks.iter().map(|modifier| modifier.rule.order()).collect();
        ensure_in_order(&rank_order, "rank modifiers", recipe)?;
        let flag_order: Vec<usize> = flags
            .iter()
            .map(|flag| index_of(RecipeFlag::ALL, flag))
            .collect();
        ensure_in_order(&flag_order, "flags", recipe)?;

        Ok(Self {
            suits,
            ranks,
            flags,
        })
    }
}

impl fmt::Display for Recipe {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (index, suit) in self.suits.iter().enumerate() {
            if index > 0 {
                formatter.write_str(crate::RECIPE_SUIT_SEPARATOR)?;
            }
            formatter.write_str(&suit.id)?;
            for flag in &suit.flags {
                write!(
                    formatter,
                    "{}{}",
                    crate::RECIPE_SUIT_FLAG_SEPARATOR,
                    flag.name()
                )?;
            }
        }
        for modifier in &self.ranks {
            write!(
                formatter,
                "{}{}{}",
                crate::RECIPE_MODIFIER_SEPARATOR,
                modifier.rank,
                modifier.rule.code()
            )?;
        }
        for flag in &self.flags {
            write!(
                formatter,
                "{}{}",
                crate::RECIPE_MODIFIER_SEPARATOR,
                flag.name()
            )?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(recipe: &str) -> Result<Recipe> {
        recipe.parse()
    }

    #[test]
    fn writes_each_recipe_back_unchanged() -> Result<()> {
        for recipe in [
            "r-y-g-b-p",
            "r-y-g-b-ra.rev",
            "r-y-g-b-p-ra.dark",
            "r-y-g-b-p-ra_1pi",
            "r-g-b-wh_5de_4crit_1scarce_starved_cb_nb_sudoku",
        ] {
            assert_eq!(parse(recipe)?.to_string(), recipe);
        }
        Ok(())
    }

    #[test]
    fn rejects_other_spellings_of_a_variant() {
        for recipe in [
            // Modifiers out of order, or repeated.
            "r-y-g_nb_cb",
            "r-y-g_cb_cb",
            "r-y-g_4crit_1pi",
            "r-y-g_1pi_2ra",
            "r-y-g_cb_1pi",
            "r-y-g-ra.rev.dark",
            "r-y-g-ra.dark.dark",
            // A rank written with a leading zero.
            "r-y-g_01pi",
        ] {
            assert!(parse(recipe).is_err(), "{recipe} was accepted");
        }
    }

    #[test]
    fn rejects_malformed_recipes() {
        for recipe in [
            "",
            "r--y",
            "r-y_",
            "R-Y",
            "r+y",
            "r-y_tb",
            "r-y.bright",
            "r-y_6pi",
            "r-y_0pi",
            "r-y_1",
            "r-y_2scarce",
            "r-y-g-b-p-t-bk",
        ] {
            assert!(parse(recipe).is_err(), "{recipe} was accepted");
        }
    }
}
