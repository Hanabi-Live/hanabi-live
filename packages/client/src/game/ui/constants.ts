import { ReplayArrowOrder } from "@hanabi-live/data";

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

/** How far a card's shadow falls down and to the right while it rests in place. */
export const CARD_SHADOW_OFFSET = Math.floor(0.04 * CARD_W);

/** A larger shadow offset that makes a dragged card look lifted off the table. */
export const DRAGGED_CARD_SHADOW_OFFSET = Math.floor(0.12 * CARD_W);

/**
 * How far the corner indicators move toward the middle of a card when it has triangles in its
 * corners that show the color composition, as a fraction of the card's width or height.
 */
export const CORNER_ELEMENT_OFFSET = 0.05;

/** A full circle, for the canvas functions that take an angle. */
export const FULL_CIRCLE_RADIANS = 2 * Math.PI;

/** A half turn, for the Konva functions that take a rotation. */
export const HALF_TURN_DEGREES = 180;

/** A full turn, for the Konva functions that take a rotation. */
export const FULL_TURN_DEGREES = 2 * HALF_TURN_DEGREES;

/** The shadow that the card images cast under their pips and rank labels. */
export const CARD_IMAGE_SHADOW_COLOR = "rgba(0, 0, 0, 0.9)";

/** Turns off a canvas shadow. */
export const NO_SHADOW_COLOR = "rgba(0, 0, 0, 0)";

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

/**
 * The width of the thinnest outline on the game board, as a fraction of the stage height. Thicker
 * outlines are multiples of it.
 */
export const STROKE_WIDTH_UNIT = 0.001_056;

/** The shadow under a player's name and the lines beside it, and under the variant label. */
export const LINE_SHADOW = {
  shadowColor: "black",
  shadowBlur: 5,
  shadowOffset: {
    x: 0,
    y: 3,
  },
} as const;

/** The dark glow that keeps text readable over the game board. */
export const TEXT_SHADOW = {
  shadowColor: "black",
  shadowBlur: 10,
  shadowOffset: { x: 0, y: 0 },
  shadowOpacity: 0.9,
} as const;

// ------
// Arrows
// ------

/**
 * The stroke widths of the parts of an arrow with a black outline, as multiples of its pointer
 * length. The outline is a bigger black arrow behind the body, and the edge closes the outline
 * across the arrow's tail.
 */
export const ARROW_STROKE_WIDTH = {
  OUTLINE: 2,
  EDGE: 0.75,
  BODY: 1.25,
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

/** The default size of a button's text, as a fraction of the button's height. */
export const BUTTON_TEXT_SIZE = 0.5;

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

// ----------
// Statistics
// ----------

/** The number of decimal places shown for each efficiency figure. */
export const EFFICIENCY_DECIMAL_PLACES = 2;

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

/** The `MouseEvent.button` value of the auxiliary (usually middle) button. */
export const MIDDLE_MOUSE_BUTTON = 1;

/** The `MouseEvent.button` value of the secondary (usually right) button. */
export const RIGHT_MOUSE_BUTTON = 2;

/** The `MouseEvent.buttons` value while only the primary (usually left) button is held down. */
export const LEFT_MOUSE_BUTTON_HELD = 1;

// -------
// Strikes
// -------

/** The shared-replay arrow targets for each strike square, in strike order. */
export const STRIKE_ARROW_ORDERS = [
  ReplayArrowOrder.Strike1,
  ReplayArrowOrder.Strike2,
  ReplayArrowOrder.Strike3,
] as const;
