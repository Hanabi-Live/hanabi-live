import { SuitJSON } from "./types/SuitJSON";
import { VariantDescription } from "./types/VariantDescription";

const STANDARD_VARIANT_SUIT_AMOUNTS = [6, 5, 4, 3];

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
  suits: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // We only want to create variants for certain suits
  // (e.g. "Red" does not get its own variants because it is a basic suit)
  const suitsToCreateVariantsFor = suits.filter((suit) => suit.createVariants);

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
  suits: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // We only want to create variants for certain suits
  // (e.g. "Red" does not get its own variants because it is a basic suit)
  const suitsToCreateVariantsFor = suits.filter((suit) => suit.createVariants);

  /** Indexed by variant name. */
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
