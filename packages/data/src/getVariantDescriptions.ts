import { DEFAULT_CLUE_RANKS } from "./constants";
import { SuitJSON } from "./types/SuitJSON";
import { VariantDescription } from "./types/VariantDescription";

const STANDARD_VARIANT_SUIT_AMOUNTS = [6, 5, 4, 3];
const SPECIAL_RANKS = [1, 5];

/** These are suit properties that are transferred to special ranks. */
const SUIT_SPECIAL_PROPERTIES = [
  "allClueColors",
  "noClueColors",
  "allClueRanks",
  "noClueRanks",
] as const;

const SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS = new Set<string>([
  "Rainbow",
  "Prism",
  "Dark Prism", // This is the same as Dark Rainbow
]);

const SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_SYNESTHESIA = new Set<string>([
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

export function getBasicVariants(
  basicVariantSuits: string[][],
): VariantDescription[] {
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
export function getVariantsForEachSuit(
  suitsToCreateVariantsFor: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
      // It would be too difficult to have a 4 suit variant or a 3 suits variant with a one-of-each
      // suit
      if ((numSuits === 4 || numSuits === 3) && suit.oneOfEach === true) {
        continue;
      }

      const varianName = `${suit.name} (${numSuits} Suits)`;
      const basicSuits = basicVariantSuits[numSuits - 1];
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
export function getVariantsForEachSpecialSuitCombination(
  suitsToCreateVariantsFor: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
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
        suit.allClueColors === suit2.allClueColors &&
        suit.allClueRanks === suit2.allClueRanks &&
        suit.noClueColors === suit2.noClueColors &&
        suit.noClueRanks === suit2.noClueRanks &&
        suit.prism === suit2.prism
      ) {
        continue;
      }

      if (
        combinationVariantNames.has(suit.name + suit2.name) ||
        combinationVariantNames.has(suit2.name + suit.name)
      ) {
        continue;
      }

      combinationVariantNames.add(suit.name + suit2.name);

      for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
        // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
        // one-of-each suit
        if (
          (numSuits === 4 || numSuits === 3) &&
          (suit.oneOfEach === true || suit2.oneOfEach === true)
        ) {
          continue;
        }

        // It would be too difficult to have a 5 suit variant with two one-of-each suits
        if (
          numSuits === 5 &&
          suit.oneOfEach === true &&
          suit2.oneOfEach === true
        ) {
          continue;
        }

        const variantName = `${suit.name} & ${suit2.name} (${numSuits} Suits)`;
        const basicSuits = basicVariantSuits[numSuits - 2];
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
export function getVariantsForSpecialRanks(
  suitsToCreateVariantsFor: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  for (const specialRank of SPECIAL_RANKS) {
    const specialRankName = getSpecialRankName(specialRank);
    const specialClueRanks = DEFAULT_CLUE_RANKS.filter(
      (clueRank) => clueRank !== specialRank,
    );

    for (const suit of suitsToCreateVariantsFor) {
      // There are no one-of-each special ranks (e.g. Black-Ones)
      if (suit.oneOfEach === true) {
        continue;
      }

      // There are no prism special ranks (e.g. Prism-Ones)
      if (suit.prism === true) {
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
          // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
          // one-of-each suit
          if ((numSuits === 4 || numSuits === 3) && suit2.oneOfEach === true) {
            continue;
          }

          const hyphenatedSuitName = suit.name.replace(" ", "-");
          const variantName = `${hyphenatedSuitName}-${specialRankName} & ${suit2.name} (${numSuits} Suits)`;
          const basicSuits = basicVariantSuits[numSuits - 1];
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

    // Add variants for Deceptive-Ones and Deceptive-Fives
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
        specialDeceptive: true,
        clueRanks: specialClueRanks,
      };
      variantDescriptions.push(variantDescription);
    }

    // Second, create the special suit combinations, e.g. "Deceptive-Ones & Rainbow (6 Suits)"
    for (const suit of suitsToCreateVariantsFor) {
      for (const numSuits of STANDARD_VARIANT_SUIT_AMOUNTS) {
        // It would be too difficult to have a 4 suit variant or a 3 suits variant with a
        // one-of-each suit
        if ((numSuits === 4 || numSuits === 3) && suit.oneOfEach === true) {
          continue;
        }

        const variantName = `${variantNamePrefix} & ${suit.name} (${numSuits} Suits)`;
        const basicSuits = basicVariantSuits[numSuits - 1];
        const variantSuits = [...basicSuits, suit.name];
        const variantDescription: VariantDescription = {
          name: variantName,
          suits: variantSuits,
          specialRank,
          specialDeceptive: true,
          clueRanks: specialClueRanks,
        };
        variantDescriptions.push(variantDescription);
      }
    }
  }

  return variantDescriptions;
}

function getSpecialRankName(specialRank: number) {
  if (specialRank === 1) {
    return "Ones";
  }

  if (specialRank === 5) {
    return "Fives";
  }

  throw new Error(
    `Failed to get the name for the special rank of: ${specialRank}`,
  );
}

function getVariantDescriptionForSpecialRankVariant(
  name: string,
  suits: string[],
  specialRank: number,
  suit: SuitJSON,
  specialClueRanks: number[],
): VariantDescription {
  const variantDescription: VariantDescription = {
    name,
    suits,
    specialRank,
  };

  // Fill in the behavior for what the special rank will do
  for (const specialProperty of SUIT_SPECIAL_PROPERTIES) {
    if (suit[specialProperty as keyof SuitJSON] === true) {
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
  suitSpecialProperty: string,
) {
  switch (suitSpecialProperty) {
    case "allClueColors": {
      return "specialAllClueColors";
    }

    case "noClueColors": {
      return "specialNoClueColors";
    }

    case "allClueRanks": {
      return "specialAllClueRanks";
    }

    case "noClueRanks": {
      return "specialNoClueRanks";
    }

    default: {
      throw new Error(
        `Failed to get the variant property for the suit property of: ${suitSpecialProperty}`,
      );
    }
  }
}

export function getAmbiguousVariants(
  suitsToCreateVariantsFor: SuitJSON[],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const redAmbiguousSuits = ["Tomato", "Mahogany"];
  const greenAmbiguousSuits = ["Lime", "Forest"];
  const blueAmbiguousSuits = ["Sky", "Navy"];

  const ambiguousSuits: string[][] = [];
  ambiguousSuits[2] = [...redAmbiguousSuits];
  ambiguousSuits[4] = [...redAmbiguousSuits, ...blueAmbiguousSuits];
  ambiguousSuits[6] = [
    ...redAmbiguousSuits,
    ...greenAmbiguousSuits,
    ...blueAmbiguousSuits,
  ];

  // Create the basic Ambiguous variants
  variantDescriptions.push({
    name: "Ambiguous (6 Suits)",
    suits: ambiguousSuits[6],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Ambiguous (4 Suits)",
    suits: ambiguousSuits[4],
    showSuitNames: true,
  });

  // Create Ambiguous combinations with special suits
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [4, 2]) {
      const incrementedNumSuits = numSuits + 1;

      // It would be too difficult to have a 3 suits variant with a one-of-each suit
      if (incrementedNumSuits === 3 && suit.oneOfEach === true) {
        continue;
      }

      // For some suits:
      // "Ambiguous & X (3 Suit)" is the same as "Very Ambiguous (3 Suit)"
      if (
        incrementedNumSuits === 3 &&
        SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.has(suit.name)
      ) {
        continue;
      }

      const variantName = `Ambiguous & ${suit.name} (${incrementedNumSuits} Suits)`;
      const baseSuits = ambiguousSuits[numSuits];
      const variantSuits = [...baseSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        showSuitNames: true,
      });
    }
  }

  return variantDescriptions;
}

export function getVeryAmbiguousVariants(
  suitsToCreateVariantsFor: SuitJSON[],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const redVeryAmbiguousSuits = ["Tomato VA", "Carrot VA", "Mahogany VA"];
  const blueVeryAmbiguousSuits = ["Sky VA", "Berry VA", "Navy VA"];

  const veryAmbiguousSuits: string[][] = [];
  // For "Very Ambiguous (3 Suits)", we use blue suits instead of red suits so that this will align
  // better with the Extremely Ambiguous variants (Extremely Ambiguous uses blue suits because it
  // is easier to come up with suit names for blue cards than it is for red cards)
  veryAmbiguousSuits[3] = [...blueVeryAmbiguousSuits];
  veryAmbiguousSuits[6] = [...redVeryAmbiguousSuits, ...blueVeryAmbiguousSuits];

  // Create the basic Very Ambiguous variants
  variantDescriptions.push({
    name: "Very Ambiguous (6 Suits)",
    suits: veryAmbiguousSuits[6],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Very Ambiguous (3 Suits)",
    suits: veryAmbiguousSuits[3],
    showSuitNames: true,
  });

  // Create Very Ambiguous combinations with special suits
  for (const suit of suitsToCreateVariantsFor) {
    // It would be too difficult to have a 4 suit variant with a one-of-each suit
    if (suit.oneOfEach === true) {
      continue;
    }

    // For some suits:
    // "Very Ambiguous + X (4 Suit)" is the same as "Extremely Ambiguous (4 Suit)"
    if (SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_AMBIGUOUS.has(suit.name)) {
      continue;
    }

    const variantName = `Very Ambiguous & ${suit.name} (4 Suits)`;
    const baseSuits = veryAmbiguousSuits[3];
    const variantSuits = [...baseSuits, suit.name];
    variantDescriptions.push({
      name: variantName,
      suits: variantSuits,
      showSuitNames: true,
    });
  }

  return variantDescriptions;
}

export function getExtremelyAmbiguousVariants(
  suitsToCreateVariantsFor: SuitJSON[],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const extremelyAmbiguousSuits: string[][] = [];
  extremelyAmbiguousSuits[4] = ["Ice EA", "Sapphire EA", "Sky EA", "Berry EA"];
  extremelyAmbiguousSuits[5] = [...extremelyAmbiguousSuits[4], "Navy EA"];
  extremelyAmbiguousSuits[6] = [...extremelyAmbiguousSuits[5], "Ocean EA"];

  // Create the basic Extremely Ambiguous variants
  variantDescriptions.push({
    name: "Extremely Ambiguous (6 Suits)",
    suits: extremelyAmbiguousSuits[6],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Extremely Ambiguous (5 Suits)",
    suits: extremelyAmbiguousSuits[5],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Extremely Ambiguous (4 Suits)",
    suits: extremelyAmbiguousSuits[4],
    showSuitNames: true,
  });

  // Create Extremely Ambiguous combinations with special suits
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [5, 4]) {
      const incrementedNumSuits = numSuits + 1;

      // It would be too difficult to have a 4 suit variant with a one-of-each suit
      if (incrementedNumSuits === 4 && suit.oneOfEach === true) {
        continue;
      }

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
        showSuitNames: true,
      });
    }
  }

  return variantDescriptions;
}

