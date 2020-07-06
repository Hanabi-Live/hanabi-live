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
