import type {
  Color,
  Rank,
  RankClueNumber,
  Suit,
  SuitJSON,
  Variant,
  VariantDescription,
} from "@hanabi-live/game";
import {
  COLORS_MAP,
  DEFAULT_CLUE_RANKS,
  SUITS_MAP,
  SUIT_REVERSED_SUFFIX,
  VALID_NUM_PLAYERS,
  createVariant,
  defaultOptions,
  getCardsPerHand,
  getMinEfficiency,
  getStartingDeckSize,
  getStartingPace,
  getTotalCardsInDeck,
} from "@hanabi-live/game";
import type { Subtract } from "complete-common";
import { ReadonlySet } from "complete-common";

type BasicVariantSuits = ReturnType<typeof getBasicVariantSuits>;

const STANDARD_VARIANT_SUIT_AMOUNTS = [6, 5, 4, 3] as const;
const SPECIAL_RANKS_TO_USE = [1, 5] as const;
const MAX_ALLOWED_EFFICIENCY_THRESHOLD = 1.79;
const MINIMUM_CARD_COUNT = 25;

/** These are suit properties that are transferred to special ranks. */
const SUIT_SPECIAL_PROPERTIES = [
  "allClueColors",
  "noClueColors",
  "allClueRanks",
  "noClueRanks",
] as const;

const SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS = new ReadonlySet([
  "Rainbow",
  "Prism",
  "Dark Prism", // Same as Dark Rainbow
]);

const SUITS_THAT_REQUIRE_TWO_CLUEABLE_SUITS = new ReadonlySet([
  "Rainbow",
  "Prism",
]);

const SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_SYNESTHESIA = new ReadonlySet([
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
]);

const NUMBER_WORDS = [
  "Zeros",
  "Ones",
  "Twos",
  "Threes",
  "Fours",
  "Fives",
] as const;

export function getVariantDescriptions(
  suits: readonly SuitJSON[],
): readonly VariantDescription[] {
  const basicVariantSuits = getBasicVariantSuits();

  // We only want to create variants for certain suits. (For example, "Red" does not get its own
  // variants because it is a basic suit.)
  const suitsToCreateVariantsFor = suits.filter(
    (suit) => suit.createVariants === true,
  );

  // The variants should be listed in the order that they appear in "variants.md".
  const variantDescriptions = [
    ...getBasicVariants(basicVariantSuits),
    ...getVariantsForEachSuit(suitsToCreateVariantsFor, basicVariantSuits),
    ...getVariantsForEachSpecialSuitCombination(
      suitsToCreateVariantsFor,
      basicVariantSuits,
    ),
    ...getVariantsForSpecialRanks(suitsToCreateVariantsFor, basicVariantSuits),
    ...getAmbiguousVariants(suitsToCreateVariantsFor),
    ...getVeryAmbiguousVariants(suitsToCreateVariantsFor),
    ...getExtremelyAmbiguousVariants(suitsToCreateVariantsFor),
    ...getMatryoshkaVariants(suitsToCreateVariantsFor),
    ...getDualColorsVariants(suitsToCreateVariantsFor),
    ...getMixVariants(),
    ...getCriticalFoursVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getClueStarvedVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getBlindVariants(basicVariantSuits),
    ...getMuteVariants(basicVariantSuits),
    ...getAlternatingCluesVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getCowAndPigVariants(basicVariantSuits),
    ...getDuckVariants(basicVariantSuits),
    ...getOddsAndEvensVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getSynesthesiaVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getReversedVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getWhiteReversedAndRainbowVariants(),
    ...getUpOrDownVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getThrowItInAHoleVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getFunnelsVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getChimneysVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getSudokuVariants(suitsToCreateVariantsFor, basicVariantSuits),
  ];

  return variantDescriptions.filter((variantDescription) =>
    isVariantAllowed(COLORS_MAP, SUITS_MAP, variantDescription),
  );
}

/**
 * Create an array containing the suits for the "3 Suits" variant, the "4 Suits" variant, and so on.
 */
