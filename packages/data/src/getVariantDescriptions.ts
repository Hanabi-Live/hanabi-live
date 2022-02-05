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
