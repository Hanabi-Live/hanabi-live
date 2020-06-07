// Suit definitions, variant definitions, character definitions, and so forth

// Imports
import charactersInit from './charactersInit';
import colorsInit from './colorsInit';
import { START_CARD_RANK } from './game/types/constants';
import suitsInit from './suitsInit';
import variantsInit from './variantsInit';

// Define the default qualities of a card
export const CARD_W = 286;
export const CARD_H = 406;
export const PLAY_AREA_PADDING = 1.15;
export const HAND_PADDING = 1.05;
export const HAND_BASE_SCALE = 0.4;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
export const PLAY_AREA_BASE_SCALE = 0.4;
export const CARD_FADE = 0.6;

// Other miscellaneous constants for the UI
export const LABEL_COLOR = '#d8d5ef'; // Off-white
export const TOOLTIP_DELAY = 500; // In milliseconds
export const ARROW_COLOR = {
  DEFAULT: '#ffffff', // White
  RETOUCHED: '#737373', // Dark gray
  HIGHLIGHT: '#ffdf00', // Yellow
};
export const FADE_TIME = 350; // In milliseconds

export const SHUTDOWN_TIMEOUT = 30; // In minutes
export const SUIT_REVERSED_SUFFIX = ' Reversed';

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
