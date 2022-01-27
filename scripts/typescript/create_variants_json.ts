import path = require("path");
import fs = require("fs");

const SUIT_REVERSED_SUFFIX = " Reversed";

type Variant = {
  name: string;
  id: number;
  suits: string[];
  specialRank?: number;
  specialAllClueColors?: boolean;
  specialAllClueRanks?: boolean;
  specialNoClueColors?: boolean;
  specialNoClueRanks?: boolean;
  specialDeceptive?: boolean;
  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;
  showSuitNames?: boolean;
  oddsAndEvens?: boolean;
  clueColors?: string[];
  clueRanks?: number[];
};

type Suit = {
  name: string;
  abbreviation?: string;
  fill?: string;
  pip?: string;
  clueColors?: string[];
  fillColors?: string[];
  createVariants?: boolean;
  oneOfEach?: boolean;
  allClueColors?: boolean;
  allClueRanks?: boolean;
  noClueColors?: boolean;
  noClueRanks?: boolean;
  prism?: boolean;
  displayName?: string;
};

type Property =
  | "allClueColors"
  | "allClueRanks"
  | "noClueColors"
  | "noClueRanks";

type SpecialProperty =
  | "specialAllClueColors"
  | "specialAllClueRanks"
  | "specialNoClueColors"
  | "specialNoClueRanks";

const specialProperties: Property[] = [
  "allClueColors",
  "allClueRanks",
  "noClueColors",
  "noClueRanks",
];

const suits_that_cause_duplicated_variants_with_ambiguous = [
  "Rainbow",
  "Prism",
  "Dark Prism", // This is the same as Dark Rainbow,
];

// Read the old json files
const [suits_path, variants_path, text_path] = getPaths();
const old_variants_array = readVariantsFromJson(variants_path);
const suits_array = readSuitsFromJson(suits_path);

// Create some maps for the old variants
const old_variants_name_to_id_map = new Map<string, number>();
const old_variants_id_to_name_map = new Map<number, string>();

setOldVariantsIDToNameMap();

// Convert the suits array to a map and add default values
const suits = convertSuitsArrayToMap();

// Start to build all of the variants
const variants: Variant[] = [];
let current_variant_id = -1;

// Create variant suits
const variant_suits = createVariantSuits();

variants.push(
  ...createBasicVariants(),
  ...getVariantsForEachSuit(),
  ...getVariantsForEachSpecialSuitCombination(),
  ...getVariantsForSpecialRanks(),
  ...getAmbiguousVariants(),
  ...getVeryAmbiguousVariants(),
  ...getExtremelyAmbiguousVariants(),
  ...getDualColorsVariants(),
  ...getSpecialCraftedMixedVariants(),
  ...getBlindVariants(),
  ...getMuteVariants(),
  ...getAlternatingCluesVariants(),
  ...getClueStarvedVariants(),
  ...getCowAndPigVariants(),
  ...getDuckVariants(),
  ...getThrowItInAHoleVariants(),
  ...getReversedVariants(),
  ...getUpOrDownVariants(),
  ...getSynesthesiaVariants(),
  ...getCriticalFoursVariants(),
  ...getOddsAndEvensVariants(),
);

if (checkForMissingVariants()) {
  showErrorAndExit(
    'Skipping the creation of a new "variant.json" file since there were missing variants.',
  );
}

createVariantJSONFile(variants_path);
createVariantsTextFile(text_path);

function get_variant_id(variant_name: string): number {
  // First, prefer the old (existing) variant ID, if present
  const id = old_variants_name_to_id_map.get(variant_name);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID
  let found = false;
  while (!found) {
    current_variant_id += 1;
    const variant = old_variants_array.find((v) => v.id === current_variant_id);
    if (variant === undefined) {
      break;
    }
  }
  return current_variant_id;
}

function showErrorAndExit(message: string) {
  console.error(message);
  process.exit(1);
}

function getSpecialProperty(property: Property): SpecialProperty {
  switch (property) {
    case "allClueColors":
      return "specialAllClueColors";
    case "allClueRanks":
      return "specialAllClueRanks";
    case "noClueColors":
      return "specialNoClueColors";
    case "noClueRanks":
      return "specialNoClueRanks";
  }
}

