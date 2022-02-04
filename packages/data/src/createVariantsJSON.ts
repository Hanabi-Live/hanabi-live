import fs from "fs";
import { isEqual } from "lodash";
import path from "path";
import { VariantJSON } from "./types/VariantJSON";

// TODO ???
type SpecialProperty =
  | "specialAllClueColors"
  | "specialAllClueRanks"
  | "specialNoClueColors"
  | "specialNoClueRanks";

const SUIT_REVERSED_SUFFIX = " Reversed";

const SUIT_SPECIAL_PROPERTIES = [
  "allClueColors",
  "noClueColors",
  "allClueRanks",
  "noClueRanks",
];

const SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS = [
  "Rainbow",
  "Prism",
  "Dark Prism", // This is the same as Dark Rainbow,
];

main();

function main() {
  // Read the old json files
  const [suitsPath, variantsPath, textPath] = getPaths();
  const oldVariantsArray = readVariantsFromJson(variantsPath);
  const suitsArray = readSuitsFromJson(suitsPath);
  verifySuits();

  // Create some maps for the old variants
  const oldVariantsNameToIDMap = new Map<string, number>();
  const oldVariantsIDToNameMap = new Map<number, string>();

  setOldVariantsIDToNameMap();

  // Convert the suits array to a map and add default values
  const suits = convertSuitsArrayToMap();
  const suits_by_id = suitsById();

  // Start to build all of the variants
  const variants: VariantJSON[] = [];
  const current_variant_id = -1;

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

  if (checkStrId()) {
    showErrorAndExit(
      'Skipping the creation of a new "variant.json" file since strId were invalid',
    );
  }

  if (checkForMissingVariants()) {
    showErrorAndExit(
      'Skipping the creation of a new "variant.json" file since there were missing variants.',
    );
  }

  createVariantJSONFile(variantsPath);
  createVariantsTextFile(textPath);
}

function getPaths(): string[] {
  const repoRootPath = path.join(__dirname, "..", "..");
  const jsonDirectoryPath = path.join(
    repoRootPath,
    "packages",
    "data",
    "src",
    "json",
  );
  const suitsPath = path.join(jsonDirectoryPath, "suits.json");
  const variantsPath = path.join(jsonDirectoryPath, "variants.json");
  const textPath = path.join(repoRootPath, "misc", "variants.txt");

  return [suitsPath, variantsPath, textPath];
}

function get_variant_id(variant_name: string): number {
  // First, prefer the old (existing) variant ID, if present
  const id = oldVariantsNameToIDMap.get(variant_name);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID
  const found = false;
  while (!found) {
    current_variant_id += 1;
    const variant = oldVariantsArray.find((v) => v.id === current_variant_id);
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

function readVariantsFromJson(path: string): VariantJSON[] {
  const data = fs.readFileSync(path, "utf-8");
  return JSON.parse(data);
}

function readSuitsFromJson(path: string): Suit[] {
  const data = fs.readFileSync(path, "utf-8");
  return JSON.parse(data);
}

function verifySuits() {
  const ids = new Set();
  for (const suit of suitsArray) {
    if (suit.id) {
      ids.add(suit.id);
    } else {
      showErrorAndExit(`Suit ${suit.name} without id`);
    }
  }
  if (suitsArray.length !== ids.size) {
    showErrorAndExit(`Suit ids conflict? ${suitsArray.length} != ${ids.size}`);
  }
}

function setOldVariantsIDToNameMap() {
  oldVariantsArray.forEach((variant) => {
    if (variant.name === undefined) {
      showErrorAndExit(
        'One of the variants in the "variants.json" file does not have a name.',
      );
    }

    if (variant.id === undefined) {
      showErrorAndExit(
        `The variant of "${variant.name}" does not have an "id" field.`,
      );
    }

    if (oldVariantsNameToIDMap.get(variant.name) !== undefined) {
      showErrorAndExit(
        `The old "variants.json" file has a duplicate variant name of: ${variant.name}`,
      );
    }

    oldVariantsNameToIDMap.set(variant.name, variant.id);

    if (oldVariantsIDToNameMap.get(variant.id) !== undefined) {
      showErrorAndExit(
        `The old "variants.json" file has a duplicate ID of: ${variant.id}`,
      );
    }

    oldVariantsIDToNameMap.set(variant.id, variant.name);
  });
}

function convertSuitsArrayToMap(): Map<string, Suit> {
  const suits = new Map<string, Suit>();
  suitsArray.forEach((suit) => {
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
    if (suit.showSuitName === undefined) {
      suit.showSuitName = false;
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

function createBasicVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  variants.push({
    name: "No Variant",
    id: get_variant_id("No Variant"),
    strId: convertSuitsToStrId(variant_suits[5]),
    suits: variant_suits[5],
  });

  variants.push({
    name: "6 Suits",
    id: get_variant_id("6 Suits"),
    strId: convertSuitsToStrId(variant_suits[6]),
    suits: variant_suits[6],
  });

  variants.push({
    name: "4 Suits",
    id: get_variant_id("4 Suits"),
    strId: convertSuitsToStrId(variant_suits[4]),
    suits: variant_suits[4],
  });

  variants.push({
    name: "3 Suits",
    id: get_variant_id("3 Suits"),
    strId: convertSuitsToStrId(variant_suits[3]),
    suits: variant_suits[3],
  });

  return variants;
}

function getVariantsForEachSuit(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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

        const variant_name = `${suit_name} (${suit_num.toString()} Suits)`;
        const computed_variant_suits = [
          ...variant_suits[suit_num - 1],
          suit_name,
        ];
        variants.push({
          name: variant_name,
          id: get_variant_id(variant_name),
          strId: convertSuitsToStrId(computed_variant_suits),
          suits: computed_variant_suits,
        });
      });
    }
  });
  return variants;
}

