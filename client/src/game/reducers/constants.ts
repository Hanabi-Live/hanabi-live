export const CHOP_MOVED_NOTES = [
  "cm",
  "chop move",
  "chop moved",
  "5cm",
  "e5cm",
  "tcm",
  "tccm",
  "sdcm",
  "sbpcm",
  "ocm",
  "tocm",
  "utfcm",
  "utbcm",
];
export const KNOWN_TRASH_NOTES = ["kt", "trash", "stale", "bad"];
export const FINESSED_NOTES = ["f", "hf", "pf", "gd"];
export const NEEDS_FIX_NOTES = ["fix", "fixme", "needs fix"];
export const BLANK_NOTES = ["blank"];
export const UNCLUED_NOTES = ["unclued"];
export const CLUED_NOTES = ["clued"];
export const ALL_RESERVED_NOTES = KNOWN_TRASH_NOTES.concat(
  CHOP_MOVED_NOTES,
  FINESSED_NOTES,
  NEEDS_FIX_NOTES,
  BLANK_NOTES,
  CLUED_NOTES,
  UNCLUED_NOTES,
);
