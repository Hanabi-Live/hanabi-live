import { ReadonlySet } from "@hanabi/utils";

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