export function getDualColorsVariants(
  suitsToCreateVariantsFor: SuitJSON[],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  const dualColorSuits: string[][] = [];
  dualColorSuits[3] = ["Orange D2", "Purple D", "Green D"];
  dualColorSuits[5] = [
    "Orange D2",
    "Lime D",
    "Teal D",
    "Indigo D",
    "Cardinal D",
  ];
  dualColorSuits[6] = [
    "Orange D",
    "Purple D",
    "Mahogany D",
    "Green D",
    "Tan D",
    "Navy D",
  ];

  // Create the basic Dual-Color variants
  variantDescriptions.push({
    name: "Dual-Color (6 Suits)",
    suits: dualColorSuits[6],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Dual-Color (5 Suits)",
    suits: dualColorSuits[5],
    showSuitNames: true,
  });
  variantDescriptions.push({
    name: "Dual-Color (3 Suits)",
    suits: dualColorSuits[3],
    showSuitNames: true,
  });

  // Create Dual-Color combinations with special suits
  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [5, 3]) {
      const incrementedNumSuits = numSuits + 1;

      // It would be too difficult to have a 4 suit variant with a one-of-each suit
      if (incrementedNumSuits === 4 && suit.oneOfEach === true) {
        continue;
      }

      const variantName = `Dual-Color & ${suit.name} (${incrementedNumSuits} Suits)`;
      const baseSuits = dualColorSuits[numSuits];
      const variantSuits = [...baseSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        showSuitNames: true,
      });
    }
  }

  return variantDescriptions;
}

