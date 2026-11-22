import { assertDefined } from "complete-common";
import { charactersInit } from "./charactersInit.ts";
import { colorsInit } from "./colorsInit.ts";
import { DEFAULT_VARIANT_NAME } from "./generated/protocol.ts";
import type { Character } from "./interfaces/Character.ts";
import type { Suit } from "./interfaces/Suit.ts";
import type { Variant } from "./interfaces/Variant.ts";
import type { VariantRules } from "./interfaces/VariantRules.ts";
import { suitsInit } from "./suitsInit.ts";
import { createVariant, variantsInit } from "./variantsInit.ts";

/** Indexed by character ID. */
const CHARACTERS_MAP = charactersInit();

/** Indexed by color name. */
export const COLORS_MAP = colorsInit();

/** Indexed by suit name. */
export const SUITS_MAP = suitsInit(COLORS_MAP);

const variantsByName = new Map(variantsInit(COLORS_MAP, SUITS_MAP));

export const VARIANT_NAMES = [...variantsByName.keys()] as const;

const variantsById = new Map<number, Variant>();
for (const variant of variantsByName.values()) {
  variantsById.set(variant.id, variant);
}

/**
 * Builds a variant from the rules that the server sends, and adds it to the variants that
 * `getVariant` and `getVariantById` find. It takes the place of the variant with the same ID. A
 * client needs no catalog for a variant that it adds.
 */
export function addVariant(rules: VariantRules): Variant {
  const colors = colorsInit(rules.colors);
  const suits = suitsInit(colors, rules.suits);
  const variant = createVariant(
    colors,
    suits,
    rules.variant,
    rules.variant.id,
    rules.variant.recipe,
  );
  const previous = variantsById.get(variant.id);
  if (previous !== undefined) {
    variantsByName.delete(previous.name);
  }
  variantsById.set(variant.id, variant);
  variantsByName.set(variant.name, variant);
  return variant;
}

export function getSuit(suitName: string): Suit {
  const suit = SUITS_MAP.get(suitName);
  assertDefined(
    suit,
    `Failed to find the "${suitName}" suit in the "SUITS" map.`,
  );

  return suit;
}

export function getVariant(variantName: string): Variant {
  const variant = variantsByName.get(variantName);
  assertDefined(
    variant,
    `Failed to find the "${variantName}" variant in the "VARIANTS" map.`,
  );

  return variant;
}

export function getVariantById(variantId: number): Variant {
  const variant = variantsById.get(variantId);
  assertDefined(
    variant,
    `Failed to find the "${variantId}" variant in the "VARIANTS_BY_ID" map.`,
  );

  return variant;
}

export function doesVariantIdExist(variantId: number): boolean {
  return variantsById.has(variantId);
}

export function getDefaultVariant(): Variant {
  return getVariant(DEFAULT_VARIANT_NAME);
}

export function doesVariantExist(variantName: string): boolean {
  return variantsByName.has(variantName);
}

export function getCharacter(characterId: number): Character {
  const character = CHARACTERS_MAP.get(characterId);
  assertDefined(
    character,
    `Failed to find the character corresponding to ID ${characterId} in the "CHARACTERS" map.`,
  );

  return character;
}

export function getCharacters(): readonly Character[] {
  return [...CHARACTERS_MAP.values()];
}