function getBasicVariantSuits() {
  const oneSuit = ["Red"] as const;
  const twoSuits = ["Red", "Blue"] as const;

  /** Green is inserted before Blue to keep the colors in "rainbow" order. */
  const threeSuits = ["Red", "Green", "Blue"] as const;

  /** Yellow is inserted before Green to keep the colors in "rainbow" order. */
  const fourSuits = ["Red", "Yellow", "Green", "Blue"] as const;

  const fiveSuits = [...fourSuits, "Purple"] as const;
  const sixSuits = [...fiveSuits, "Teal"] as const;

  return [
    undefined,
    oneSuit,
    twoSuits,
    threeSuits,
    fourSuits,
    fiveSuits,
    sixSuits,
  ] as const;
}

function getBasicVariants(
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  return [
    {
      name: "No Variant",
      suits: basicVariantSuits[5],
    },
    {
      name: "6 Suits",
      suits: basicVariantSuits[6],
    },
    {
      name: "4 Suits",
      suits: basicVariantSuits[4],
    },
    {
      name: "3 Suits",
      suits: basicVariantSuits[3],
    },
  ];
}

/** Create variants for e.g. "Rainbow (6 Suits)", "Rainbow (5 Suits)", and so on. */
function getVariantsForEachSuit(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const varianName = `${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: varianName,
        suits: variantSuits,
      });
    }
  }

  return variantDescriptions;
}

/** Create variants for e.g. "Rainbow & White (6 Suits)", "Rainbow & White (5 Suits)", and so on. */
function getVariantsForEachSpecialSuitCombination(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  const combinationVariantNames = new Set<string>();

  for (const suit of suitsToCreateVariantsFor) {
    for (const suit2 of suitsToCreateVariantsFor) {
      if (suit.name === suit2.name) {
        continue;
      }

      // Disallow combining suits that are too similar to each other
      // (e.g. Rainbow and Dark Rainbow)
      if (
        suit.allClueColors === suit2.allClueColors
        && suit.allClueRanks === suit2.allClueRanks
        && suit.noClueColors === suit2.noClueColors
        && suit.noClueRanks === suit2.noClueRanks
        && suit.prism === suit2.prism
      ) {
        continue;
      }

      if (
        combinationVariantNames.has(suit.name + suit2.name)
        || combinationVariantNames.has(suit2.name + suit.name)
      ) {
        continue;
      }

      combinationVariantNames.add(suit.name + suit2.name);

      for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
        // Prism and Rainbow require 2 clueable suits, else they are just ambiguous red.
        if (
          numSuits === 3
          && ((SUITS_THAT_REQUIRE_TWO_CLUEABLE_SUITS.has(suit.name)
            && (suit2.noClueColors === true || suit2.allClueColors === true))
            || ((suit.noClueColors === true || suit.allClueColors === true)
              && SUITS_THAT_REQUIRE_TWO_CLUEABLE_SUITS.has(suit2.name)))
        ) {
          continue;
        }

        const variantName = `${suit.name} & ${suit2.name} (${numSuits} Suits)`;
        const numBasicSuits = (numSuits - 2) as Subtract<typeof numSuits, 2>;
        const basicSuits = basicVariantSuits[numBasicSuits];
        const variantSuits = [...basicSuits, suit.name, suit2.name];
        variantDescriptions.push({
          name: variantName,
          suits: variantSuits,
        });
      }
    }
  }

  return variantDescriptions;
}

/** Create variants for e.g. "Rainbow-Ones (6 Suits)", "Rainbow-Ones (5 Suits)", and so on. */
function getVariantsForSpecialRanks(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const specialRank of SPECIAL_RANKS_TO_USE) {
    const specialRankName = NUMBER_WORDS[specialRank];
    const specialClueRanks = getSpecialClueRanks(specialRank);

    for (const suit of suitsToCreateVariantsFor) {
      // There are no one-of-each special ranks (e.g. Black-Ones)
      if (suit.oneOfEach === true) {
        continue;
      }

      // There are no prism special ranks (e.g. Prism-Ones)
      if (suit.prism === true) {
        continue;
      }

      // There are no inverted special ranks... Yet. (e.g. Inverted-Ones)
      if (suit.inverted === true) {
        continue;
      }

      // First, create "Rainbow-Ones (6 Suits)", "Rainbow-Ones (5 Suits)", etc.
      for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
        const hyphenatedSuitName = suit.name.replace(" ", "-");
        const variantName = `${hyphenatedSuitName}-${specialRankName} (${numSuits} Suits)`;
        const basicSuits = basicVariantSuits[numSuits];
        const variantSuits = [...basicSuits];
        const variantDescription = getVariantDescriptionForSpecialRankVariant(
          variantName,
          variantSuits,
          specialRank,
          suit,
          specialClueRanks,
        );
        variantDescriptions.push(variantDescription);
      }

      // Second, create the special suit combinations, e.g. "Rainbow-Ones & Rainbow (6 Suits)"
      for (const suit2 of suitsToCreateVariantsFor) {
        for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
          const hyphenatedSuitName = suit.name.replace(" ", "-");
          const variantName = `${hyphenatedSuitName}-${specialRankName} & ${suit2.name} (${numSuits} Suits)`;
          const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
          const basicSuits = basicVariantSuits[numBasicSuits];
          const variantSuits = [...basicSuits, suit2.name];
          const variantDescription = getVariantDescriptionForSpecialRankVariant(
            variantName,
            variantSuits,
            specialRank,
            suit,
            specialClueRanks,
          );
          variantDescriptions.push(variantDescription);
        }
      }
    }

    // Add variants for Deceptive-Ones and Deceptive-Fives.
    const variantNamePrefix = `Deceptive-${specialRankName}`;

    // First, create "Deceptive-Ones (6 Suits)", etc.
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `${variantNamePrefix} (${numSuits} Suits)`;
      const basicSuits = basicVariantSuits[numSuits];
      const variantSuits = [...basicSuits];
      const variantDescription: VariantDescription = {
        name: variantName,
        suits: variantSuits,
        specialRank,
        specialRankDeceptive: true,
        clueRanks: specialClueRanks,
      };
      variantDescriptions.push(variantDescription);
    }

    // Second, create the special suit combinations, e.g. "Deceptive-Ones & Rainbow (6 Suits)"
    for (const suit of suitsToCreateVariantsFor) {
      for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
        const variantName = `${variantNamePrefix} & ${suit.name} (${numSuits} Suits)`;
        const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
        const basicSuits = basicVariantSuits[numBasicSuits];
        const variantSuits = [...basicSuits, suit.name];
        const variantDescription: VariantDescription = {
          name: variantName,
          suits: variantSuits,
          specialRank,
          specialRankDeceptive: true,
          clueRanks: specialClueRanks,
        };
        variantDescriptions.push(variantDescription);
      }
    }
  }

  return variantDescriptions;
}

export function getSpecialClueRanks(
  specialRank: Rank,
): readonly RankClueNumber[] {
  return DEFAULT_CLUE_RANKS.filter((clueRank) => clueRank !== specialRank);
}

function getVariantDescriptionForSpecialRankVariant(
  name: string,
  suits: readonly string[],
  specialRank: Rank,
  suit: SuitJSON,
  specialClueRanks: readonly RankClueNumber[],
): VariantDescription {
  const variantDescription: VariantDescription = {
    name,
    suits,
    specialRank,
  };

  // Fill in the behavior for what the special rank will do.
  for (const specialProperty of SUIT_SPECIAL_PROPERTIES) {
    if (suit[specialProperty] === true) {
      const specialPropertyName =
        convertSuitSpecialPropertyToVariantProperty(specialProperty);
      variantDescription[specialPropertyName] = true;
    }
  }

  // Exclude certain types of rank clues, if applicable
  // (e.g. you can't clue number 1 in a Pink-Ones variant)
  if (suit.allClueRanks === true || suit.noClueRanks === true) {
    variantDescription.clueRanks = specialClueRanks;
  }

  return variantDescription;
}

function convertSuitSpecialPropertyToVariantProperty(
  suitSpecialProperty: (typeof SUIT_SPECIAL_PROPERTIES)[number],
) {
  switch (suitSpecialProperty) {
    case "allClueColors": {
      return "specialRankAllClueColors";
    }

    case "noClueColors": {
      return "specialRankNoClueColors";
    }

    case "allClueRanks": {
      return "specialRankAllClueRanks";
    }

    case "noClueRanks": {
      return "specialRankNoClueRanks";
    }
  }
}

function getAmbiguousVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const redAmbiguousSuits = ["Tomato", "Mahogany"] as const;
  const greenAmbiguousSuits = ["Emerald", "Olive"] as const;
  const blueAmbiguousSuits = ["Berry", "Navy"] as const;

  const ambiguousSuits = [
    undefined,
    undefined,
    [...redAmbiguousSuits],
    undefined,
    [...redAmbiguousSuits, ...blueAmbiguousSuits],
    undefined,
    [...redAmbiguousSuits, ...greenAmbiguousSuits, ...blueAmbiguousSuits],
  ] as const;

  // Create the basic variants.
  variantDescriptions.push(
    {
      name: "Ambiguous (6 Suits)",
      suits: ambiguousSuits[6],
    },
    {
      name: "Ambiguous (4 Suits)",
      suits: ambiguousSuits[4],
    },
  );

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [4, 2] as const) {
      const incrementedNumSuits = numSuits + 1;

      // "Ambiguous & X (3 Suit)" is the same as "Very Ambiguous (3 Suit)".
      if (
        incrementedNumSuits === 3
        && SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.has(suit.name)
      ) {
        continue;
      }

      const variantName = `Ambiguous & ${suit.name} (${incrementedNumSuits} Suits)`;
      const baseSuits = ambiguousSuits[numSuits];
      const variantSuits = [...baseSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
      });
    }
  }

  return variantDescriptions;
}

function getVeryAmbiguousVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const redVeryAmbiguousSuits = ["Tomato", "Mahogany", "Carrot"] as const;
  const blueVeryAmbiguousSuits = ["Berry", "Navy", "Sky"] as const;

  const veryAmbiguousSuits = [
    undefined,
    undefined,
    undefined,
    // For "Very Ambiguous (3 Suits)", we use blue suits instead of red suits so that this will
    // align better with the Extremely Ambiguous variants. (Extremely Ambiguous uses blue suits
    // because it is easier to come up with suit names for blue cards than it is for red cards.)
    [...blueVeryAmbiguousSuits],
    undefined,
    undefined,
    [...redVeryAmbiguousSuits, ...blueVeryAmbiguousSuits],
  ] as const;

  // Create the basic variants.
  variantDescriptions.push(
    {
      name: "Very Ambiguous (6 Suits)",
      suits: veryAmbiguousSuits[6],
    },
    {
      name: "Very Ambiguous (3 Suits)",
      suits: veryAmbiguousSuits[3],
    },
  );

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    // "Very Ambiguous + X (4 Suit)" is the same as "Extremely Ambiguous (4 Suit)".
    if (SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.has(suit.name)) {
      continue;
    }

    const variantName = `Very Ambiguous & ${suit.name} (4 Suits)`;
    const baseSuits = veryAmbiguousSuits[3];
    const variantSuits = [...baseSuits, suit.name];
    variantDescriptions.push({
      name: variantName,
      suits: variantSuits,
    });
  }

  return variantDescriptions;
}

function getExtremelyAmbiguousVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // The suits should go from lightest to darkest. We want the fill colors to be evenly distributed,
  // so we have to use custom suits.
  const fourSuits = ["Ice EA", "Aqua EA", "Sky EA", "Berry EA"] as const;
  const fiveSuits = [...fourSuits, "Navy EA"] as const;
  const sixSuits = [...fiveSuits, "Ocean EA"] as const;

  const extremelyAmbiguousSuits = [
    undefined,
    undefined,
    undefined,
    undefined,
    fourSuits,
    fiveSuits,
    sixSuits,
  ] as const;

  // Create the basic variants.
  variantDescriptions.push(
    {
      name: "Extremely Ambiguous (6 Suits)",
      suits: extremelyAmbiguousSuits[6],
    },
    {
      name: "Extremely Ambiguous (5 Suits)",
      suits: extremelyAmbiguousSuits[5],
    },
    {
      name: "Extremely Ambiguous (4 Suits)",
      suits: extremelyAmbiguousSuits[4],
    },
  );

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [5, 4] as const) {
      const incrementedNumSuits = numSuits + 1;

      // For some suits:
      // 1) "Extremely Ambiguous + X (6 Suit)" is the same as "Extremely Ambiguous (6 Suit)"
      // 2) "Extremely Ambiguous + X (5 Suit)" is the same as "Extremely Ambiguous (5 Suit)"
      if (SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.has(suit.name)) {
        continue;
      }

      const variantName = `Extremely Ambiguous & ${suit.name} (${incrementedNumSuits} Suits)`;
      const baseSuits = extremelyAmbiguousSuits[numSuits];
      const variantSuits = [...baseSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
      });
    }
  }

  return variantDescriptions;
}

function getMatryoshkaVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const matryoshkaSuits = [
    "Red",
    "Tangerine",
    "Geas",
    "Beatnik",
    "Plum",
    "Taupe",
  ] as const;

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    variantDescriptions.push({
      name: `Matryoshka (${numSuits} Suits)`,
      suits: matryoshkaSuits.slice(0, numSuits),
    });
  }

  // Second, create the special suit combinations, e.g. "Matryoshka & Rainbow (6 Suits)"
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Matryoshka & ${suit.name} (${numSuits} Suits)`;
      const variantSuits = [
        ...matryoshkaSuits.slice(0, numSuits - 1),
        suit.name,
      ];
      const variantDescription: VariantDescription = {
        name: variantName,
        suits: variantSuits,
      };
      variantDescriptions.push(variantDescription);
    }
  }

  return variantDescriptions;
}

function getDualColorsVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const dualColorSuits = [
    undefined,
    undefined,
    undefined,
    ["Tangerine", "Violet", "Jade"],
    undefined,
    ["Tangerine", "Lime", "Cyan", "Indigo", "Cardinal"],
    ["Tangerine", "Violet", "Maroon", "Jade", "Tan", "Cobalt"],
  ] as const;

  // Create the basic variants.
  variantDescriptions.push(
    {
      name: "Dual-Color (6 Suits)",
      suits: dualColorSuits[6],
    },
    {
      name: "Dual-Color (5 Suits)",
      suits: dualColorSuits[5],
    },
    {
      name: "Dual-Color (3 Suits)",
      suits: dualColorSuits[3],
    },
  );

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [5, 3] as const) {
      const incrementedNumSuits = numSuits + 1;
      const variantName = `Dual-Color & ${suit.name} (${incrementedNumSuits} Suits)`;
      const baseSuits = dualColorSuits[numSuits];
      const variantSuits = [...baseSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
      });
    }
  }

  return variantDescriptions;
}

function getMixVariants(): readonly VariantDescription[] {
  return [
    {
      name: "Special Mix (5 Suits)",
      suits: ["Black", "Rainbow", "Pink", "White", "Brown"],
    },
    {
      name: "Special Mix (6 Suits)",
      suits: ["Black", "Rainbow", "Pink", "White", "Brown", "Null"],
    },
    {
      name: "Ambiguous Mix",
      suits: ["Tomato", "Mahogany", "Sky", "Navy", "Black", "White"],
    },
    {
      name: "Dual-Color Mix",
      suits: ["Tangerine", "Violet", "Jade", "Black", "Rainbow", "White"],
    },
    {
      name: "Ambiguous & Dual-Color Mix",
      suits: ["Peach", "Tangerine", "Magenta", "Violet", "Lime", "Jungle"],
    },
    {
      name: "Candy Corn Mix (5 Suits)",
      suits: ["Red", "Tangerine", "Yellow", "White", "Brown"],
    },
    {
      name: "Candy Corn Mix (6 Suits)",
      suits: ["Red", "Tangerine", "Yellow", "White", "Brown", "Cocoa Rainbow"],
    },
    {
      name: "Holiday Mix (5 Suits)",
      suits: ["Dark Pink", "Green", "White", "Sky", "Navy"],
    },
    {
      name: "Holiday Mix (6 Suits)",
      suits: ["Light Pink", "Red", "Green", "White", "Sky", "Navy"],
    },
    {
      name: "Valentine Mix (5 Suits)",
      suits: ["Red", "Pink", "White", "Light Pink", "Cocoa Rainbow"],
    },
    {
      name: "Valentine Mix (6 Suits)",
      suits: ["Red", "Pink", "White", "Light Pink", "Cocoa Rainbow", "Null"],
    },
    {
      name: "RGB Mix (6 Suits)",
      suits: ["Red", "Gold", "Green", "Cyan", "Blue", "Violet"],
    },
  ];
}

function getCriticalFoursVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Critical Fours (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      criticalRank: 4,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Critical Fours & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        criticalRank: 4,
      });
    }
  }

  return variantDescriptions;
}

function getClueStarvedVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Clue Starved (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      clueStarved: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      // 4 suits and 3 suits would be too difficult.
      const variantName = `Clue Starved & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        clueStarved: true,
      });
    }
  }

  return variantDescriptions;
}

function getBlindVariants(
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Color Blind (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      colorCluesTouchNothing: true,
    });
  }

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Number Blind (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      rankCluesTouchNothing: true,
    });
  }

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Totally Blind (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      colorCluesTouchNothing: true,
      rankCluesTouchNothing: true,
    });
  }

  return variantDescriptions;
}

function getMuteVariants(
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Color Mute (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      clueColors: [],
    });
  }

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Number Mute (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      clueRanks: [],
    });
  }

  return variantDescriptions;
}

function getAlternatingCluesVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Alternating Clues (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      alternatingClues: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Alternating Clues & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        alternatingClues: true,
      });
    }
  }

  return variantDescriptions;
}

function getCowAndPigVariants(
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Cow & Pig (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      cowAndPig: true,
    });
  }

  return variantDescriptions;
}

function getDuckVariants(
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Duck (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      duck: true,
    });
  }

  return variantDescriptions;
}

function getOddsAndEvensVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  const clueRanksForOddsAndEvens = [1, 2] as const; // 1 represents odd, 2 represents even

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Odds and Evens (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      clueRanks: clueRanksForOddsAndEvens,
      oddsAndEvens: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Odds and Evens & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        clueRanks: clueRanksForOddsAndEvens,
        oddsAndEvens: true,
      });
    }
  }

  return variantDescriptions;
}

function getSynesthesiaVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Synesthesia (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      clueRanks: [],
      synesthesia: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    if (SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_SYNESTHESIA.has(suit.name)) {
      continue;
    }

    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Synesthesia & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        clueRanks: [],
        synesthesia: true,
      });
    }
  }

  return variantDescriptions;
}

function getReversedVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Reversed (${numSuits} Suits)`;
    const basicSuits = basicVariantSuits[numSuits];
    const variantSuits = [...basicSuits];

    // Change the final suit to be a reversed suit.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, unicorn/prefer-at
    variantSuits[variantSuits.length - 1]! += SUIT_REVERSED_SUFFIX;

    variantDescriptions.push({
      name: variantName,
      suits: variantSuits,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    // Reversed suits with rank attributes would be identical to the normal versions.
    if (suit.allClueRanks === true || suit.noClueRanks === true) {
      continue;
    }

    const reversedSuitName = suit.name + SUIT_REVERSED_SUFFIX;
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `${reversedSuitName} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, reversedSuitName];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
      });
    }
  }

  return variantDescriptions;
}

/**
 * Normally, we do not mix variants with more than one special suit at a time. However, we make an
 * exception since this is an official variant.
 *
 * @see https://boardgamegeek.com/boardgame/290357/hanabi-deluxe-what-a-show
 */
function getWhiteReversedAndRainbowVariants(): readonly VariantDescription[] {
  return [
    {
      name: "White Reversed & Rainbow (6 Suits)",
      suits: ["Red", "Yellow", "Green", "Blue", "White Reversed", "Rainbow"],
    },
    {
      name: "White Reversed & Rainbow (5 Suits)",
      suits: ["Red", "Green", "Blue", "White Reversed", "Rainbow"],
    },
    {
      name: "White Reversed & Rainbow (4 Suits)",
      suits: ["Red", "Blue", "White Reversed", "Rainbow"],
    },
  ];
}

function getUpOrDownVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Up or Down (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      upOrDown: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Up or Down & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        upOrDown: true,
      });
    }
  }

  return variantDescriptions;
}

function getThrowItInAHoleVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Throw It in a Hole (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      throwItInAHole: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Throw It in a Hole & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        throwItInAHole: true,
      });
    }
  }

  return variantDescriptions;
}

function getFunnelsVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Funnels (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      funnels: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Funnels & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        funnels: true,
      });
    }
  }

  return variantDescriptions;
}

function getChimneysVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Create the basic variants.
  for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
    const variantName = `Chimneys (${numSuits} Suits)`;
    variantDescriptions.push({
      name: variantName,
      suits: basicVariantSuits[numSuits],
      chimneys: true,
    });
  }

  // Create combinations with special suits.
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      const variantName = `Chimneys & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        chimneys: true,
      });
    }
  }

  return variantDescriptions;
}