// Helper functions
function getPaths(): string[] {
  const dir_path = __dirname;
  const repo_root_path = path.join(dir_path, "..", "..");
  const json_path = path.join(
    repo_root_path,
    "packages",
    "data",
    "src",
    "json",
  );
  const suits_path = path.join(json_path, "suits.json");
  const variants_path = path.join(json_path, "variants.json");
  const text_path = path.join(repo_root_path, "misc", "variants.txt");

  return [suits_path, variants_path, text_path];
}

function readVariantsFromJson(path: string): Variant[] {
  const data = fs.readFileSync(path, "utf-8");
  return JSON.parse(data);
}

function readSuitsFromJson(path: string): Suit[] {
  const data = fs.readFileSync(path, "utf-8");
  return JSON.parse(data);
}

function setOldVariantsIDToNameMap() {
  old_variants_array.forEach((variant) => {
    if (variant.name === undefined) {
      showErrorAndExit(
        'One of the variants in the "variants.json" file does not have a name.',
      );
    }

    if (variant.id === undefined) {
      showErrorAndExit(
        `The variant of "${variant["name"]}" does not have an "id" field.`,
      );
    }

    if (old_variants_name_to_id_map.get(variant.name) !== undefined) {
      showErrorAndExit(
        `The old "variants.json" file has a duplicate variant name of: ${variant["name"]}`,
      );
    }

    old_variants_name_to_id_map.set(variant.name, variant.id);

    if (old_variants_id_to_name_map.get(variant.id) !== undefined) {
      showErrorAndExit(
        `The old "variants.json" file has a duplicate ID of: ${variant["id"]}`,
      );
    }

    old_variants_id_to_name_map.set(variant.id, variant.name);
  });
}

function convertSuitsArrayToMap(): Map<string, Suit> {
  const suits = new Map<string, Suit>();
  suits_array.forEach((suit) => {
    if (suit.createVariants === undefined) {
      suit.createVariants = false;
    }
    if (suit.oneOfEach === undefined) {
      suit.oneOfEach = false;
    }
    if (suit.allClueColors === undefined) {
      suit.allClueColors = false;
    }
    if (suit.allClueRanks === undefined) {
      suit.allClueRanks = false;
    }
    if (suit.noClueColors === undefined) {
      suit.noClueColors = false;
    }
    if (suit.noClueRanks === undefined) {
      suit.noClueRanks = false;
    }
    if (suit.prism === undefined) {
      suit.prism = false;
    }
    suits.set(suit.name, suit);
  });
  return suits;
}

function createVariantSuits(): string[][] {
  const variant_suits: string[][] = [];
  variant_suits[1] = ["Red"];
  variant_suits[2] = [...variant_suits[1], "Blue"];
  variant_suits[3] = [...variant_suits[2]];
  // Green is inserted before Blue to keep the colors in "rainbow" order
  variant_suits[3].splice(1, 0, "Green");
  variant_suits[4] = [...variant_suits[3]];
  // Yellow is inserted before Green to keep the colors in "rainbow" order
  variant_suits[4].splice(1, 0, "Yellow");
  variant_suits[5] = [...variant_suits[4], "Purple"];
  variant_suits[6] = [...variant_suits[5], "Teal"];
  return variant_suits;
}

function createBasicVariants(): Variant[] {
  const variants: Variant[] = [];
  variants.push({
    name: "No Variant",
    id: get_variant_id("No Variant"),
    suits: variant_suits[5],
  });

  variants.push({
    name: "6 Suits",
    id: get_variant_id("6 Suits"),
    suits: variant_suits[6],
  });

  variants.push({
    name: "4 Suits",
    id: get_variant_id("4 Suits"),
    suits: variant_suits[4],
  });

  variants.push({
    name: "3 Suits",
    id: get_variant_id("3 Suits"),
    suits: variant_suits[3],
  });

  return variants;
}

