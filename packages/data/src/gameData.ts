import { DEFAULT_VARIANT_NAME, Variant } from ".";
import { charactersInit } from "./charactersInit";
import { colorsInit } from "./colorsInit";
import { START_CARD_RANK } from "./constants";
import { suitsInit } from "./suitsInit";
import { Character } from "./types/Character";
import { Suit } from "./types/Suit";
import { variantsInit } from "./variantsInit";

/** Indexed by character ID. */
const CHARACTERS = charactersInit();

/** Indexed by color name. */
const COLORS = colorsInit();

/** Indexed by suit name. */
const SUITS = suitsInit(COLORS);

/** Indexed by variant name. */
const VARIANTS = variantsInit(COLORS, SUITS, START_CARD_RANK);

/** Indexed by variant ID */
const VARIANTS_BY_ID = getVariantsMapById();

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
  if (variant !== undefined) {
    return variant;
  }
  throw new Error(
    `Failed to find the #"${variantID}" variant in the "VARIANTS" map.`,
  );
}

export function getDefaultVariant(): Variant {
  return getVariant(DEFAULT_VARIANT_NAME);
}

export function getVariantNames(): readonly string[] {
  return Array.from(VARIANTS.keys());
}

export function doesVariantExist(variantName: string) {
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

function getVariantsMapById(): ReadonlyMap<number, Variant> {
  const mapByID = new Map<number, Variant>();
  for (const v of Array.from(VARIANTS.values())) {
    mapByID.set(v.id, v);
  }

  return mapByID;
}
