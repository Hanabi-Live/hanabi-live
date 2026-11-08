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

  /** Light gray */
  CM_TOUCHED: "#B9B9B9",

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

/** Red, for the states that warn the team (such as being unable to discard at max clues). */
export const WARNING_COLOR = "#df1c2d";

export const BUTTON_HOVER_COLOR = "#888888";
export const BUTTON_PRESSED_COLOR = "#cccccc";
export const BUTTON_DISABLED_TEXT_COLOR = "#444444";

// ----
// Text
// ----

/** The font of all text drawn on the game board. */
export const FONT_FAMILY = "Verdana";

/** The smallest font size that text shrinks to when it does not fit. */
export const MIN_FONT_SIZE = 5;

/** The factor that text shrinks by on each step until it fits. */
export const TEXT_SHRINK_FACTOR = 0.9;

/** The dark glow that keeps text readable over the game board. */
export const TEXT_SHADOW = {
  shadowColor: "black",
  shadowBlur: 10,
  shadowOffset: { x: 0, y: 0 },
  shadowOpacity: 0.9,
} as const;

// -------
// Buttons
// -------

/** The opacity of a button's black background. */
export const BUTTON_OPACITY = 0.6;

/** The corner radius of a button, as a fraction of its height. */
export const BUTTON_CORNER_RADIUS = 0.12;

/**
 * Where the middle of a button's text sits, as a fraction of the button's height. It is a smidgeon
 * off the exact middle, which looks better.
 */
export const BUTTON_TEXT_MIDDLE = 0.525;

// ------
// Panels
// ------

/** The opacity of the translucent black background behind each area of the game board. */
export const PANEL_OPACITY = 0.2;

/** The corner radius of each area of the game board, as a fraction of the stage width. */
export const PANEL_CORNER_RADIUS = 0.01;

/** The opacity of a control that cannot be used right now. */
export const DISABLED_OPACITY = 0.2;

/** The opacity of the dark overlay shown behind dialogs such as the full action log. */
export const STAGE_FADE_OPACITY = 0.3;

/** The opacity of the dark overlay while the game is paused. */
export const PAUSED_STAGE_FADE_OPACITY = 0.8;

// ------
// Timers
// ------

/** The opacity of a timer while it flashes red to warn that time is running out. */
export const TIMER_WARNING_OPACITY = 0.7;

// --------------
// Time constants
// --------------

export const CARD_ANIMATION_LENGTH_SECONDS = 0.5;
export const CARD_ANIMATION_DELAY_SECONDS = 0.1;
export const PREPLAY_DELAY_MILLISECONDS = 75;
export const DOUBLE_TAP_DELAY_MILLISECONDS = 500;

// -------------
// Mouse buttons
// -------------

/** The `MouseEvent.button` value of the primary (usually left) button. */
export const LEFT_MOUSE_BUTTON = 0;

/** The `MouseEvent.button` value of the secondary (usually right) button. */
export const RIGHT_MOUSE_BUTTON = 2;