function getSudokuVariants(
  suitsToCreateVariantsFor: readonly SuitJSON[],
  basicVariantSuits: BasicVariantSuits,
): readonly VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // Sudoku only makes sense for 4 or 5 suits, since we need as many suits as ranks per suit.
  const sudokuSuitNumbers = [4, 5] as const;

  // Create the basic variant. Note that for sudoku, we only want 4 or 5-suit variants.
  for (const numSuits of sudokuSuitNumbers) {
    if (numSuits === 5) {
      variantDescriptions.push({
        name: `Sudoku (${numSuits} Suits)`,
        suits: basicVariantSuits[numSuits].slice(0, numSuits),
        sudoku: true,
      });
    } else {
      variantDescriptions.push({
        name: `Sudoku (${numSuits} Suits)`,
        suits: basicVariantSuits[numSuits].slice(0, numSuits),
        sudoku: true,
        stackSize: numSuits,
        clueRanks: DEFAULT_CLUE_RANKS.slice(0, numSuits),
      });
    }
  }

  // Create combinations with special suits.
  for (const numSuits of sudokuSuitNumbers) {
    for (const suit of suitsToCreateVariantsFor) {
      const variantName = `Sudoku & ${suit.name} (${numSuits} Suits)`;
      const numBasicSuits = (numSuits - 1) as Subtract<typeof numSuits, 1>;
      const basicSuits = basicVariantSuits[numBasicSuits];
      const variantSuits = [...basicSuits.slice(0, numSuits - 1), suit.name];

      if (numSuits === 5) {
        variantDescriptions.push({
          name: variantName,
          suits: variantSuits,
          sudoku: true,
        });
      } else {
        variantDescriptions.push({
          name: variantName,
          suits: variantSuits,
          sudoku: true,
          stackSize: numSuits,
          clueRanks: DEFAULT_CLUE_RANKS.slice(0, numSuits),
        });
      }
    }
  }

  return variantDescriptions;
}