function getVariantsForEachSpecialSuitCombination(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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
          (suit_num === 4 || suit_num === 3) &&
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
          strId: convertSuitsToStrId(computed_variant_suits),
          suits: computed_variant_suits,
        });
      });
    });
  });
  return variants;
}

function getVariantsForSpecialRanks(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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

      const suffix = `:${suit.id[0]}${special_rank}`;

      // First, create "Rainbow-Ones (6 Suits)", etc.
      [6, 5, 4, 3].forEach((suit_num) => {
        const hyphenated_suit_name = suit_name.replace(" ", "-");
        const variant_name = `${hyphenated_suit_name}-${word} (${suit_num.toString()} Suits)`;
        const computed_variant_suits = [...variant_suits[suit_num]];
        const variant: VariantJSON = {
          name: variant_name,
          id: get_variant_id(variant_name),
          strId: convertSuitsToStrId(computed_variant_suits) + suffix,
          suits: computed_variant_suits,
          specialRank: special_rank,
        };

        SUIT_SPECIAL_PROPERTIES.forEach((special_property) => {
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

      // Second, create the special suit combinations, e.g. "Rainbow-Ones & Rainbow (6 Suits)"
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
          const variant: VariantJSON = {
            name: variant_name,
            id: get_variant_id(variant_name),
            strId: convertSuitsToStrId(computed_variant_suits) + suffix,
            suits: computed_variant_suits,
            specialRank: special_rank,
          };

          SUIT_SPECIAL_PROPERTIES.forEach((special_property) => {
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
    const suffix = `:D${special_rank}`;

    // First, create "Deceptive-Ones (6 Suits)", etc.
    [6, 5, 4, 3].forEach((suit_num) => {
      const variant_name = `${special_name} (${suit_num} Suits)`;
      const computed_variant_suits = [...variant_suits[suit_num]];
      const variant: VariantJSON = {
        name: variant_name,
        id: get_variant_id(variant_name),
        strId: convertSuitsToStrId(computed_variant_suits) + suffix,
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
        const variant: VariantJSON = {
          name: variant_name,
          id: get_variant_id(variant_name),
          strId: convertSuitsToStrId(computed_variant_suits) + suffix,
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

function getAmbiguousVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];

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
    strId: convertSuitsToStrId(ambiguous_suits[6]),
    suits: ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Ambiguous (4 Suits)",
    id: get_variant_id("Ambiguous (4 Suits)"),
    strId: convertSuitsToStrId(ambiguous_suits[4]),
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
        SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.includes(suit_name)
      ) {
        return;
      }

      const variant_name = `Ambiguous & ${suit_name} (${incremented_suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        strId: convertSuitsToStrId([...ambiguous_suits[suit_num], suit_name]),
        suits: [...ambiguous_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getVeryAmbiguousVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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
    strId: convertSuitsToStrId(very_ambiguous_suits[6]),
    suits: very_ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Very Ambiguous (3 Suits)",
    id: get_variant_id("Very Ambiguous (3 Suits)"),
    strId: convertSuitsToStrId(very_ambiguous_suits[3]),
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
      SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.includes(suit_name)
    ) {
      return;
    }

    const variant_name = `Very Ambiguous & ${suit_name} (4 Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: convertSuitsToStrId([...very_ambiguous_suits[3], suit_name]),
      suits: [...very_ambiguous_suits[3], suit_name],
      showSuitNames: true,
    });
  });

  return variants;
}

function getExtremelyAmbiguousVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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
    strId: convertSuitsToStrId(extremely_ambiguous_suits[6]),
    suits: extremely_ambiguous_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Extremely Ambiguous (5 Suits)",
    id: get_variant_id("Extremely Ambiguous (5 Suits)"),
    strId: convertSuitsToStrId(extremely_ambiguous_suits[5]),
    suits: extremely_ambiguous_suits[5],
    showSuitNames: true,
  });
  variants.push({
    name: "Extremely Ambiguous (4 Suits)",
    id: get_variant_id("Extremely Ambiguous (4 Suits)"),
    strId: convertSuitsToStrId(extremely_ambiguous_suits[4]),
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
        SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.includes(suit_name)
      ) {
        return;
      }

      const variant_name = `Extremely Ambiguous & ${suit_name} (${incremented_suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        strId: convertSuitsToStrId([
          ...extremely_ambiguous_suits[suit_num],
          suit_name,
        ]),
        suits: [...extremely_ambiguous_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getDualColorsVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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
    strId: convertSuitsToStrId(dual_color_suits[6]),
    suits: dual_color_suits[6],
    showSuitNames: true,
  });
  variants.push({
    name: "Dual-Color (5 Suits)",
    id: get_variant_id("Dual-Color (5 Suits)"),
    strId: convertSuitsToStrId(dual_color_suits[5]),
    suits: dual_color_suits[5],
    showSuitNames: true,
  });
  variants.push({
    name: "Dual-Color (3 Suits)",
    id: get_variant_id("Dual-Color (3 Suits)"),
    strId: convertSuitsToStrId(dual_color_suits[3]),
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
        strId: convertSuitsToStrId([...dual_color_suits[suit_num], suit_name]),
        suits: [...dual_color_suits[suit_num], suit_name],
        showSuitNames: true,
      });
    });
  });

  return variants;
}

function getSpecialCraftedMixedVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];

  // Add "Special Mix (5 Suits)"
  variants.push({
    name: "Special Mix (5 Suits)",
    id: get_variant_id("Special Mix (5 Suits)"),
    suits: ["Black", "Rainbow", "Pink", "White", "Brown"],
  });
  variants[variants.length - 1].strId = convertSuitsToStrId(
    variants[variants.length - 1].suits,
  );

  // Add "Special Mix (6 Suits)"
  variants.push({
    name: "Special Mix (6 Suits)",
    id: get_variant_id("Special Mix (6 Suits)"),
    suits: ["Black", "Rainbow", "Pink", "White", "Brown", "Null"],
  });
  variants[variants.length - 1].strId = convertSuitsToStrId(
    variants[variants.length - 1].suits,
  );

  // Add "Ambiguous Mix"
  variants.push({
    name: "Ambiguous Mix",
    id: get_variant_id("Ambiguous Mix"),
    suits: ["Tomato", "Mahogany", "Sky", "Navy", "Black", "White"],
    showSuitNames: true,
  });
  variants[variants.length - 1].strId = convertSuitsToStrId(
    variants[variants.length - 1].suits,
  );

  // Add "Dual-Color Mix"
  variants.push({
    name: "Dual-Color Mix",
    id: get_variant_id("Dual-Color Mix"),
    suits: ["Orange D2", "Purple D", "Green D", "Black", "Rainbow", "White"],
    showSuitNames: true,
  });
  variants[variants.length - 1].strId = convertSuitsToStrId(
    variants[variants.length - 1].suits,
  );

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
  variants[variants.length - 1].strId = convertSuitsToStrId(
    variants[variants.length - 1].suits,
  );

  return variants;
}

function getBlindVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Color Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CB`,
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Number Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:NB`,
      suits: variant_suits[suit_num],
      rankCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Totally Blind (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:TB`,
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
      rankCluesTouchNothing: true,
    });
  });

  return variants;
}

function getMuteVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Color Mute (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CM`,
      suits: variant_suits[suit_num],
      clueColors: [],
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Number Mute (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:NM`,
      suits: variant_suits[suit_num],
      clueRanks: [],
    });
  });

  return variants;
}

function getAlternatingCluesVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Alternating Clues (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:AC`,
      suits: variant_suits[suit_num],
      alternatingClues: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:AC`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        alternatingClues: true,
      });
    });
  });
  return variants;
}

function getClueStarvedVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];

  [6, 5].forEach((suit_num) => {
    const variant_name = `Clue Starved (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CS`,
      suits: variant_suits[suit_num],
      clueStarved: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:CS`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        clueStarved: true,
      });
    });
  });

  return variants;
}

function getCowAndPigVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Cow & Pig (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CP`,
      suits: variant_suits[suit_num],
      cowPig: true,
    });
  });
  return variants;
}

function getDuckVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Duck (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:Du`,
      suits: variant_suits[suit_num],
      duck: true,
    });
  });

  return variants;
}

function getThrowItInAHoleVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4].forEach((suit_num) => {
    // 3 suits would be too difficult
    const variant_name = `Throw It in a Hole (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:TH`,
      suits: variant_suits[suit_num],
      throwItInHole: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:TH`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        throwItInHole: true,
      });
    });
  });

  return variants;
}

function getReversedVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Reversed (${suit_num} Suits)`;
    const reversed_variant_suits = [...variant_suits[suit_num]];
    reversed_variant_suits[suit_num - 1] += SUIT_REVERSED_SUFFIX;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}/R`,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}/R`,
        suits: computed_variant_suits,
      });
    });
  });

  return variants;
}

function getUpOrDownVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variant_name = `Up or Down (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:UD`,
      suits: variant_suits[suit_num],
      showSuitNames: true,
      upOrDown: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:UD`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        showSuitNames: true,
        upOrDown: true,
      });
    });
  });

  return variants;
}

function getSynesthesiaVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
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
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:Sy`,
      suits: variant_suits[suit_num],
      clueRanks: [],
      synesthesia: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:Sy`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        clueRanks: [],
        synesthesia: true,
      });
    });
  });

  return variants;
}

function getCriticalFoursVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variant_name = `Critical Fours (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:C4`,
      suits: variant_suits[suit_num],
      criticalFours: true,
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
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:C4`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        criticalFours: true,
      });
    });
  });

  return variants;
}

function getOddsAndEvensVariants(): VariantJSON[] {
  const variants: VariantJSON[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variant_name = `Odds and Evens (${suit_num} Suits)`;
    variants.push({
      name: variant_name,
      id: get_variant_id(variant_name),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:OE`,
      suits: variant_suits[suit_num],
      clueRanks: [1, 2],
      oddsAndEvens: true,
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

      const variant_name = `Odds and Evens & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variant_name,
        id: get_variant_id(variant_name),
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:OE`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        clueRanks: [1, 2],
        oddsAndEvens: true,
      });
    });
  });
  return variants;
}

function convertSuitsToStrId(suit_names: string[]): string {
  return suit_names.map((name) => suits.get(name)!.id).join("+");
}

function suitsById(): Map<string, Suit> {
  const result = new Map();
  for (const suit of suitsArray) {
    result.set(suit.id, suit);
  }
  return result;
}

