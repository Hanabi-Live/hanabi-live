import Character from "../types/Character";
import { START_CARD_RANK } from "../types/constants";
import Suit from "../types/Suit";
import Variant from "../types/Variant";
import charactersInit from "./charactersInit";
import colorsInit from "./colorsInit";
import suitsInit from "./suitsInit";
import variantsInit from "./variantsInit";

// Objects representing JSON files
export const COLORS = colorsInit();
export const SUITS = suitsInit(COLORS);
export const VARIANTS = variantsInit(COLORS, SUITS, START_CARD_RANK);
export const CHARACTERS = charactersInit();

export const getSuit = (suitName: string): Suit => {
  const suit = SUITS.get(suitName);
  if (suit === undefined) {
    throw new Error(
      `Failed to find the "${suitName}" suit in the "SUITS" map.`,
    );
  }
  return suit;
};

export const getVariant = (variantName: string): Variant => {
  const variant = VARIANTS.get(variantName);
  if (variant === undefined) {
    throw new Error(
      `Failed to find the "${variantName}" variant in the "VARIANTS" map.`,
    );
  }
  return variant;
};

export const getCharacter = (characterID: number): Character => {
  const character = CHARACTERS.get(characterID);
  if (character === undefined) {
    throw new Error(
      `Failed to find the character corresponding to ID ${characterID} in the "CHARACTERS" map.`,
    );
  }
  return character;
};