function maxRequiredVariantEfficiency(variant: Variant): number {
  const requiredEfficiencies = VALID_NUM_PLAYERS.map((numPlayers) => {
    const options = {
      ...defaultOptions,
      numPlayers,
    };
    const cardsPerHand = getCardsPerHand(options);

    return getMinEfficiency(numPlayers, numPlayers, variant, cardsPerHand);
  });

  return Math.max(...requiredEfficiencies);
}

function minVariantPace(variant: Variant): number {
  const startingPaces = VALID_NUM_PLAYERS.map((numPlayers) => {
    const options = {
      ...defaultOptions,
      numPlayers,
    };

    const cardsPerHand = getCardsPerHand(options);
    const startingDeckSize = getStartingDeckSize(
      options.numPlayers,
      cardsPerHand,
      variant,
    );

    return getStartingPace(startingDeckSize, variant.maxScore, numPlayers);
  });

  return Math.min(...startingPaces);
}

function isVariantAllowed(
  colorsMap: ReadonlyMap<string, Color>,
  suitsMap: ReadonlyMap<string, Suit>,
  variantDescription: VariantDescription,
): boolean {
  const variant = createVariant(colorsMap, suitsMap, variantDescription, 0, "");

  if (getTotalCardsInDeck(variant) < MINIMUM_CARD_COUNT) {
    return false;
  }

  if (minVariantPace(variant) < 0) {
    return false;
  }

  if (
    maxRequiredVariantEfficiency(variant) > MAX_ALLOWED_EFFICIENCY_THRESHOLD
  ) {
    return false;
  }

  return true;
}