function checkStrId(): boolean {
  const vars = new Map();
  for (const v of variants) {
    if (!v.strId) {
      console.log(`Variant "${v.name}" misses strId`);
      return true;
    }
    if (vars.has(v.strId)) {
      console.log(
        `Variants "${v.name}" and "${vars.get(v.strId)}" share id ${v.strId}`,
      );
      return true;
    }
    vars.set(v.strId, v.name);
    // Check that the id is correct
    const reconstructed = parseStrId(v.strId);
    reconstructed.name = v.name;
    reconstructed.id = v.id;
    if (!isEqual(reconstructed, v)) {
      console.log(
        `Variant ${v.strId} is parsed incorrectly:`,
        v,
        reconstructed,
      );
      return true;
    }
  }

  return false;
}

function parseStrId(strId: string): VariantJSON {
  const [full_suits_str, ...var_modifiers] = strId.split(":");
  const suit_names = full_suits_str.split("+").map((suit_id_with_modifiers) => {
    const [suit_id, ...suit_modifiers] = suit_id_with_modifiers.split("/");
    let suit_name = suits_by_id.get(suit_id)!.name;
    for (const sm of suit_modifiers) {
      if (sm === "R") {
        suit_name += SUIT_REVERSED_SUFFIX;
      } else {
        throw new Error(`Unknown suit modifier "/${sm}" in ${strId}`);
      }
    }
    return suit_name;
  });
  const variant: VariantJSON = {
    name: "",
    id: 0,
    suits: suit_names,
    strId,
  };
  for (const suit_id_with_modifiers of full_suits_str.split("+")) {
    const [suit_id, ...suit_modifiers] = suit_id_with_modifiers.split("/");
    if (suits_by_id.get(suit_id)!.showSuitName) {
      variant.showSuitNames = true;
    }
  }
  for (const vm of var_modifiers) {
    switch (vm) {
      case "R1":
      case "R5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialAllClueColors = true;
        break;
      case "P1":
      case "P5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "W1":
      case "W5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialNoClueColors = true;
        break;
      case "B1":
      case "B5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "O1":
      case "O5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "N1":
      case "N5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "M1":
      case "M5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "L1":
      case "L5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "D1":
      case "D5":
        variant.specialRank = parseInt(vm[1]);
        variant.specialDeceptive = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "CB":
        variant.colorCluesTouchNothing = true;
        break;
      case "NB":
        variant.rankCluesTouchNothing = true;
        break;
      case "TB":
        variant.colorCluesTouchNothing = true;
        variant.rankCluesTouchNothing = true;
        break;
      case "CM":
        variant.clueColors = [];
        break;
      case "NM":
        variant.clueRanks = [];
        break;
      case "AC":
        variant.alternatingClues = true;
        break;
      case "CS":
        variant.clueStarved = true;
        break;
      case "CP":
        variant.cowPig = true;
        break;
      case "Du":
        variant.duck = true;
        break;
      case "TH":
        variant.throwItInHole = true;
        break;
      case "UD":
        variant.upOrDown = true;
        variant.showSuitNames = true;
        break;
      case "Sy":
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      case "C4":
        variant.criticalFours = true;
        break;
      case "OE":
        variant.oddsAndEvens = true;
        variant.clueRanks = [1, 2];
        break;
      default:
        throw new Error(`Unknown variant modifier ":${vm}" in ${strId}`);
    }
  }
  return variant;
}

function checkForMissingVariants(): boolean {
  // Create a map for the new variants
  const new_variants_map = new Map<string, boolean>();
  variants.forEach((variant) => {
    new_variants_map.set(variant.name, true);
  });

  // Check for missing variants
  let missing = false;
  oldVariantsArray.forEach((variant) => {
    if (!new_variants_map.has(variant.name)) {
      missing = true;
      console.log(`Missing variant: ${variant.name}`);
    }
  });
  return missing;
}

function createVariantJSONFile(path: string) {
  const data = `${JSON.stringify(variants, null, 2)}\n`;
  fs.writeFileSync(path, data);
  console.log(`Created: ${path}`);
}

function createVariantsTextFile(path: string) {
  const contents: string[] = [];
  variants.forEach((variant) => {
    contents.push(`${variant.name} (#${variant.id})`);
  });

  fs.writeFileSync(path, `${contents.join("\n")}\n\n`);
  console.log(`Created: ${path}`);
}