export function getMixVariants(): VariantDescription[] {
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
      showSuitNames: true,
    },
    {
      name: "Dual-Color Mix",
      suits: ["Orange D2", "Purple D", "Green D", "Black", "Rainbow", "White"],
      showSuitNames: true,
    },
    {
      name: "Ambiguous & Dual-Color",
      suits: [
        "Tangelo AD",
        "Peach AD",
        "Orchid AD",
        "Violet AD",
        "Lime AD",
        "Forest AD",
      ],
      showSuitNames: true,
    },
  ];
}

export function getBlindVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Color Blind (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CB`,
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Number Blind (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:NB`,
      suits: variant_suits[suit_num],
      rankCluesTouchNothing: true,
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Totally Blind (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:TB`,
      suits: variant_suits[suit_num],
      colorCluesTouchNothing: true,
      rankCluesTouchNothing: true,
    });
  });

  return variantDescriptions;
}

function getMuteVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Color Mute (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CM`,
      suits: variant_suits[suit_num],
      clueColors: [],
    });
  });

  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Number Mute (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:NM`,
      suits: variant_suits[suit_num],
      clueRanks: [],
    });
  });

  return variantDescriptions;
}

function getAlternatingCluesVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Alternating Clues (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
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
      if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach === true) {
        return;
      }

      const variantName = `Alternating Clues & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:AC`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        alternatingClues: true,
      });
    });
  });
  return variantDescriptions;
}

function getClueStarvedVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  [6, 5].forEach((suit_num) => {
    const variantName = `Clue Starved (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CS`,
      suits: variant_suits[suit_num],
      clueStarved: true,
    });
  });

  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach === true) {
      return;
    }

    [6, 5].forEach((suit_num) => {
      // 4 suits and 3 suits would be too difficult
      const variantName = `Clue Starved & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:CS`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        clueStarved: true,
      });
    });
  });

  return variantDescriptions;
}

function getCowAndPigVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Cow & Pig (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:CP`,
      suits: variant_suits[suit_num],
      cowPig: true,
    });
  });
  return variantDescriptions;
}

function getDuckVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Duck (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:Du`,
      suits: variant_suits[suit_num],
      duck: true,
    });
  });

  return variantDescriptions;
}

function getThrowItInAHoleVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4].forEach((suit_num) => {
    // 3 suits would be too difficult
    const variantName = `Throw It in a Hole (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:TH`,
      suits: variant_suits[suit_num],
      throwItInHole: true,
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach === true) {
      // Throw It in a Hole & Black (6 Suits)" is 1.88 required efficiency in 5-player
      return;
    }

    [6, 5, 4].forEach((suit_num) => {
      // 3 suits would be too difficult
      const variantName = `Throw It in a Hole & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}:TH`,
        suits: [...variant_suits[suit_num - 1], suit_name],
        throwItInHole: true,
      });
    });
  });

  return variantDescriptions;
}

function getReversedVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Reversed (${suit_num} Suits)`;
    const reversed_variant_suits = [...variant_suits[suit_num]];
    reversed_variant_suits[suit_num - 1] += SUIT_REVERSED_SUFFIX;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
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
      if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach === true) {
        return;
      }

      const variantName = `${new_suit_name} (${suit_num} Suits)`;
      const computed_variant_suits = [
        ...variant_suits[suit_num - 1],
        new_suit_name,
      ];
      variants.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
        strId: `${convertSuitsToStrId([
          ...variant_suits[suit_num - 1],
          suit_name,
        ])}/R`,
        suits: computed_variant_suits,
      });
    });
  });

  return variantDescriptions;
}

function getUpOrDownVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variantName = `Up or Down (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
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

    if (suit.oneOfEach === true) {
      // A one of each suit in combination with Up or Down would be too difficult
      return;
    }

    [6, 5].forEach((suit_num) => {
      const variantName = `Up or Down & ${suit_name} (${suit_num} Suits)`;
      variants.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
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

  return variantDescriptions;
}

function getSynesthesiaVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  [6, 5, 4, 3].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variantName = `Synesthesia (${suit_num} Suits)`;
    variants.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
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
      SUITS_THAT_CAUSE_DUPLICATED_VARIANTS_WITH_SYNESTHESIA.includes(suit_name)
    ) {
      return;
    }

    [6, 5, 4, 3].forEach((suit_num) => {
      if (suit_num === 3 && suit.oneOfEach === true) {
        return;
      }

      const variantName = `Synesthesia & ${suit_name} (${suit_num} Suits)`;
      const basicSuits = basicVariantSuits[numSuits - 1];
      const variantSuits = [...basicVariantSuits, suit.name];
      variantDescriptions.push({
        name: variantName,
        suits: variantSuits,
        clueRanks: [],
        synesthesia: true,
      });
    });
  });

  return variantDescriptions;
}

function getCriticalFoursVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5].forEach((suit_num) => {
    // 4 suits and 3 suits would be too difficult
    const variantName = `Critical Fours (${suit_num} Suits)`;
    variantDescriptions.push({
      name: variantName,
      id: getNextUnusedVariantID(variantName),
      strId: `${convertSuitsToStrId(variant_suits[suit_num])}:C4`,
      suits: variant_suits[suit_num],
      criticalFours: true,
    });
  });
  suits.forEach((suit, suit_name) => {
    if (!suit.createVariants) {
      return;
    }

    if (suit.oneOfEach === true) {
      // A one of each suit in combination with Critical Fours would be too difficult
      return;
    }

    [6, 5].forEach((suit_num) => {
      // 4 suits and 3 suits would be too difficult
      const variantName = `Critical Fours & ${suit_name} (${suit_num} Suits)`;
      variantDescriptions.push({
        name: variantName,
        suits: [...variant_suits[suit_num - 1], suit_name],
        criticalFours: true,
      });
    });
  });

  return variantDescriptions;
}

export function getOddsAndEvensVariants(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];
  [6, 5, 4, 3].forEach((suit_num) => {
    const variantName = `Odds and Evens (${suit_num} Suits)`;
    const basicSuits = basicVariantSuits[numSuits];
    variantDescriptions.push({
      name: variantName,
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
      if ((suit_num === 4 || suit_num === 3) && suit.oneOfEach === true) {
        return;
      }

      const variantName = `Odds and Evens & ${suit_name} (${suit_num} Suits)`;
      variantDescriptions.push({
        name: variantName,
        id: getNextUnusedVariantID(variantName),
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

  return variantDescriptions;
}
