import { charactersInit } from "./charactersInit";
import { colorsInit } from "./colorsInit";
import { DEFAULT_VARIANT_NAME } from "./constants";
import type { Character } from "./interfaces/Character";
import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
import { suitsInit } from "./suitsInit";
import { variantsInit } from "./variantsInit";

/** Indexed by character ID. */
const CHARACTERS = charactersInit();

/** Indexed by color name. */
const COLORS = colorsInit();

/** Indexed by suit name. */
const SUITS = suitsInit(COLORS);

/** Indexed by variant name. */
const VARIANTS = variantsInit(COLORS, SUITS);

export const VARIANT_NAMES = [...VARIANTS.keys()] as const;

/** Indexed by variant ID. */
const VARIANTS_BY_ID: ReadonlyMap<number, Variant> = (() => {
  const variantsMapByID = new Map<number, Variant>();

  for (const variant of VARIANTS.values()) {
    variantsMapByID.set(variant.id, variant);
  }

  return variantsMapByID;
})();

export function getSuit(suitName: string): Suit {
  const suit = SUITS.get(suitName);
  if (suit === undefined) {
    throw new Error(
      `Failed to find the "${suitName}" suit in the "SUITS" map.`,
    );
  }

  return suit;
}

export function getVariant(variantName: string): Variant {
  const variant = VARIANTS.get(variantName);
  if (variant === undefined) {
    throw new Error(
      `Failed to find the "${variantName}" variant in the "VARIANTS" map.`,
    );
  }

  return variant;
}

export function getVariantByID(variantID: number): Variant {
  const variant = VARIANTS_BY_ID.get(variantID);
  if (variant === undefined) {
    throw new Error(
      `Failed to find the #"${variantID}" variant in the "VARIANTS" map.`,
    );
  }

  return variant;
}

export function getDefaultVariant(): Variant {
  return getVariant(DEFAULT_VARIANT_NAME);
}

export function doesVariantExist(variantName: string): boolean {
  return VARIANTS.has(variantName);
}

export function getCharacter(characterID: number): Character {
  const character = CHARACTERS.get(characterID);
  if (character === undefined) {
    throw new Error(
      `Failed to find the character corresponding to ID ${characterID} in the "CHARACTERS" map.`,
    );
  }

  return character;
}
