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

/// Defines an entry of a catalog file. A field written `flag name,` is a flag: either `true` or
/// omitted, so an explicit `false` is rejected.
macro_rules! catalog_entry {
    ($(#[$meta:meta])* pub struct $name:ident { $($body:tt)* }) => {
        catalog_entry!(@fields [$(#[$meta])* pub struct $name] [] $($body)*);
    };
    (@fields $head:tt [$($done:tt)*] $(#[doc = $doc:literal])* flag $field:ident, $($rest:tt)*) => {
        catalog_entry!(@fields $head [
            $($done)*
            $(#[doc = $doc])*
            #[serde(default, skip_serializing_if = "is_false")]
            #[schemars(extend("const" = true))]
            pub $field: bool,
        ] $($rest)*);
    };
    (@fields $head:tt [$($done:tt)*] $(#[$attr:meta])* pub $field:ident: $ty:ty, $($rest:tt)*) => {
        catalog_entry!(@fields $head [$($done)* $(#[$attr])* pub $field: $ty,] $($rest)*);
    };
    (@fields [$($head:tt)*] [$($done:tt)*]) => {
        $($head)* { $($done)* }
    };
}

catalog_entry! {
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
        /// An alternate fill when "Colorblind Mode" is enabled. If not specified, assume that it is
        /// the same as the default fill.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schemars(length(min = 1))]
        pub fill_colorblind: Option<String>,
    }
}

catalog_entry! {
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
        /// - Very Ambiguous suits have a capital V prefix and a number suffix. (e.g. "VR1" for
        ///   "Tomato VA")
        /// - Extremely Ambiguous suits have a capital E prefix and a number suffix. (e.g. "EB1" for
        ///   "Ice EA")
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
        /// specified, use the abbreviation of the color with the same name, or else the first
        /// letter of the suit.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schemars(length(min = 1, max = 1))]
        pub abbreviation: Option<String>,
        /// Whether or not to create variant combinations based on this suit.
        flag create_variants,
        /// A simplified version of the suit name to show to end-users. If not specified, use the
        /// normal suit name.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schemars(length(min = 1))]
        pub display_name: Option<String>,
        /// The background color of cards of the suit. A suit with `fill_colors` has none.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schemars(length(min = 1))]
        pub fill: Option<String>,
        /// The colors of a gradient background, used instead of `fill`.
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schemars(length(min = 2))]
        pub fill_colors: Option<Vec<String>>,
        // -----------------------------------------
        // Optional gameplay modification properties
        // -----------------------------------------
        flag one_of_each,
        /// The colors that touch this suit. When omitted, the color with the suit's name does.
        #[serde(skip_serializing_if = "Option::is_none")]
        pub clue_colors: Option<Vec<String>>,
        flag all_clue_colors,
        flag no_clue_colors,
        flag all_clue_ranks,
        flag no_clue_ranks,
        flag prism,
        flag inverted,
    }
}

catalog_entry! {
    /// An entry in `variants.json`. This is similar to `Variant`, but it only has primitive types.
    #[derive(Clone, Debug, Serialize, Deserialize, JsonSchema)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    pub struct CatalogVariant {
        /// A number from 0 to N. For example, "No Variant" is variant 0, "6 Suits" is variant 1,
        /// and so on. The database and seeds name a variant by this number.
        pub id: VariantId,
        /// The variant's suits and modifiers, from which the catalog generator checks the entry.
        /// For example, "No Variant" is `R+Y+G+B+P`.
        #[schemars(length(min = 1))]
        pub recipe: String,
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
        pub clue_ranks: Option<Vec<ClueRank>>,
        /// The number of cards in each stack. When omitted, 5.
        #[serde(skip_serializing_if = "Option::is_none")]
        pub stack_size: Option<StackSize>,
        // The following properties are listed in order of how they appear in "variants.md".
        #[serde(skip_serializing_if = "Option::is_none")]
        pub special_rank: Option<CardRank>,
        flag special_rank_all_clue_colors,
        flag special_rank_all_clue_ranks,
        flag special_rank_no_clue_colors,
        flag special_rank_no_clue_ranks,
        flag special_rank_deceptive,
        #[serde(skip_serializing_if = "Option::is_none")]
        pub critical_rank: Option<CardRank>,
        flag scarce_ones,
        flag clue_starved,
        flag color_clues_touch_nothing,
        flag rank_clues_touch_nothing,
        flag alternating_clues,
        flag cow_and_pig,
        flag duck,
        flag odds_and_evens,
        flag synesthesia,
        flag up_or_down,
        flag throw_it_in_a_hole,
        flag funnels,
        flag chimneys,
        flag sudoku,
    }
}

catalog_entry! {
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
        /// Excluded from two-player games.
        flag not_two_player,
    }
}
