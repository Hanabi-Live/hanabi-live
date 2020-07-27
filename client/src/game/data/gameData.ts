import { START_CARD_RANK } from '../types/constants';
import charactersInit from './charactersInit';
import colorsInit from './colorsInit';
import suitsInit from './suitsInit';
import variantsInit from './variantsInit';

// Objects representing JSON files
export const COLORS = colorsInit();
export const SUITS = suitsInit(COLORS);
export const VARIANTS = variantsInit(COLORS, SUITS, START_CARD_RANK);
export const CHARACTERS = charactersInit();

export const getSuit = (suitName: string) => {
  const suit = SUITS.get(suitName);
  if (suit === undefined) {
    throw new Error(`Unable to find the "${suitName}" suit in the "SUITS" map.`);
  }
  return suit;
};

export const getVariant = (variantName: string) => {
  const variant = VARIANTS.get(variantName);
  if (variant === undefined) {
    throw new Error(`Unable to find the "${variantName}" variant in the "VARIANTS" map.`);
  }
  return variant;
};

export const getCharacter = (characterID: number) => {
  const character = CHARACTERS.get(characterID);
  if (character === undefined) {
    throw new Error(`Unable to find the character corresponding to ID ${characterID} in the "CHARACTERS" map.`);
  }
  return character;
};
