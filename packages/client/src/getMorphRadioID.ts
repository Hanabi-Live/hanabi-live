import type { Rank } from "@hanabi-live/game";

/** IDs must use the suit index: two suits can have the same base abbreviation. */
export function getMorphRadioID(suitIndex: number, rank: Rank): string {
  return `morph-radio-${suitIndex}-${rank}`;
}