function getVariantsForEachSuit(): Variant[] {
  const variants: Variant[] = [];
  suits.forEach((suit, suit_name) => {
    // We only want to create variants for certain suits
    // (e.g. "Red" does not get its own variants because it is a basic suit)
    if (suit.createVariants) {
      [6, 5, 4, 3].forEach((suit_num) => {
        // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
        // one-of-each suit
        if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach) {
          return;
        }

        const variant_name = suit_name + " (" + suit_num.toString() + " Suits)";
        const computed_variant_suits = [
          ...variant_suits[suit_num - 1],
          suit_name,
        ];
        variants.push({
          name: variant_name,
          id: get_variant_id(variant_name),
          suits: computed_variant_suits,
        });
      });
    }
  });
  return variants;
}

function getVariantsForEachSpecialSuitCombination(): Variant[] {
  const variants: Variant[] = [];
  const combination_map = new Map<string, boolean>();
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    suits.forEach((suit2, suit_name2) => {
      if (!suit2.createVariants) {
        return;
      }

      if (suit_name === suit_name2) {
        return;
      }

      if (
        suit.allClueColors === suit2.allClueColors &&
        suit.allClueRanks === suit2.allClueRanks &&
        suit.noClueColors === suit2.noClueColors &&
        suit.noClueRanks === suit2.noClueRanks &&
        suit.prism === suit2.prism
      ) {
        return;
      }

      if (
        combination_map.has(suit_name + suit_name2) ||
        combination_map.has(suit_name2 + suit_name)
      ) {
        return;
      }

      combination_map.set(suit_name + suit_name2, true);

      [6, 5, 4, 3].forEach((suit_num) => {
        // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
        // one-of-each suit
        if (
          (suit_num == 4 || suit_num == 3) &&
          (suit.oneOfEach || suit2.oneOfEach)
        ) {
          return;
        }

        // It would be too difficult to have a 5 suit variant with two one-of-each suits
        if (suit_num === 5 && suit.oneOfEach && suit2.oneOfEach) {
          return;
        }

        const variant_name = `${suit_name} & ${suit_name2} (${suit_num} Suits)`;
        const computed_variant_suits = [...variant_suits[suit_num - 2]];
        computed_variant_suits.push(suit_name);
        computed_variant_suits.push(suit_name2);
        variants.push({
          name: variant_name,
          id: get_variant_id(variant_name),
          suits: computed_variant_suits,
        });
      });
    });
  });
  return variants;
}

