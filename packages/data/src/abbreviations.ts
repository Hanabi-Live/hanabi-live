import { ReadonlySet, trimPrefix } from "isaacscript-common-ts";
import type { Suit } from "./interfaces/Suit";

export const KNOWN_TRASH_NOTES = ["kt", "trash", "stale", "bad"] as const;
export const QUESTION_MARK_NOTES = ["?"] as const;
export const EXCLAMATION_MARK_NOTES = ["!"] as const;

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
  "uutdcm", // Unnecessary Unknown Trash Discharge Chop Move
  "uuddcm", // Unnecessary Unknown Dupe Discharge Chop Move
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

/**
 * Contains only lowercase letters. Thus, when checking against the set, the input must also be
 * lowercase.
 */
export const ALL_RESERVED_NOTES = new ReadonlySet<string>([
  ...KNOWN_TRASH_NOTES,
  ...QUESTION_MARK_NOTES,
  ...EXCLAMATION_MARK_NOTES,
  ...CHOP_MOVED_NOTES,
  ...FINESSED_NOTES,
  ...NEEDS_FIX_NOTES,
  ...BLANK_NOTES,
  ...CLUED_NOTES,
  ...UNCLUED_NOTES,
]);

/**
 * Suit abbreviations are hard-coded in the "suits.json" file. In some variants, two or more suits
 * can have overlapping letter abbreviations. If this is the case, we dynamically find a new
 * abbreviation by using the left-most unused letter.
 *
 * Note that we cannot simply hard-code an alternate abbreviation in the "suits.json" file because
 * there are too many overlapping possibilities.
 */
export function getUppercaseSuitAbbreviationsForVariant(
  variantName: string,
  suits: readonly Suit[],
): readonly string[] {
  const lowercaseAbbreviations: string[] = [];

  for (const suit of suits) {
    const lowercaseAbbreviationToUse = getLowercaseSuitAbbreviationToUse(
      variantName,
      suit,
      lowercaseAbbreviations,
    );
    lowercaseAbbreviations.push(lowercaseAbbreviationToUse);
  }

  // Validate that each suit has a valid abbreviation.
  for (const abbreviation of lowercaseAbbreviations) {
    if (abbreviation.trim() === "") {
      throw new Error(
        `The variant "${variantName}" has an invalid suit abbreviation.`,
      );
    }
  }

  // Validate that each suit has a unique abbreviation.
  const abbreviationSet = new Set(lowercaseAbbreviations);
  if (abbreviationSet.size !== lowercaseAbbreviations.length) {
    throw new Error(
      `The variant "${variantName}" has two suits with the same abbreviation: ${lowercaseAbbreviations}`,
    );
  }

  return lowercaseAbbreviations.map((abbreviation) =>
    abbreviation.toUpperCase(),
  );
}

function getLowercaseSuitAbbreviationToUse(
  variantName: string,
  suit: Suit,
  lowercaseAbbreviationsUsedSoFar: readonly string[],
): string {
  const lowercaseAbbreviation = suit.abbreviation.toLowerCase();
  if (!lowercaseAbbreviationsUsedSoFar.includes(lowercaseAbbreviation)) {
    return lowercaseAbbreviation;
  }

  // There is an overlap with the normal abbreviation.
  const suitCharactersToConsider = trimPrefix(suit.displayName, "Dark ");
  for (const suitCharacter of suitCharactersToConsider) {
    if (suitCharacter === " ") {
      continue;
    }

    const suitLetterLowercase = suitCharacter.toLowerCase();
    if (
      !lowercaseAbbreviationsUsedSoFar.includes(suitLetterLowercase) &&
      !ALL_RESERVED_NOTES.has(suitLetterLowercase) // e.g. Ban "f"
    ) {
      return suitLetterLowercase;
    }
  }

  throw new Error(
    `Failed to find a suit abbreviation for "${suit.name}" in the variant of "${variantName}". (We went through every letter and did not find a match.)`,
  );
}
