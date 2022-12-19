// The default qualities of a card.
export const CARD_W = 286;
export const CARD_H = 406;
export const CARD_FADE = 0.6;
export const STRIKE_FADE = 0.175;
/** Based on the card's width, but used for both the icon's width and height. */
export const SMALL_ICON_SIZE = 0.2 * CARD_W;
export const TOP_LEFT_X = 0.05 * CARD_W;
export const TOP_LEFT_Y = 0.05 * CARD_H;
export const BOTTOM_LEFT_X = 0.06 * CARD_W;
export const BOTTOM_LEFT_Y = 0.82 * CARD_H;

// Colors
export const LABEL_COLOR = "#d8d5ef"; // Off-white
export const ARROW_COLOR = {
  DEFAULT: "#ffffff", // White
  RETOUCHED: "#737373", // Dark gray
  HIGHLIGHT: "#ffdf00", // Yellow
} as const;
export const CLUED_COLOR = "orange";
export const CHOP_MOVE_COLOR = "#fffce6"; // White with a yellow tint
export const FINESSE_COLOR = "aqua";
export const OFF_BLACK = "#0d0d0d";

// Time constants
export const CARD_ANIMATION_LENGTH = 0.5; // In seconds
export const PREPLAY_DELAY = 75; // In milliseconds
export const DOUBLE_TAP_DELAY = 0.5; // In seconds
