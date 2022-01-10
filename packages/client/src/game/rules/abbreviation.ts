import { Variant } from "@hanabi/data";

export function get(suitName: string, variant: Variant): string {
  const i = variant.suits.findIndex((suit) => suit.name === suitName);
  if (i !== -1) {
    return variant.suitAbbreviations[i];
  }

  return "?";
}
