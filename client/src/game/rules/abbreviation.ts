import { ALL_RESERVED_NOTES } from "../reducers/constants";
import Suit from "../types/Suit";
import Variant from "../types/Variant";

// Suit abbreviations are hard-coded in the "suits.json" file
// In some variants, two or more suits can have overlapping letter abbreviations
// If this is the case, dynamically find a new abbreviation by using the left-most unused letter
// (note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
// there are too many overlapping possibilities)
export function makeAll(variantName: string, suits: Suit[]): string[] {
  const abbreviations: string[] = [];
  for (const suit of suits) {
    let abbreviationToUse: string | undefined;
    if (!abbreviations.includes(suit.abbreviation)) {
      if (ALL_RESERVED_NOTES.indexOf(suit.abbreviation) !== -1) {
        throw new Error(
          `Suit abbreviation for "${suit.name}" in the variant of "${variantName}" conflicts with a reserved word.`,
        );
      }
      // There is no overlap with the normal abbreviation
      abbreviationToUse = suit.abbreviation;
    } else {
      // There is an overlap with the normal abbreviation
      for (let i = 0; i < suit.displayName.length; i++) {
        const suitLetter = suit.displayName[i].toUpperCase();
        if (
          !abbreviations.includes(suitLetter) &&
          ALL_RESERVED_NOTES.indexOf(suitLetter) === -1
        ) {
          abbreviationToUse = suitLetter;
          break;
        }
      }
    }
    if (abbreviationToUse === undefined) {
      throw new Error(
        `Failed to find a suit abbreviation for "${suit.name}" in the variant of "${variantName}".`,
      );
    }
    abbreviations.push(abbreviationToUse);
  }

  // Validate that each suit has a unique abbreviation
  const uniqueAbbreviations = [...new Set(abbreviations)];
  if (uniqueAbbreviations.length !== abbreviations.length) {
    throw new Error(
      `The variant "${variantName}" has two suits with the same abbreviation: ${abbreviations.toString()}`,
    );
  }

  return abbreviations;
}

export function get(suitName: string, variant: Variant): string {
  const i = variant.suits.findIndex((suit) => suit.name === suitName);
  if (i !== -1) {
    return variant.abbreviations[i];
  }

  return "?";
}
