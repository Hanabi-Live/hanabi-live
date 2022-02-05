import { SuitJSON } from "./types/SuitJSON";
import { VariantDescription } from "./types/VariantDescription";

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

export function getVariantsForEachSuit(
  suits: SuitJSON[],
  basicVariantSuits: string[][],
): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

  // We only want to create variants for certain suits
  // (e.g. "Red" does not get its own variants because it is a basic suit)
  const suitsToCreateVariantsFor = suits.filter((suit) => suit.createVariants);

  for (const suit of suitsToCreateVariantsFor) {
    for (const numSuits of [6, 5, 4, 3]) {
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

export function getVariantsForEachSpecialSuitCombination(): VariantDescription[] {
  const variantDescriptions: VariantDescription[] = [];

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
          id: getNextUnusedVariantID(variant_name),
          strId: convertSuitsToStrId(computed_variant_suits),
          suits: computed_variant_suits,
        });
      });
    });
  });

  return variantDescriptions;
}
