import { Suit } from "./types/Suit";

export const KNOWN_TRASH_NOTES = ["kt", "trash", "stale", "bad"] as const;
export const CHOP_MOVED_NOTES = [
  "cm",
  "chop move",
  "chop moved",
  // cspell:disable
  "5cm", // 5's Chop Move
  "e5cm", // Early 5's Chop Move
  "tcm", // Trash Chop Move
  "tccm", // Tempo Clue Chop Move
  "sdcm", // Scream Discard Chop Move
  "esdcm", // Echo Scream Discard Chop Move
  "sbpcm", // Scream Blind Play Chop Move
  "ocm", // Order Chop Move
  "tocm", // Trash Order Chop Move
  "mcm", // Misplay Chop Move
  "utfcm", // Unnecessary Trash Finesse Chop Move
  "utbcm", // Unnecessary Trash Bluff Chop Move
  "utdcm", // Unnecessary Trash Discharge Chop Move
  "uddcm", // Unnecessary Dupe Discharge Chop Move
  "dtccm", // Duplicitous Tempo Clue Chop Move
  "atcm", // Assisted Trash Chop Move
  "ttcm", // Time Travel Chop Move
  // cspell:enable
] as const;
export const FINESSED_NOTES = [
  "f", // Finesse
  "hf", // Hidden Finesse
  "sf", // Sarcastic Finesse
  "cf", // Certain Finesse / Composition Finesse
  "pf", // Priority Finesse
  "gd", // Gentleman's Discard
] as const;
export const NEEDS_FIX_NOTES = ["fix", "fixme", "needs fix"] as const;
export const BLANK_NOTES = ["blank", "unknown"] as const;
export const CLUED_NOTES = ["clued", "cl"] as const;
export const UNCLUED_NOTES = ["unclued", "x"] as const;

export const ALL_RESERVED_NOTES: readonly string[] = [
  ...KNOWN_TRASH_NOTES,
  ...CHOP_MOVED_NOTES,
  ...FINESSED_NOTES,
  ...NEEDS_FIX_NOTES,
  ...BLANK_NOTES,
  ...CLUED_NOTES,
  ...UNCLUED_NOTES,
];

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
