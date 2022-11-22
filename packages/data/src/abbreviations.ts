import { Suit } from "./types/Suit";

export const KNOWN_TRASH_NOTES = ["kt", "trash", "stale", "bad"];
export const CHOP_MOVED_NOTES = [
  "cm",
  "chop move",
  "chop moved",
  "5cm", // 5's chop move
  "e5cm", // early 5's chop move
  "tcm", // trash chop move
  "tccm", // tempo clue chop move
  "sdcm", // scream discard chop move
  "sbpcm", // scream blind play chop move
  "ocm", // order chop move
  "tocm", // trash order chop move
  "mcm", // misplay chop move
  "utfcm", // unnecessary trash finesse chop move
  "utdcm", // unnecessary trash finesse chop move
  "utbcm", // unnecessary trash bluff chop move
];
export const FINESSED_NOTES = ["f", "hf", "pf", "gd", "utf"];
export const NEEDS_FIX_NOTES = ["fix", "fixme", "needs fix"];
export const BLANK_NOTES = ["blank"];
export const CLUED_NOTES = ["clued", "cl"];
export const UNCLUED_NOTES = ["unclued", "x"];

export const ALL_RESERVED_NOTES = ([] as string[]).concat(
  KNOWN_TRASH_NOTES,
  CHOP_MOVED_NOTES,
  FINESSED_NOTES,
  NEEDS_FIX_NOTES,
  BLANK_NOTES,
  CLUED_NOTES,
  UNCLUED_NOTES,
);

/**
 * Suit abbreviations are hard-coded in the "suits.json" file. In some variants, two or more suits
 * can have overlapping letter abbreviations. If this is the case, we dynamically find a new
 * abbreviation by using the left-most unused letter.
 *
 * Note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
 * there are too many overlapping possibilities.
 */
export function getSuitAbbreviationsForVariant(
  variantName: string,
  suits: Suit[],
): readonly string[] {
  const abbreviations: string[] = [];
  const skipLetters: string[] = ["d", "a", "r", "k"];

  for (const suit of suits) {
    let abbreviationToUse: string | undefined;
    if (!abbreviations.includes(suit.abbreviation)) {
      if (ALL_RESERVED_NOTES.includes(suit.abbreviation)) {
        throw new Error(
          `Suit abbreviation for "${suit.name}" in the variant of "${variantName}" conflicts with a reserved word.`,
        );
      }
      // There is no overlap with the normal abbreviation.
      abbreviationToUse = suit.abbreviation;
    } else {
      // There is an overlap with the normal abbreviation.
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < suit.displayName.length; i++) {
        const suitLetter = suit.displayName[i]!.toUpperCase();
        if (
          !abbreviations.includes(suitLetter) &&
          !ALL_RESERVED_NOTES.includes(suitLetter) &&
          !skipLetters.includes(suitLetter)
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

  // Validate that each suit has a unique abbreviation.
  const abbreviationSet = new Set(abbreviations);
  if (abbreviationSet.size !== abbreviations.length) {
    throw new Error(
      `The variant "${variantName}" has two suits with the same abbreviation: ${abbreviations.toString()}`,
    );
  }

  return abbreviations;
}