function getVariantsForSpecialRanks(): Variant[] {
  const variants: Variant[] = [];
  [1, 5].forEach((special_rank) => {
    let word = "";
    if (special_rank === 1) {
      word = "Ones";
    } else if (special_rank === 5) {
      word = "Fives";
    }

    suits.forEach((suit, suit_name) => {
      if (!suit.createVariants) {
        return;
      }

      // There are no one-of-each special ranks (e.g. Black-Ones)
      if (suit.oneOfEach) {
        return;
      }

      // There are no prism special ranks (e.g. Prism-Ones)
      if (suit.prism) {
        return;
      }

      // First, create "Rainbow-Ones (6 Suits)", etc.
      [6, 5, 4, 3].forEach((suit_num) => {
        const hyphenated_suit_name = suit_name.replace(" ", "-");
        const variant_name =
          hyphenated_suit_name +
          "-" +
          word +
          " (" +
          suit_num.toString() +
          " Suits)";
        const computed_variant_suits = [...variant_suits[suit_num]];
        const variant: Variant = {
          name: variant_name,
          id: get_variant_id(variant_name),
          suits: computed_variant_suits,
          specialRank: special_rank,
        };

        specialProperties.forEach((special_property) => {
          if (suit[special_property]) {
            const special_property_name = getSpecialProperty(special_property);
            variant[special_property_name] = true;
          }
        });

        if (suit.allClueRanks || suit.noClueRanks) {
          const clue_ranks = [1, 2, 3, 4, 5].filter(
            (item) => item !== special_rank,
          );
          variant.clueRanks = clue_ranks;
        }

        variants.push(variant);
      });

      //Second, create the special suit combinations, e.g. "Rainbow-Ones & Rainbow (6 Suits)"
      suits.forEach((suit2, suit_name2) => {
        if (!suit2.createVariants) {
          return;
        }

        [6, 5, 4, 3].forEach((suit_num) => {
          // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
          // one-of-each suit
          if ((suit_num === 4 || suit_num === 3) && suit2.oneOfEach) {
            return;
          }

          const hyphenated_suit_name = suit_name.replace(" ", "-");
          const variant_name = `${hyphenated_suit_name}-${word} & ${suit_name2} (${suit_num} Suits)`;
          const computed_variant_suits = [
            ...variant_suits[suit_num - 1],
            suit_name2,
          ];
          const variant: Variant = {
            name: variant_name,
            id: get_variant_id(variant_name),
            suits: computed_variant_suits,
            specialRank: special_rank,
          };

          specialProperties.forEach((special_property) => {
            if (suit[special_property]) {
              const special_property_name =
                getSpecialProperty(special_property);
              variant[special_property_name] = true;
            }
          });

          if (suit.allClueRanks || suit.noClueRanks) {
            const clue_ranks = [1, 2, 3, 4, 5].filter(
              (item) => item !== special_rank,
            );
            variant.clueRanks = clue_ranks;
          }

          variants.push(variant);
        });
      });
    });

    // Add variants for Deceptive-Ones and Deceptive-Fives
    const special_name = `Deceptive-${word}`;

    // First, create "Deceptive-Ones (6 Suits)", etc.
    [6, 5, 4, 3].forEach((suit_num) => {
      const variant_name = `${special_name} (${suit_num} Suits)`;
      const computed_variant_suits = [...variant_suits[suit_num]];
      const variant: Variant = {
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: computed_variant_suits,
        specialRank: special_rank,
        specialDeceptive: true,
      };

      const clue_ranks = [1, 2, 3, 4, 5].filter(
        (clue) => clue !== special_rank,
      );
      variant.clueRanks = clue_ranks;

      variants.push(variant);
    });

    // Second, create the special suit combinations, e.g. "Deceptive-Ones & Rainbow (6 Suits)"
    suits.forEach((suit, suit_name) => {
      if (!suit.createVariants) {
        return;
      }

      [6, 5, 4, 3].forEach((suit_num) => {
        // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
        // one-of-each suit
        if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach) {
          return;
        }

        const variant_name = `${special_name} & ${suit_name} (${suit_num} Suits)`;
        const computed_variant_suits = [
          ...variant_suits[suit_num - 1],
          suit_name,
        ];
        const variant: Variant = {
          name: variant_name,
          id: get_variant_id(variant_name),
          suits: computed_variant_suits,
          specialRank: special_rank,
          specialDeceptive: true,
        };

        const clue_ranks = [1, 2, 3, 4, 5].filter(
          (clue) => clue !== special_rank,
        );
        variant.clueRanks = clue_ranks;

        variants.push(variant);
      });
    });
  });

  return variants;
}

