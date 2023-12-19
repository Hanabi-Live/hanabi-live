import type { Variant } from "@hanabi/game";

export function get(suitName: string, variant: Variant): string {
  const suitIndex = variant.suits.findIndex((suit) => suit.name === suitName);
  return variant.suitAbbreviations[suitIndex] ?? "?";
}
