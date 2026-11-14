import type { MAX_STRIKES } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import type { ReplayBoardElement } from "./arrows.ts";

// ---------------------------
// Default qualities of a card
// ---------------------------

export const CARD_W = 286;
export const CARD_H = 406;

/** The middle of a card, in the card's own coordinates. */
export const CARD_CENTER = {
  x: CARD_W / 2,
  y: CARD_H / 2,
} as const;

/** The width of the stage divided by its height. */
export const STAGE_ASPECT_RATIO = 16 / 9;

export const CARD_FADE = 0.6;
export const STRIKE_FADE = 0.175;

/** The width of a full-size card on the game board, as a fraction of the stage width. */
const FULL_CARD_STAGE_W = 0.075;

/**
 * The size of a full-size card on the game board, as fractions of the stage width and height. A
 * hand on the game board is one card tall.
 */
export const FULL_CARD_STAGE_SIZE = {
  W: FULL_CARD_STAGE_W,
  H: (FULL_CARD_STAGE_W * STAGE_ASPECT_RATIO * CARD_H) / CARD_W,
} as const;

/** The gap between the panels at the edges of the game board and the edges of the stage. */
export const STAGE_MARGIN = 0.01;

/** The action log in the Board Game Arena layout, in fractions of the stage. */
export const BGA_ACTION_LOG = {
  x: STAGE_MARGIN,
  y: STAGE_MARGIN,
  w: 0.4,
  h: 0.25,
} as const;

/** The width of the clue log and the panels below it, in fractions of the stage width. */
const CLUE_LOG_W = 0.19;

/** The clue log, in the top-right corner, in fractions of the stage. */
export const CLUE_LOG = {
  x: 1 - STAGE_MARGIN - CLUE_LOG_W,
  y: STAGE_MARGIN,
  w: CLUE_LOG_W,
  h: 0.51,
} as const;

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

/** A quarter turn, for the Konva functions that take a rotation. */
export const QUARTER_TURN_DEGREES = HALF_TURN_DEGREES / 2;

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

/**
 * Red, for the states that warn the team (such as being unable to discard at max clues) and for
 * disconnected players.
 */
export const WARNING_COLOR = "#df1c2d";

/** Yellow, for the circles that show that the replay leader or a queued pause is active. */
export const ACTIVE_INDICATOR_COLOR = "#ffe03b";

/** Amber, for the count of an empty deck (since each player then has one turn left). */
export const EMPTY_DECK_COLOR = "#ffb13b";

/** For the clue counter and the score area border when no clues are available. */
export const NO_CLUES_COLOR = "red";

/** For the clue counter when the team has one clue left. */
export const ONE_CLUE_COLOR = "yellow";

/** For the clue counter and the score area border when the team is at the maximum clues. */
export const MAX_CLUES_COLOR = "lime";

/** For the discard pile border and the text that warn of a "Double Discard" situation. */
export const DOUBLE_DISCARD_COLOR = "yellow";

/**
 * For the border around the deck when the last card can be blind-played (with the "Bottom-Deck
 * Blind-Plays" option).
 */
export const DECK_PLAY_AVAILABLE_COLOR = "yellow";

/** For the "Your Turn" text and the line under the current player's hand in the Keldon layout. */
export const CURRENT_TURN_COLOR = "yellow";

export const BUTTON_HOVER_COLOR = "#888888";
export const BUTTON_PRESSED_COLOR = "#cccccc";
export const BUTTON_DISABLED_TEXT_COLOR = "#444444";

// ----
// Text
// ----

/** The font of all text drawn on the game board. */
export const FONT_FAMILY = "Verdana";

/** The font of the ranks drawn on cards and of the loading screen. */
export const RANK_FONT_FAMILY = "Arial";

/** The smallest font size that text shrinks to when it does not fit. */
export const MIN_FONT_SIZE = 5;

/** The factor that text shrinks by on each step until it fits. */
export const TEXT_SHRINK_FACTOR = 0.9;

/**
 * The width of the thinnest outline on the game board, as a fraction of the stage height. Thicker
 * outlines are multiples of it.
 */
export const STROKE_WIDTH_UNIT = 0.001_056;

/**
 * The width of the thin outlines around small controls and indicators, such as the strike squares
 * and the replay shuttles, as a fraction of the stage height.
 */
export const THIN_STROKE_WIDTH = 2 * STROKE_WIDTH_UNIT;

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
  shadowOffset: {
    x: 0,
    y: 0,
  },
  shadowOpacity: 0.9,
} as const;

// ------
// Arrows
// ------

/** The widths of the parts of an arrow with a black outline, as multiples of its pointer length. */
export const ARROW_STROKE_WIDTH = {
  BODY: 1.25,
  OUTLINE: 0.375,
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

/** The corner radius of a dialog drawn over the game board, as a fraction of the stage height. */
export const DIALOG_CORNER_RADIUS = 0.01;

/** The opacity of a control that cannot be used right now. */
export const DISABLED_OPACITY = 0.2;

/**
 * The sizes shared by the dialogs drawn over the game board, as fractions of the stage height
 * unless noted otherwise.
 */
export const DIALOG = {
  TITLE_Y: 0.1,
  TITLE_FONT_SIZE: 0.08,
  BUTTON_H: 0.1,
  /** The gap around a row of buttons, as a fraction of the dialog's width. */
  BUTTON_SPACING: 0.1,
} as const;

/** The opacity of the dark overlay shown behind dialogs such as the full action log. */
export const STAGE_FADE_OPACITY = 0.3;

/** The opacity of the dark overlay while the game is paused. */
export const PAUSED_STAGE_FADE_OPACITY = 0.8;

/** The opacity of the black shape that marks whose turn it is or that a hypothetical is active. */
export const INDICATOR_OPACITY = 0.5;

/** The fill and outline of a translucent black ellipse that marks a state of the game. */
export const INDICATOR_ELLIPSE_STYLE = {
  fill: "black",
  opacity: INDICATOR_OPACITY,
  stroke: "black",
} as const;

/** The outline width of an indicator ellipse, as a fraction of the stage height. */
export const INDICATOR_ELLIPSE_STROKE_WIDTH = 4 * STROKE_WIDTH_UNIT;

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
/** How long a card takes to move between a hand and a play stack. */
export const PLAY_ANIMATION_SECONDS = 0.8;
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

/** The index of a strike square, from 0 to `MAX_STRIKES - 1`. */
export type StrikeIndex = Exclude<
  Partial<Tuple<unknown, typeof MAX_STRIKES>>["length"],
  typeof MAX_STRIKES
>;

/** The shared-replay arrow targets for each strike square, in strike order. */
export const STRIKE_ARROW_TARGETS = [
  "strike1",
  "strike2",
  "strike3",
] as const satisfies Tuple<ReplayBoardElement, typeof MAX_STRIKES>;
