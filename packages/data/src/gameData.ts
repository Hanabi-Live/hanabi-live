import { assertDefined } from "@hanabi/utils";
import { charactersInit } from "./charactersInit";
import { colorsInit } from "./colorsInit";
import { DEFAULT_VARIANT_NAME } from "./constants";
import type { Character } from "./interfaces/Character";
import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
import { suitsInit } from "./suitsInit";
import { variantsInit } from "./variantsInit";

/** Indexed by character ID. */
const CHARACTERS_MAP = charactersInit();

/** Indexed by color name. */
export const COLORS_MAP = colorsInit();

/** Indexed by suit name. */
export const SUITS_MAP = suitsInit(COLORS_MAP);

const VARIANTS_MAP_BY_NAME = variantsInit(COLORS_MAP, SUITS_MAP);

export const VARIANT_NAMES = [...VARIANTS_MAP_BY_NAME.keys()] as const;

const VARIANTS_MAP_BY_ID: ReadonlyMap<number, Variant> = (() => {
  const variantsMapByID = new Map<number, Variant>();

  for (const variant of VARIANTS_MAP_BY_NAME.values()) {
    variantsMapByID.set(variant.id, variant);
  }

  return variantsMapByID;
})();

export function getSuit(suitName: string): Suit {
  const suit = SUITS_MAP.get(suitName);
  assertDefined(
    suit,
    `Failed to find the "${suitName}" suit in the "SUITS" map.`,
  );

  return suit;
}

export function getVariant(variantName: string): Variant {
  const variant = VARIANTS_MAP_BY_NAME.get(variantName);
  assertDefined(
    variant,
    `Failed to find the "${variantName}" variant in the "VARIANTS" map.`,
  );

  return variant;
}

export function getVariantByID(variantID: number): Variant {
  const variant = VARIANTS_MAP_BY_ID.get(variantID);
  assertDefined(
    variant,
    `Failed to find the "${variantID}" variant in the "VARIANTS_BY_ID" map.`,
  );

  return variant;
}

export function getDefaultVariant(): Variant {
  return getVariant(DEFAULT_VARIANT_NAME);
}

export function doesVariantExist(variantName: string): boolean {
  return VARIANTS_MAP_BY_NAME.has(variantName);
}

export function getCharacter(characterID: number): Character {
  const character = CHARACTERS_MAP.get(characterID);
  assertDefined(
    character,
    `Failed to find the character corresponding to ID ${characterID} in the "CHARACTERS" map.`,
  );

  return character;
}
