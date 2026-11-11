//! The game catalog: the records of variants, suits, colors, and characters.

#[cfg_attr(
    not(test),
    expect(
        clippy::wildcard_imports,
        reason = "the payloads use the crate's shared constants, types, and schema helpers"
    )
)]
use super::*;

// The game catalog: the checked-in files in `packages/game/src/json`, which the client bundles and
// the server embeds. Each side derives its own variant model from these records.

/// Catalog flags are either set to true or omitted; an explicit false is rejected.
#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde passes skipped fields by reference"
)]
fn is_false(value: &bool) -> bool {
    !*value
}

/// An entry in `colors.json`.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogColor {
    #[schemars(length(min = 1))]
    pub name: String,
    /// If not specified, assume that it is the first letter of the color.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1, max = 1))]
    pub abbreviation: Option<String>,
    #[schemars(length(min = 1))]
    pub fill: String,
    /// An alternate fill when "Colorblind Mode" is enabled. If not specified, assume that it is the
    /// same as the default fill.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub fill_colorblind: Option<String>,
}

/// An entry in `suits.json`. This is similar to `Suit`, but it only has primitive types.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogSuit {
    // --------------------
    // Mandatory properties
    // --------------------
    #[schemars(length(min = 1))]
    pub name: String,
    /// The suit ID is a two character string:
    /// - Normal suits have a single capital letter. (e.g. "R" for "Red")
    /// - Special suits have a two character ID with a lowercase letter. (e.g. "Bk" for "Black")
    /// - Combination suits have a four character ID. (e.g. `BrRa` for "Muddy Rainbow")
    /// - Dark suits have a capital D prefix. (e.g. `DRa` for "Dark Rainbow")
    /// - Ambiguous suits have a capital A prefix and a number suffix. (e.g. AR1 for "Tomato")
    /// - Very Ambiguous suits have a capital V prefix and a number suffix. (e.g. "VR1" for "Tomato
    ///   VA")
    /// - Extremely Ambiguous suits have a capital E prefix and a number suffix. (e.g. "EB1" for "Ice
    ///   EA")
    /// - Dual-Color suits have a capital D prefix. (e.g. "DRY" for "Tangerine D")
    #[schemars(length(min = 1))]
    pub id: String,
    /// The symbol that represents this suit: a pip name, "auto", or "none".
    #[schemars(length(min = 1))]
    pub pip: String,
    // -------------------
    // Optional properties
    // -------------------
    /// The one letter abbreviation to use when representing this suit as a card note. If not
    /// specified, use the abbreviation of the color with the same name, or else the first letter of
    /// the suit.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1, max = 1))]
    pub abbreviation: Option<String>,
    /// Whether or not to create variant combinations based on this suit.
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub create_variants: bool,
    /// A simplified version of the suit name to show to end-users. If not specified, use the normal
    /// suit name.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub display_name: Option<String>,
    /// The background color of cards of the suit.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub fill: Option<String>,
    /// Allows for a gradient of different colors.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(length(min = 1))]
    pub fill_colors: Option<Vec<String>>,
    // -----------------------------------------
    // Optional gameplay modification properties
    // -----------------------------------------
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub one_of_each: bool,
    /// The colors that touch this suit. When omitted, the color with the suit's name does.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clue_colors: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub all_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub no_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub all_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub no_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub prism: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub inverted: bool,
}

/// An entry in `variants.json`. This is similar to `Variant`, but it only has primitive types.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogVariant {
    /// A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1, and so
    /// on. The database and seeds name a variant by this number.
    pub id: VariantId,
    /// The variant's suits and modifiers, from which the catalog generator checks the entry. For
    /// example, "No Variant" is `R+Y+G+B+P`.
    #[schemars(length(min = 1))]
    pub new_id: String,
    #[schemars(length(min = 1))]
    pub name: String,
    /// Suit names, which may end in " Reversed".
    #[schemars(length(min = 1))]
    pub suits: Vec<String>,
    /// The colors that players can clue. When omitted, the suits' clue colors.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clue_colors: Option<Vec<String>>,
    /// The ranks that players can clue. When omitted, 1 through 5.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub clue_ranks: Option<Vec<RankClueNumber>>,
    /// The number of cards in each stack. When omitted, 5.
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schemars(extend("enum" = explicit_stack_sizes()))]
    pub stack_size: Option<u8>,
    // The following properties are listed in order of how they appear in "variants.md".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub special_rank: Option<CardRank>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_all_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_all_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_no_clue_colors: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_no_clue_ranks: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub special_rank_deceptive: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub critical_rank: Option<CardRank>,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub scarce_ones: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub clue_starved: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub color_clues_touch_nothing: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub rank_clues_touch_nothing: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub alternating_clues: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub cow_and_pig: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub duck: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub odds_and_evens: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub synesthesia: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub up_or_down: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub throw_it_in_a_hole: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub funnels: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub chimneys: bool,
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub sudoku: bool,
}

/// An entry in `characters.json`: a detrimental character.
#[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogCharacter {
    #[schemars(length(min = 1))]
    pub name: String,
    /// The first character has an ID of 0.
    pub id: CharacterId,
    #[schemars(length(min = 1))]
    pub description: String,
    #[schemars(length(min = 1))]
    pub emoji: String,
    /// Whether the character's random color or rank is stored with the game.
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub write_metadata_to_database: bool,
    /// Excluded from two-player games.
    #[serde(default, skip_serializing_if = "is_false")]
    #[schemars(extend("const" = true))]
    pub not_two_player: bool,
}
