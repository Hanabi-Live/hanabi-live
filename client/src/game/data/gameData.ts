import { START_CARD_RANK } from '../types/constants';
import charactersInit from './charactersInit';
import colorsInit from './colorsInit';
import suitsInit from './suitsInit';
import variantsInit from './variantsInit';

// Objects representing JSON files
const COLORS = colorsInit();
const SUITS = suitsInit(COLORS);
const VARIANTS = variantsInit(COLORS, SUITS, START_CARD_RANK);
const CHARACTERS = charactersInit();
export {
  COLORS,
  SUITS,
  VARIANTS,
  CHARACTERS,
};