function getAmbiguousVariants(): Variant[] {
  const variants: Variant[] = [];

  const red_ambiguous_suits = ["Tomato", "Mahogany"];
  const green_ambiguous_suits = ["Lime", "Forest"];
  const blue_ambiguous_suits = ["Sky", "Navy"];
  const ambiguous_suits: string[][] = [];
  ambiguous_suits[2] = [...red_ambiguous_suits];
  ambiguous_suits[4] = [...red_ambiguous_suits, ...blue_ambiguous_suits];
  ambiguous_suits[6] = [
    ...red_ambiguous_suits,
    ...green_ambiguous_suits,
    ...blue_ambiguous_suits,
  ];

  variants.push({
    name: "Ambiguous (6 Suits)",
    id: get_variant_id("Ambiguous (6 Suits)"),
    suits: ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Ambiguous (4 Suits)",
    id: get_variant_id("Ambiguous (4 Suits)"),
    suits: ambiguous_suits[4],
    showSuitNames: true,
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    [4, 2].forEach((suit_num) => {
      const incremented_suit_num = suit_num + 1;

      // It would be too difficult to have a 3 suits variant with a one-of-each suit
      if (incremented_suit_num === 3 && suit.oneOfEach) {
        return;
      }

      // For some suits:
      // "Ambiguous & X (3 Suit)" is the same as "Very Ambiguous (3 Suit)"
      if (
        incremented_suit_num === 3 &&
        suits_that_cause_duplicated_variants_with_ambiguous.includes(suit_name)
      ) {
        return;
      }

      const variant_name = `Ambiguous & ${suit_name} (${incremented_suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...ambiguous_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getVeryAmbiguousVariants(): Variant[] {
  const variants: Variant[] = [];
  const red_very_ambiguous_suits = ["Tomato VA", "Carrot VA", "Mahogany VA"];
  const blue_very_ambiguous_suits = ["Sky VA", "Berry VA", "Navy VA"];
  const very_ambiguous_suits: string[][] = [];
  // For "Very Ambiguous (3 Suits)", we use blue suits instead of red suits so that this will align
  // better with the Extremely Ambiguous variants (Extremely Ambiguous uses blue suits because it
  // is easier to come up with suit names for blue cards than it is for red cards)
  very_ambiguous_suits[3] = [...blue_very_ambiguous_suits];
  very_ambiguous_suits[6] = [
    ...red_very_ambiguous_suits,
    ...blue_very_ambiguous_suits,
  ];

  variants.push({
    name: "Very Ambiguous (6 Suits)",
    id: get_variant_id("Very Ambiguous (6 Suits)"),
    suits: very_ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Very Ambiguous (3 Suits)",
    id: get_variant_id("Very Ambiguous (3 Suits)"),
    suits: very_ambiguous_suits[3],
    showSuitNames: true,
  });

  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    // It would be too difficult to have a 4 suit variant with a one-of-each suit
    if (suit.oneOfEach) {
      return;
    }

    // For some suits:
    // "Very Ambiguous + X (4 Suit)" is the same as "Extremely Ambiguous (4 Suit)"
    if (
      suits_that_cause_duplicated_variants_with_ambiguous.includes(suit_name)
    ) {
      return;
    }

    const variant_name = `Very Ambiguous & ${suit_name} (4 Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: [...very_ambiguous_suits[3], suit_name],
      showSuitNames: true,
    });
  });

  return variants;
}

function getExtremelyAmbiguousVariants(): Variant[] {
  const variants: Variant[] = [];
  const extremely_ambiguous_suits: string[][] = [];
  extremely_ambiguous_suits[4] = [
    "Ice EA",
    "Sapphire EA",
    "Sky EA",
    "Berry EA",
  ];
  extremely_ambiguous_suits[5] = [...extremely_ambiguous_suits[4], "Navy EA"];
  extremely_ambiguous_suits[6] = [...extremely_ambiguous_suits[5], "Ocean EA"];
  variants.push({
    name: "Extremely Ambiguous (6 Suits)",
    id: get_variant_id("Extremely Ambiguous (6 Suits)"),
    suits: extremely_ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Extremely Ambiguous (5 Suits)",
    id: get_variant_id("Extremely Ambiguous (5 Suits)"),
    suits: extremely_ambiguous_suits[5],
    showSuitNames: true,
  });
  variants.push({
    name: "Extremely Ambiguous (4 Suits)",
    id: get_variant_id("Extremely Ambiguous (4 Suits)"),
    suits: extremely_ambiguous_suits[4],
    showSuitNames: true,
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    [5, 4].forEach((suit_num) => {
      const incremented_suit_num = suit_num + 1;

      // It would be too difficult to have a 4 suit variant with a one-of-each suit
      if (incremented_suit_num === 4 && suit.oneOfEach) {
        return;
      }

      // For some suits:
      // 1) "Extremely Ambiguous + X (6 Suit)" is the same as "Extremely Ambiguous (6 Suit)"
      // 2) "Extremely Ambiguous + X (5 Suit)" is the same as "Extremely Ambiguous (5 Suit)"
      if (
        suits_that_cause_duplicated_variants_with_ambiguous.includes(suit_name)
      ) {
        return;
      }

      const variant_name = `Extremely Ambiguous & ${suit_name} (${incremented_suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...extremely_ambiguous_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getDualColorsVariants(): Variant[] {
  const variants: Variant[] = [];
  const dual_color_suits: string[][] = [];
  dual_color_suits[3] = ["Orange D2", "Purple D", "Green D"];
  dual_color_suits[5] = [
    "Orange D2",
    "Lime D",
    "Teal D",
    "Indigo D",
    "Cardinal D",
  ];
  dual_color_suits[6] = [
    "Orange D",
    "Purple D",
    "Mahogany D",
    "Green D",
    "Tan D",
    "Navy D",
  ];
  variants.push({
    name: "Dual-Color (6 Suits)",
    id: get_variant_id("Dual-Color (6 Suits)"),
    suits: dual_color_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Dual-Color (5 Suits)",
    id: get_variant_id("Dual-Color (5 Suits)"),
    suits: dual_color_suits[5],
    showSuitNames: true,
  });
  variants.push({
    name: "Dual-Color (3 Suits)",
    id: get_variant_id("Dual-Color (3 Suits)"),
    suits: dual_color_suits[3],
    showSuitNames: true,
  });

  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    [5, 3].forEach((suit_num) => {
      const incremented_suit_num = suit_num + 1;

      // It would be too difficult to have a 4 suit variant with a one-of-each suit
      if (incremented_suit_num === 4 && suit.oneOfEach) {
        return;
      }

      const variant_name = `Dual-Color & ${suit_name} (${incremented_suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...dual_color_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getSpecialCraftedMixedVariants(): Variant[] {
  const variants: Variant[] = [];

  // Add "Special Mix (5 Suits)"
  variants.push({
    name: "Special Mix (5 Suits)",
    id: get_variant_id("Special Mix (5 Suits)"),
    suits: ["Black", "Rainbow", "Pink", "White", "Brown"],
  });

  // Add "Special Mix (6 Suits)"
  variants.push({
    name: "Special Mix (6 Suits)",
    id: get_variant_id("Special Mix (6 Suits)"),
    suits: ["Black", "Rainbow", "Pink", "White", "Brown", "Null"],
  });

  // Add "Ambiguous Mix"
  variants.push({
    name: "Ambiguous Mix",
    id: get_variant_id("Ambiguous Mix"),
    suits: ["Tomato", "Mahogany", "Sky", "Navy", "Black", "White"],
    showSuitNames: true,
  });

  // Add "Dual-Color Mix"
  variants.push({
    name: "Dual-Color Mix",
    id: get_variant_id("Dual-Color Mix"),
    suits: ["Orange D2", "Purple D", "Green D", "Black", "Rainbow", "White"],
  });

  // Add "Ambiguous & Dual-Color"
  variants.push({
    name: "Ambiguous & Dual-Color",
    id: get_variant_id("Ambiguous & Dual-Color"),
    suits: [
      "Tangelo AD",
      "Peach AD",
      "Orchid AD",
      "Violet AD",
      "Lime AD",
      "Forest AD",
    ],
    showSuitNames: true,
  });

  return variants;
}

function getBlindVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Color Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Number Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      rankCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Totally Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
      rankCluesTouchNothing: true,
    });
  });

  return variants;
}

function getMuteVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Color Mute (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      clueColors: [],
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Number Mute (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      clueRanks: [],
    });
  });

  return variants;
}

function getAlternatingCluesVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Alternating Clues (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });

  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    [6, 5, 4, 3].forEach((suit_num) => {
      // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
      // one-of-each suit
      if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach) {
        return;
      }

      const variant_name = `Alternating Clues & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
      });
    });
  });
  return variants;
}

function getClueStarvedVariants(): Variant[] {
  const variants: Variant[] = [];

  [6, 5].forEach((suit_num) => {
    const variant_name = `Clue Starved (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });

  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach) {
      return;
    }

    [6, 5].forEach((suit_num) => {
      // 4 suits and 3 suits would be too difficult
      const variant_name = `Clue Starved & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
      });
    });
  });

  return variants;
}

function getCowAndPigVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Cow & Pig (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });
  return variants;
}

function getDuckVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Duck (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });

  return variants;
}

function getThrowItInAHoleVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4].forEach((suit_num) => {
    // 3 suits would be too difficult
    const variant_name = `Throw It in a Hole (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach) {
      // Throw It in a Hole & Black (6 Suits)" is 1.88 required efficiency in 5-player
      return;
    }

    [6, 5, 4].forEach((suit_num) => {
      // 3 suits would be too difficult
      const variant_name = `Throw It in a Hole & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
      });
    });
  });

  return variants;
}

function getReversedVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Reversed (${suit_num} Suits)`;
    const reversed_variant_suits = [...variant_suits[suit_num]];
    reversed_variant_suits[suit_num - 1] += SUIT_REVERSED_SUFFIX;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: reversed_variant_suits,
    });
  });
  suits.forEach((suit, suit_name) => {
    // We only want to create variants for certain suits
    // (e.g. "Red" does not get its own variants because it is a basic suit)
    if (!suit.createVariants) {
      return;
    }

    // Reversed suits with rank attributes would be identical to the normal versions
    if (suit.allClueRanks || suit.noClueRanks) {
      return;
    }

    const new_suit_name = suit_name + SUIT_REVERSED_SUFFIX;
    [6, 5, 4, 3].forEach((suit_num) => {
      // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
      // one-of-each suit
      if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach) {
        return;
      }

      const variant_name = `${new_suit_name} (${suit_num} Suits)`;
      const computed_variant_suits = [
        ...variant_suits[suit_num - 1],
        new_suit_name,
      ];
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: computed_variant_suits,
      });
    });
  });

  return variants;
}

function getUpOrDownVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variant_name = `Up or Down (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      showSuitNames: true,
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach) {
      // A one of each suit in combination with Up or Down would be too difficult
      return;
    }

    [6, 5].forEach((suit_num) => {
      const variant_name = `Up or Down & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getSynesthesiaVariants(): Variant[] {
  const variants: Variant[] = [];
  const suits_that_cause_duplicated_variants_with_synesthesia = [
    "Prism", // Same as White
    "Muddy Rainbow", // Same as Rainbow
    "Light Pink", // Same as Rainbow
    "Pink", // Same as Rainbow
    "Omni", // Same as Rainbow
    "Dark Prism", // Same as White
    "Cocoa Rainbow", // Same as Dark Rainbow
    "Gray Pink", // Same as Dark Rainbow
    "Dark Pink", // Same as Dark Rainbow
    "Dark Omni", // Same as Dark Rainbow
  ];
  [6, 5, 4, 3].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variant_name = `Synesthesia (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      clueRanks: [],
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (
      suits_that_cause_duplicated_variants_with_synesthesia.includes(suit_name)
    ) {
      return;
    }

    [6, 5, 4, 3].forEach((suit_num) => {
      if (suit_num === 3 && suit.oneOfEach) {
        return;
      }

      const variant_name = `Synesthesia & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
        clueRanks: [],
      });
    });
  });

  return variants;
}

function getCriticalFoursVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variant_name = `Critical Fours (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach) {
      // A one of each suit in combination with Critical Fours would be too difficult
      return;
    }

    [6, 5].forEach((suit_num) => {
      // 4 suits and 3 suits would be too difficult
      const variant_name = `Critical Fours & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        suits: [...variant_suits[suit_num - 1], suit_name],
      });
    });
  });

  return variants;
}

function getOddsAndEvensVariants(): Variant[] {
  const variants: Variant[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Odds And Evens (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      suits: variant_suits[suit_num],
      clueRanks: [1, 2],
      oddsAndEvens: true,
    });
  });
  return variants;
}

function checkForMissingVariants(): boolean {
  // Create a map for the new variants
  const new_variants_map = new Map<string, boolean>();
  variants.forEach((variant) => {
    new_variants_map.set(variant.name, true);
  });

  // Check for missing variants
  let missing = false;
  old_variants_array.forEach((variant) => {
    if (!new_variants_map.has(variant.name)) {
      missing = true;
      console.log(`Missing variant: ${variant.name}`);
    }
  });
  return missing;
}

function createVariantJSONFile(path: string) {
  const data = JSON.stringify(variants, null, 2) + "\n";
  fs.writeFileSync(path, data);
  console.log(`Created: ${path}`);
}

function createVariantsTextFile(path: string) {
  const contents: string[] = [];
  variants.forEach((variant) => {
    contents.push(`${variant.name} (#${variant.id})`);
  });

  fs.writeFileSync(path, contents.join("\n") + "\n\n");
  console.log(`Created: ${path}`);
}
