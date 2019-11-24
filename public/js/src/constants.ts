/*
    Suit definitions, variant definitions, character definitions, and so forth
*/

import charactersInit from './charactersInit';
import colorsInit from './colorsInit';
import suitsInit from './suitsInit';
import variantsInit from './variantsInit';

// Define the default qualities of a card
export const CARD_W = 286;
export const CARD_H = 406;
export const PLAY_AREA_PADDING = 1.15;
export const HAND_PADDING = 1.05;
export const HAND_BASE_SCALE = 0.40;
// This is a temporary scale only to be used with phaser until dynamic scaling is implemented
export const PLAY_AREA_BASE_SCALE = 0.40;
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
export const ACTION = {
    CLUE: 0,
    PLAY: 1,
    DISCARD: 2,
    DECKPLAY: 3,
};
export const CLUE_TYPE = {
    RANK: 0,
    COLOR: 1,
};
export const REPLAY_ACTION_TYPE = {
    TURN: 0,
    ARROW: 1,
    LEADER_TRANSFER: 2,
    SOUND: 3,
    HYPO_START: 4,
    HYPO_END: 5,
    HYPO_ACTION: 6,
    HYPO_BACK: 7,
};
export const REPLAY_ARROW_ORDER = {
    DECK: -1,
    CLUES: -2,
    PACE: -3,
    EFFICIENCY: -4,
    MIN_EFFICIENCY: -5,
};
export const STACK_DIRECTION = { // Used in the "Up or Down" variants
    UNDECIDED: 0,
    UP: 1,
    DOWN: 2,
    FINISHED: 3,
};
export const STACK_BASE_RANK = 0;
export const UNKNOWN_CARD_RANK = 6;
export const START_CARD_RANK = 7;
export const MAX_CLUE_NUM = 8;

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
