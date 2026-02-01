// ---------------------------
// Default qualities of a card
// ---------------------------

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

// ------
// Colors
// ------

/** Off-white */
export const LABEL_COLOR = "#d8d5ef";

export const ARROW_COLOR = {
  /** White */
  DEFAULT: "#ffffff",

  /** Dark gray */
  RETOUCHED: "#737373",

  /** Yellow */
  HIGHLIGHT: "#ffdf00",
} as const;

export const CLUED_COLOR = "orange";

/** White with a yellow tint. */
export const CHOP_MOVE_COLOR = "#fffce6";

export const FINESSE_COLOR = "aqua";

/** A dark shade of maroon. */
export const DISCARD_PERMISSION_COLOR = "#812020";

export const OFF_BLACK = "#0d0d0d";

// --------------
// Time constants
// --------------

export const CARD_ANIMATION_LENGTH_SECONDS = 0.5;
export const PREPLAY_DELAY_MILLISECONDS = 75;
export const DOUBLE_TAP_DELAY_SECONDS = 0.5;
