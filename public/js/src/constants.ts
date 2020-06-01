// Suit definitions, variant definitions, character definitions, and so forth

// Imports
import charactersInit from './charactersInit';
import colorsInit from './colorsInit';
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

// These constants much match their server-side counterparts
export enum ActionType {
  Play = 0,
  Discard = 1,
  ColorClue = 2,
  RankClue = 3,
}
export enum ClueType {
  Color = 0,
  Rank = 1,
}
export enum ReplayActionType {
  Turn = 0,
  Arrow = 1,
  Sound = 2,
  HypoStart = 3,
  HypoEnd = 4,
  HypoAction = 5,
  HypoBack = 6,
  HypoToggleRevealed = 7,
}
export enum ReplayArrowOrder {
  Deck = -1,
  Clues = -2,
  Pace = -3,
  Efficiency = -4,
  MinEfficiency = -5,
}
export enum StackDirection { // Used in the "Up or Down" and "Reversed" variants
  Undecided = 0,
  Up = 1,
  Down = 2,
  Finished = 3,
}

export const STACK_BASE_RANK = 0;
export const UNKNOWN_CARD_RANK = 6;
export const START_CARD_RANK = 7;
export const MAX_CLUE_NUM = 8;
export const SHUTDOWN_TIMEOUT = 30; // In minutes

export const SUIT_REVERSED_SUFFIX = '-Reversed';

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
