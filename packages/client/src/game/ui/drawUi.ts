// This function draws the UI when going into a game for the first time.

import type {
  CardOrder,
  ClueRank,
  PlayerIndex,
  Suit,
  SuitIndex,
} from "@hanabi-live/game";
import {
  MAX_CARDS_PER_HAND,
  MAX_CLUES,
  MAX_STRIKES,
  MAX_SUITS,
  MIN_PLAYERS,
  ODD_RANK_CLUE,
  getTotalCardsInDeck,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import {
  SECOND_IN_MILLISECONDS,
  assertDefined,
  eRange,
  repeat,
  tupleKeys,
} from "complete-common";
import Konva from "konva";
import { globals as lobbyGlobals } from "../../Globals.ts";
import { store } from "../../store.ts";
import { getCanvasColors } from "../../theme.ts";
import * as gameChat from "../chat.ts";
import * as gameSession from "../gameSession.ts";
import { gameUpdated } from "../gameSlice.ts";
import * as hypothetical from "../hypothetical.ts";
import * as gameMain from "../main.ts";
import { getViewPlayerIndex, isOurSeat } from "../ourSeat.ts";
import { ActionLog } from "./ActionLog.ts";
import { ButtonGroup } from "./ButtonGroup.ts";
import { CardLayout } from "./CardLayout.ts";
import { ColorButton } from "./ColorButton.ts";
import { Deck } from "./Deck.ts";
import { Elements } from "./Elements.ts";
import { FullActionLog } from "./FullActionLog.ts";
import { HanabiCard } from "./HanabiCard.ts";
import { PlayStack } from "./PlayStack.ts";
import { RankButton } from "./RankButton.ts";
import { TerminateMenu } from "./TerminateMenu.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { backToLobby } from "./backToLobby.ts";
import { drawClueLog } from "./clueLog/mountClueLog.tsx";
import * as cluePreview from "./cluePreview.ts";
import * as clues from "./clues.ts";
import {
  ACTIVE_INDICATOR_COLOR,
  BGA_ACTION_LOG,
  CARD_ANIMATION_LENGTH_SECONDS,
  CLUE_LOG,
  CURRENT_TURN_COLOR,
  DECK_PLAY_AVAILABLE_COLOR,
  DIALOG,
  DIALOG_CORNER_RADIUS,
  DOUBLE_DISCARD_COLOR,
  EFFICIENCY_DECIMAL_PLACES,
  FONT_FAMILY,
  FULL_CARD_STAGE_SIZE,
  INDICATOR_ELLIPSE_STROKE_WIDTH,
  INDICATOR_ELLIPSE_STYLE,
  LABEL_COLOR,
  LEFT_MOUSE_BUTTON,
  LINE_SHADOW,
  PANEL_CORNER_RADIUS,
  PANEL_OPACITY,
  RIGHT_MOUSE_BUTTON,
  STAGE_FADE_OPACITY,
  STAGE_MARGIN,
  STRIKE_ARROW_TARGETS,
  STROKE_WIDTH_UNIT,
  TEXT_SHADOW,
  THIN_STROKE_WIDTH,
  WARNING_COLOR,
} from "./constants.ts";
import { Arrow } from "./controls/Arrow.ts";
import { Button } from "./controls/Button.ts";
import { Checkbox } from "./controls/Checkbox.ts";
import { CurrentPlayerArea } from "./controls/CurrentPlayerArea.ts";
import { FitText } from "./controls/FitText.ts";
import { ImageWithTooltip } from "./controls/ImageWithTooltip.ts";
import { PlayerButton } from "./controls/PlayerButton.ts";
import { RectWithTooltip } from "./controls/RectWithTooltip.ts";
import { SlidableGroup } from "./controls/SlidableGroup.ts";
import { StrikeSquare } from "./controls/StrikeSquare.ts";
import { StrikeX } from "./controls/StrikeX.ts";
import type { TextWithTooltip } from "./controls/TextWithTooltip.ts";
import { TimerDisplay } from "./controls/TimerDisplay.ts";
import * as cursor from "./cursor.ts";
import { drawHands } from "./drawHands.ts";
import { drawReplayArea } from "./drawReplayArea.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import { initKonvaTooltips } from "./konvaTooltips.ts";
import { showPassLeaderDialog } from "./leader.ts";
import { getGameIdLabel } from "./reactive/views/replayView.ts";
import * as replay from "./replay.ts";
import * as restart from "./restart.ts";
import * as stats from "./stats.ts";
import { toggleZen } from "./zen.ts";

interface Values {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

let winW: number;
let winH: number;
let basicTextLabel: Konva.Text;
let basicNumberLabel: Konva.Text;
let actionLogValues: Values;
let playAreaValues: Values;
let cardWidth: number;
let cardHeight: number;
let bottomLeftButtonValues: Values;
let deckValues: Values;
let scoreAreaValues: Values;
let clueAreaValues: Values;
let lowerClueAreaValues: Values;
/**
 * How far the lower part of the clue area slides left in a hypo, in fractions of the stage width.
 */
let lowerClueAreaSlideX: number;
/**
 * The width of the widest row of the lower part of the clue area (the color buttons, the rank
 * buttons, or the "Give Clue" row), in fractions of the stage width. The rows are centered.
 */
let lowerClueAreaRowsW: number;
let giveClueValues: Values;
let spectatorsLabelValues: Values;

/**
 * The gap between the stacked buttons in the bottom-left corner, and between them and the deck,
 * score area, and spectators icon beside them, in fractions of the stage.
 */
const BOTTOM_LEFT_GAP = 0.01;

/** How big the cards in a row of small play stacks are, relative to a full-size card. */
const SMALL_PLAY_STACK_SCALE = 0.8;

/**
 * The name under each play stack (when the variant shows suit names), in fractions of the stage. It
 * extends `overhangX` past each side of the stack and sits `gapY` below it.
 */
const SUIT_LABEL = {
  overhangX: 0.01,
  gapY: 0.004,
  h: 0.051,
  fontSize: 0.02,
} as const;

/**
 * The counter of the cards in the hole for "Throw It in a Hole" variants, which is centered on the
 * play stacks, in fractions of the stage.
 */
const HOLE_COUNTER = {
  padding: 0.008,
  numberFontSize: 0.058,
  captionFontSize: 0.019,
} as const;

/** The darkened felt behind the counter of the cards in the hole. */
const HOLE_COUNTER_FILL = "rgba(8, 32, 16, 0.88)";

/** A faint outline of the counter of the cards in the hole, in the label color. */
const HOLE_COUNTER_OUTLINE = "rgba(216, 213, 239, 0.3)";

/** The widest count the counter of the cards in the hole is sized for. */
const HOLE_COUNTER_WIDEST_COUNT = "99";

/**
 * How far the invisible area that cards are dragged to in order to play them extends past each side
 * of the play stacks, in fractions of the stage.
 */
const PLAY_AREA_OVERHANG = 0.03;

/** The number of recent actions shown in the action log. */
const ACTION_LOG_LINES = 8;

/** The number of recent actions shown in the smaller action log of the Keldon layout. */
const KELDON_ACTION_LOG_LINES = 3;

/** Pink, for the minimum efficiency of a "Hard" variant when H-Group conventions are enabled. */
const HARD_VARIANT_EFFICIENCY_COLOR = "#ffb2b2";

/** The rings of the waiting-on-server animation at full size, in fractions of the stage height. */
const WAITING_ON_SERVER_RING = {
  radius: 0.053,
  strokeWidth: 5 * STROKE_WIDTH_UNIT,
} as const;

/**
 * The gap between the panels stacked in the right-hand column (the clue log, the statistics, and
 * the discard area), in fractions of the stage.
 */
const RIGHT_COLUMN_GAP = 0.01;

/** The statistics panel below the clue log, in fractions of the stage. */
const STATISTICS_PANEL = {
  x: CLUE_LOG.x,
  y: CLUE_LOG.y + CLUE_LOG.h + RIGHT_COLUMN_GAP,
  w: CLUE_LOG.w,
  h: 0.09,
} as const;

/** How far the statistics labels and the variant underline are inset from the panel's sides. */
const STATISTICS_LABEL_INSET_X = 0.025;

/** The top edge of the discard area, in fractions of the stage height. */
const DISCARD_AREA_Y =
  STATISTICS_PANEL.y + STATISTICS_PANEL.h + RIGHT_COLUMN_GAP;

/** The discard area below the statistics panel, in fractions of the stage. */
const DISCARD_AREA = {
  x: CLUE_LOG.x,
  y: DISCARD_AREA_Y,
  w: CLUE_LOG.w,
  h: 1 - DISCARD_AREA_Y - STAGE_MARGIN,
} as const;

/** How far the discard stacks are inset from the edges of the discard area. */
const DISCARD_STACK_INSET = 0.01;

/** The opacity of the trash can icon over the discard pile. */
const TRASH_CAN_OPACITY = 0.2;

/** How far the trash can icon is inset from the edges of the discard area. */
const TRASH_CAN_INSET = {
  x: 0.02,
  top: 0.02,
  bottom: 0.01,
} as const;

/** The strike squares in the score area, in fractions of the stage. */
const STRIKE_SQUARE = {
  x: 0.01,
  y: 0.115,
  w: 0.03,
  h: 0.053,
  /** The horizontal distance from one strike square to the next. */
  spacing: 0.04,
  cornerRadius: 0.005,
} as const;

/**
 * The red X inside a strike square, in fractions of the stage. It is centered horizontally and sits
 * `insetY` below the square's top.
 */
const STRIKE_X = {
  w: 0.02,
  h: 0.036,
  insetY: 0.01,
} as const;

/**
 * The "?" inside a strike square when the strikes are hidden, in fractions of the stage. Its inset
 * is from the square's top-left corner.
 */
const STRIKE_QUESTION_MARK = {
  insetX: 0.0105,
  insetY: 0.013,
  fontSize: 0.032,
} as const;

/** The widths of the warning borders around the board areas, in fractions of the stage width. */
const WARNING_BORDER_WIDTH = {
  /** Around the score area when the team cannot afford to spend more clues. */
  scoreArea: 0.003,
  /** Around the discard area when the team is at the maximum amount of clues. */
  noDiscard: 0.005,
  /** Around the discard area in a "Double Discard" situation. */
  doubleDiscard: 0.004,
} as const;

/** The opacity of the border around the discard area in a "Double Discard" situation. */
const DOUBLE_DISCARD_BORDER_OPACITY = 0.75;

/**
 * The width of the line under the variant name, in pixels. Unlike the other outlines, it does not
 * scale with the stage, so it stays a hairline.
 */
const VARIANT_UNDERLINE_WIDTH_PIXELS = 1;

/** The corner radius of the border around the deck, in fractions of the stage height. */
const DECK_BORDER_CORNER_RADIUS = 0.01;

/** The icon in the bottom-left corner of the deck that shows the game's details on hover. */
const GAME_INFO_IMAGE = {
  /** As a fraction of the deck's width. */
  SIZE: 0.15,
  /** How far it is inset from the deck's corner, as a fraction of the stage width. */
  INSET: 0.004,
  /** In pixels. */
  SHADOW_BLUR: 2,
} as const;

/**
 * The column with the spectators' eyes and their number below it, in fractions of the stage. The
 * crown of a shared replay sits above it.
 */
const SPECTATORS_COLUMN = {
  W: 0.03,
  /** The top of the number, below the top of the eyes. */
  NUMBER_Y: 0.04,
  NUMBER_FONT_SIZE: 0.03,
  /** The width and height of the eyes, centered over the number. */
  EYES_SIZE: 0.02,
} as const;

/** The top of the crown of a shared replay, relative to the top of the spectators' eyes. */
const CROWN_TOP_Y = -0.067;

/**
 * The center of the "Your Turn" indicator, relative to the top-left corner of the spectators
 * column, in fractions of the stage.
 */
const YOUR_TURN_CENTER = {
  x: 0.0695,
  y: 0.026,
} as const;

/**
 * Where the middle of the ring around a timer (which shows that a pause is queued) is, relative to
 * the timer's top-left corner, in fractions of the stage.
 */
const TIMER_PAUSE_RING_CENTER = {
  x: 0.0328,
  y: 0.034,
} as const;

/** The ring around a timer that shows that a pause is queued, in fractions of the stage. */
const TIMER_PAUSE_RING_RADIUS = {
  x: 0.05,
  y: 0.07,
} as const;

/**
 * The default text label that the other labels are cloned from, in fractions of the stage. Number
 * labels are narrower.
 */
const BASIC_LABEL = {
  x: 0.01,
  y: 0.01,
  textW: 0.11,
  numberW: 0.03,
  h: 0.03,
  fontSize: 0.026,
} as const;

/** The action log in the Keldon layout, in fractions of the stage. */
const KELDON_ACTION_LOG = {
  x: 0.2,
  y: 0.235,
  w: 0.4,
  h: 0.098,
} as const;

/**
 * How far the action log's text is inset from the edges of its panel, in fractions of the stage.
 */
const ACTION_LOG_TEXT_INSET = {
  x: 0.01,
  y: 0.003,
} as const;

/** The size of the action log's text, as a fraction of the stage height. */
const ACTION_LOG_FONT_SIZE = 0.028;

/** The row of play stacks, in fractions of the stage. */
const PLAY_STACKS = {
  /** The left edge of a row of full-size stacks in the Keldon layout. */
  keldonX: 0.183,
  /** The top of a row of full-size stacks in the Keldon layout. */
  keldonY: 0.345,
  /** How much lower a row of small stacks sits in the Keldon layout. */
  smallStacksOffsetY: 0.019,
  /** How much higher the stacks sit in the Keldon layout to make room for suit names. */
  suitNamesOffsetY: 0.018,
  /** The gap between adjacent stacks in the Keldon layout. */
  keldonSpacing: 0.015,
  /** The gap between the action log and the stacks below it in the BGA layout. */
  bgaGapY: 0.02,
  /** The gap between adjacent stacks in the BGA layout, when they do not fill the row. */
  bgaSpacing: 0.006,
} as const;

/**
 * The vertical distance between the tops of adjacent discard stacks, in fractions of the stage
 * height. The stacks are closer together when there are the maximum amount of suits.
 */
const DISCARD_STACK_SPACING = {
  maxSuits: 0.038,
  fewerSuits: 0.047,
} as const;

/** The height of each discard stack, in fractions of the stage height. */
const DISCARD_STACK_H = 0.15;

/** The rows of buttons in the bottom-left corner: replay (or restart), chat, and lobby. */
const BOTTOM_LEFT_BUTTON_ROWS = 3;

/**
 * The buttons stacked in the bottom-left corner (replay or restart, chat, and lobby), in fractions
 * of the stage. `y` is the top of the first button.
 */
const BOTTOM_LEFT_BUTTON = {
  y: 0.8,
  w: 0.07,
  h: 0.0563,
} as const;

/** The game ID near the top of the deck in a replay, in fractions of the stage height. */
const GAME_ID_LABEL = {
  /** Below the top of the deck. */
  insetY: 0.01,
  fontSize: 0.019,
} as const;

/**
 * The two lines of "Turns left: #" over an empty deck, in fractions of the stage. The tops of the
 * lines are measured up from the bottom of the deck.
 */
const DECK_TURNS_LEFT_LABEL = {
  insetX: 0.017,
  line1Y: 0.07,
  line2Y: 0.04,
  fontSize: 0.025,
} as const;

/** The width of the border around the deck when a bottom-deck blind-play is available. */
const DECK_PLAY_AVAILABLE_BORDER_WIDTH = 10 * STROKE_WIDTH_UNIT;

/**
 * The score area that holds the turn, score, and clue count, in fractions of the stage. In the
 * Keldon layout, it is centered vertically on the deck.
 */
const SCORE_AREA = {
  keldonX: 0.66,
  bgaY: 0.81,
  w: 0.13,
  h: 0.18,
} as const;

/**
 * The labels in the score area, in fractions of the stage, relative to the score area. Each row has
 * a text label on the left and a number to its right.
 */
const SCORE_AREA_LABELS = {
  x: 0.02,
  /** How far right of its text label each number sits. */
  numberOffsetX: 0.06,
  rowY: {
    turn: 0.01,
    score: 0.045,
    clues: 0.08,
  },
} as const;

/**
 * The maximum score beside the score, in fractions of the stage height. It is smaller, so it sits
 * lower to share a baseline.
 */
const MAX_SCORE_LABEL = {
  offsetY: 0.005,
  fontSize: 0.017,
} as const;

/** How the clue count grows when the team cannot discard, in fractions of the stage height. */
const CLUES_PULSE = {
  fontSize: 0.04,
  offsetX: 0.001,
  offsetY: 0.01,
} as const;

/**
 * Where the spectators column sits in the Keldon layout, relative to the top-left corner of the
 * score area, in fractions of the stage.
 */
const KELDON_SPECTATORS_OFFSET = {
  x: -0.037,
  y: 0.09,
} as const;

/** The crown of a shared replay. */
const CROWN = {
  /** As a fraction of the stage width. */
  SIZE: 0.025,
  /** The ring around it that marks the replay leader, as a fraction of the stage height. */
  LEADER_RING_RADIUS: 0.028,
  /** How much it grows when leadership passes to someone else. */
  PULSE_SCALE: 2,
} as const;

/** The "Your Turn" indicator, in fractions of the stage. */
const YOUR_TURN = {
  radiusX: 0.039,
  radiusY: 0.05,
  fontSize: 0.034,
} as const;

/**
 * The text of the statistics panel, relative to the panel's top-left corner, in fractions of the
 * stage.
 */
const STATISTICS_TEXT = {
  fontSize: 0.02,
  variantY: 0.01,
  variantW: 0.15,
  variantH: 0.03,
  underlineY: 0.03,
  paceY: 0.04,
  efficiencyY: 0.06,
  /** The left edge of the numbers beside the labels. */
  numberX: 0.1,
  /** The "|" and the minimum efficiency after the efficiency, relative to `numberX`. */
  pipeX: 0.005,
  minEfficiencyX: 0.018,
} as const;

/** The two timers, in fractions of the stage height unless noted otherwise. */
const TIMER = {
  /** As a fraction of the stage width. */
  w: 0.065,
  h: 0.051,
  fontSize: 0.03,
  /** The label of the current player's timer, which can be a long name. */
  labelFontSize: 0.02,
  cornerRadius: 0.05,
  spaceH: 0.01,
} as const;

/** The left edges and top of the two timers, which sit in a row in the Keldon layout. */
const KELDON_TIMERS = {
  x1: 0.145,
  x2: 0.595,
  y: 0.645,
} as const;

/** The left edge and tops of the two timers, which sit one above the other in the BGA layout. */
const BGA_TIMERS = {
  x: 0.352,
  y1: 0.77,
  y2: 0.885,
} as const;

/** The clue area below the play stacks, in fractions of the stage height. */
const CLUE_AREA = {
  /** The gap between the play stacks and the clue area. */
  gapY: 0.005,
  h: 0.23,
  /** How much lower it sits to make room for suit names. */
  suitNamesOffsetY: 0.03,
  /** How much lower it sits in the BGA layout, which has room to spare. */
  bgaOffsetY: 0.02,
} as const;

/** The buttons that choose who to give a clue to, in fractions of the stage. */
const CLUE_TARGET_BUTTON = {
  keldonH: 0.025,
  bgaH: 0.035,
  spacing: 0.0075,
} as const;

/** The color and rank buttons used to give a clue, in fractions of the stage. */
const CLUE_TYPE_BUTTON = {
  w: 0.04,
  h: 0.071,
  spacingX: 0.009,
  spacingY: 0.002,
} as const;

/** The number of clue type buttons that the "Give Clue" row is as wide as. */
const GIVE_CLUE_ROW_COLUMNS = 5;

/**
 * The "Give Clue" row, which has the post-clue empathy checkbox, in fractions of the stage. It
 * lines up with a row of `GIVE_CLUE_ROW_COLUMNS` clue type buttons: the checkbox is as wide as the
 * last button, and the "Give Clue" button spans the others.
 */
const GIVE_CLUE_BUTTON = {
  w:
    CLUE_TYPE_BUTTON.w * GIVE_CLUE_ROW_COLUMNS
    + CLUE_TYPE_BUTTON.spacingX * (GIVE_CLUE_ROW_COLUMNS - 1),
  h: 0.051,
} as const;

/**
 * How far the cross over a disabled clue area is inset from its corners, in fractions of the stage.
 */
const CLUE_AREA_DISABLED_CROSS_INSET = {
  x: 0.075,
  y: 0.03,
} as const;

/** The width of the lines of the cross over a disabled clue area. */
const CLUE_AREA_DISABLED_CROSS_WIDTH = 5 * STROKE_WIDTH_UNIT;

/** The color of the lines of the cross over a disabled clue area. */
const CLUE_AREA_DISABLED_CROSS_COLOR = "#1a1a1a";

/** The "No clues" text over a disabled clue area. */
const NO_CLUES_TEXT = {
  /** As a fraction of the clue area's height. */
  y: 0.4,
  /** As a fraction of the stage height. */
  fontSize: 0.07,
} as const;

/**
 * The "Current player" box, centered in the clue area, in fractions of the stage. Its width fits
 * between the two timers of the Keldon layout.
 */
const CURRENT_PLAYER_AREA = {
  offsetY: 0.015,
  w: 0.3,
  h: 0.15,
  spacing: 0.006,
} as const;

/**
 * The "Cancel Pre-Move" button, centered in the clue area, in fractions of the stage. It is near
 * the top of the clue area, not centered in it.
 */
const PREMOVE_CANCEL_BUTTON = {
  offsetY: 0.05,
  w: 0.29,
  h: 0.1,
} as const;

/**
 * The "Hypothetical" indicator, in fractions of the stage unless noted otherwise. It spans the
 * width of the action log.
 */
const HYPO_INDICATOR = {
  /** Below the top of the clue area. */
  offsetY: 0.06,
  h: 0.05,
  /** The top of the text, as a fraction of `h`. */
  textY: 0.4,
  fontSize: 0.06,
  /** The horizontal radius of the ellipse, as a fraction of the action log's width. */
  radiusX: 0.4,
  /**
   * The spectators' "Pause Shared Turns" button below the ellipse. It is small so that it fits
   * above the bottom hand in the Keldon layout.
   */
  button: {
    gapY: 0.005,
    w: 0.13,
    h: 0.04,
  },
} as const;

/** The buttons used in a hypothetical, in fractions of the stage. */
const HYPO_BUTTON = {
  w: 0.095,
  /** The narrower "Back" button. */
  backW: 0.035,
  spacing: 0.008,
  fontSize: 0.019,
} as const;

/**
 * The pause dialog, in fractions of the stage height unless noted otherwise. The button widths are
 * fractions of the dialog's width.
 */
const PAUSE_DIALOG = {
  /** As a fraction of the stage width. */
  w: 0.5,
  h: 0.5,
  textY: 0.21,
  textFontSize: 0.05,
  buttonY: 0.33,
  unpauseButtonW: 0.4,
  /** The chat and lobby buttons. */
  smallButtonW: 0.125,
} as const;

/**
 * The restart dialog, in fractions of the stage height unless noted otherwise. The button width is
 * a fraction of the dialog's width; the "Cancel" button is half as wide.
 */
const RESTART_DIALOG = {
  /** As a fraction of the stage width. */
  w: 0.7,
  h: 0.6,
  buttonW: 0.35,
  buttonY: 0.25,
  /** The gap above the "Cancel" button. */
  cancelButtonGapY: 0.095,
  /** The line that lists the players who will not play again. */
  declinedY: 0.19,
  declinedFontSize: 0.03,
} as const;

/**
 * The size of the images over the play stacks that show which way a shared replay is moving, in
 * fractions of the stage.
 */
const SHARED_REPLAY_DIRECTION_SIZE = 0.1;

/** The left edge of a strike square, in fractions of the stage width. */
function strikeSquareX(strikeIndex: number): number {
  return STRIKE_SQUARE.x + STRIKE_SQUARE.spacing * strikeIndex;
}

export function drawUi(): void {
  globals.elements.restartWaitingOnServerAnimation?.stop();

  // Constants
  winW = globals.stage.width();
  winH = globals.stage.height();

  // Remove all existing layers from the stage. Destroy only the ones that are not reused, since
  // Konva releases the canvases of a destroyed layer, which would leave a reused layer without hit
  // detection.
  const reusedLayers = new Set<Konva.Layer>(Object.values(globals.layers));
  for (const layer of globals.stage.getLayers()) {
    if (reusedLayers.has(layer)) {
      layer.remove();
    } else {
      layer.destroy();
    }
  }

  // Clear children from the reused layers.
  for (const layer of reusedLayers) {
    layer.destroyChildren();
  }

  // Reset UI elements.
  globals.elements = new Elements();
  globals.elements.arrows = [];

  // Create the various Konva layers upon which all graphic elements reside.
  drawBackground();

  // We can reuse some UI elements.
  initReusableObjects();

  // The top-left.
  drawActionLog();
  drawPlayStacks();

  // The bottom-left.
  drawBottomLeftButtons();
  drawDeck();
  drawScoreArea();
  drawSpectators();
  drawSharedReplay();
  drawYourTurn();

  // The middle column.
  drawHands(winW, winH);

  // The right column.
  drawStatistics();
  drawDiscardArea();
  drawDiscardStacks();

  // Conditional elements.
  drawArrows();
  drawTimers();
  drawClueArea();
  drawCurrentPlayerArea();
  drawPreplayArea();
  drawReplayArea(winW, winH);
  drawHypotheticalArea();
  drawPauseArea();
  drawRestartArea();
  drawTerminateMenu();
  drawExtraAnimations();

  const layersInOrder = [
    globals.layers.UI,
    globals.layers.timer,
    globals.layers.card,
    globals.layers.UI2,
    globals.layers.arrow,
  ];

  for (const layer of layersInOrder) {
    globals.stage.add(layer);
  }

  // The clue log is HTML, so it goes between the canvases of the layers.
  drawClueLog();
}

/** Shows the latest votes to end the game on the skull and in its menu. */
export function updateTerminationVotes(): void {
  const { terminateButton, terminateMenu } = globals.elements;
  if (terminateButton === undefined) {
    return;
  }

  terminateButton.setImage(
    lobbyGlobals.imageLoader.get(
      store.getState().game.votes?.voted === true ? "skull_vtk" : "skull",
    ),
  );
  terminateMenu?.update();
}

function drawBackground() {
  // Draw a green background behind everything.
  const background = new Konva.Image({
    x: 0,
    y: 0,
    width: winW,
    height: winH,
    image: lobbyGlobals.imageLoader.get("background"),
    listening: true,
  });
  background.on("mousemove", () => {
    cursor.set("default");
  });

  globals.layers.UI.add(background);

  // The dark overlay that appears when you click the action log is clicked, when a player's name is
  // clicked, when the game is paused, etc.
  globals.elements.stageFade = new Konva.Rect({
    x: 0,
    y: 0,
    width: winW,
    height: winH,
    opacity: STAGE_FADE_OPACITY,
    fill: "black",
    visible: false,
    listening: true,
  });
  globals.layers.UI2.add(globals.elements.stageFade);
}

function initReusableObjects() {
  // Create some default objects.
  basicTextLabel = new Konva.Text({
    x: BASIC_LABEL.x * winW,
    y: BASIC_LABEL.y * winH,
    width: BASIC_LABEL.textW * winW,
    height: BASIC_LABEL.h * winH,
    fontSize: BASIC_LABEL.fontSize * winH,
    fontFamily: FONT_FAMILY,
    align: "left",
    text: "Placeholder text",
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
    listening: false,
  });
  basicNumberLabel = basicTextLabel.clone() as Konva.Text;
  basicNumberLabel.text("0");
  basicNumberLabel.width(BASIC_LABEL.numberW * winW);
}

function drawActionLog() {
  actionLogValues = store.getState().session.settings.keldonMode
    ? KELDON_ACTION_LOG
    : BGA_ACTION_LOG;

  const actionLogGroup = new Konva.Group({
    x: actionLogValues.x * winW,
    y: actionLogValues.y * winH,
  });
  globals.layers.UI.add(actionLogGroup);

  // The faded rectangle around the action log.
  const actionLogRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: actionLogValues.w! * winW,
    height: actionLogValues.h! * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: true,
  });
  actionLogGroup.add(actionLogRect);
  actionLogRect.on("click tap", () => {
    globals.elements.fullActionLog!.show();
    globals.elements.stageFade!.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade!.on("click tap", () => {
      globals.elements.stageFade!.off("click tap");
      globals.elements.fullActionLog!.hide();
      globals.elements.stageFade!.hide();
      globals.layers.UI2.batchDraw();
    });
  });

  // The action log
  const maxLines = store.getState().session.settings.keldonMode
    ? KELDON_ACTION_LOG_LINES
    : ACTION_LOG_LINES;
  const textHeight = (actionLogValues.h! - ACTION_LOG_TEXT_INSET.y * 2) * winH;
  globals.elements.actionLog = new ActionLog(
    {
      align: "center",
      fontSize: ACTION_LOG_FONT_SIZE * winH,
      fontFamily: FONT_FAMILY,
      fill: LABEL_COLOR,
      ...TEXT_SHADOW,
      x: ACTION_LOG_TEXT_INSET.x * winW,
      y: ACTION_LOG_TEXT_INSET.y * winH,
      width: (actionLogValues.w! - ACTION_LOG_TEXT_INSET.x * 2) * winW,
      height: textHeight,
    },
    maxLines,
  );

  // Hide the lines that slide in and out of the action log.
  actionLogGroup.clip({
    x: 0,
    y: ACTION_LOG_TEXT_INSET.y * winH,
    width: actionLogValues.w! * winW,
    height: textHeight,
  });
  actionLogGroup.add(globals.elements.actionLog);

  // The full action log (that appears when you click on the action log).
  globals.elements.fullActionLog = new FullActionLog(winW, winH);
  globals.layers.UI2.add(globals.elements.fullActionLog);
}

interface PlayStackValues {
  x: number;
  y: number;
  w: number;
  spacing: number;
}

/**
 * Draws the counter of the cards in the hole for "Throw It in a Hole" variants, centered on the
 * given point: a large count with a caption to its right.
 */
function drawHoleCounter(centerX: number, centerY: number): Konva.Group {
  const padding = HOLE_COUNTER.padding * winH;
  const holeCounter = new Konva.Group({
    x: centerX,
    y: centerY,
    listening: false,
  });

  const countLabel = new Konva.Text({
    text: HOLE_COUNTER_WIDEST_COUNT,
    fontSize: HOLE_COUNTER.numberFontSize * winH,
    fontFamily: FONT_FAMILY,
    fontStyle: "bold",
    fill: LABEL_COLOR,
    align: "right",
    ...TEXT_SHADOW,
  });
  // Keep the width of the widest count so that the counter does not change size.
  countLabel.width(countLabel.width());

  const caption = new Konva.Text({
    text: "total cards in the hole\n(from your perspective)",
    fontSize: HOLE_COUNTER.captionFontSize * winH,
    lineHeight: 1.25,
    fontFamily: FONT_FAMILY,
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
  });

  const width = countLabel.width() + padding + caption.width() + padding * 4;
  const height = Math.max(countLabel.height(), caption.height()) + padding * 2;
  holeCounter.add(
    new Konva.Rect({
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      fill: HOLE_COUNTER_FILL,
      stroke: HOLE_COUNTER_OUTLINE,
      strokeWidth: THIN_STROKE_WIDTH * winH,
      cornerRadius: PANEL_CORNER_RADIUS * winW,
    }),
  );

  countLabel.position({
    x: -width / 2 + padding * 2,
    y: -countLabel.height() / 2,
  });
  caption.position({
    x: countLabel.x() + countLabel.width() + padding,
    y: -caption.height() / 2,
  });
  holeCounter.add(countLabel, caption);

  globals.elements.holeCountLabel = countLabel;
  return holeCounter;
}

function drawPlayStacks() {
  const numSuits = globals.variant.suits.length;

  // The row has room for MAX_SUITS small stacks or one fewer full-size stack. Suit names need the
  // space of the small stacks.
  const fullSizeStackSlots = MAX_SUITS - 1;
  const smallStacks = numSuits === MAX_SUITS || globals.variant.showSuitNames;
  const numStackSlots = smallStacks ? MAX_SUITS : fullSizeStackSlots;

  let yOffset: number;
  if (smallStacks) {
    cardWidth = FULL_CARD_STAGE_SIZE.W * SMALL_PLAY_STACK_SCALE;
    cardHeight = FULL_CARD_STAGE_SIZE.H * SMALL_PLAY_STACK_SCALE;
    yOffset = PLAY_STACKS.smallStacksOffsetY;
  } else {
    cardWidth = FULL_CARD_STAGE_SIZE.W;
    cardHeight = FULL_CARD_STAGE_SIZE.H;
    yOffset = 0;
  }
  const playStackValues: PlayStackValues = {
    x: PLAY_STACKS.keldonX,
    y: PLAY_STACKS.keldonY + yOffset,
    w: 0, // Is set below
    spacing: PLAY_STACKS.keldonSpacing,
  };
  if (globals.variant.showSuitNames) {
    playStackValues.y -= PLAY_STACKS.suitNamesOffsetY;
  }

  // In BGA mode, a full row of stacks spreads out to the width of the action log.
  const fillsActionLogWidth =
    !store.getState().session.settings.keldonMode
    && numSuits >= fullSizeStackSlots;
  if (!store.getState().session.settings.keldonMode) {
    playStackValues.x = actionLogValues.x;
    playStackValues.y =
      actionLogValues.y + actionLogValues.h! + PLAY_STACKS.bgaGapY;
    if (fillsActionLogWidth) {
      playStackValues.spacing = actionLogValues.w!;
      playStackValues.spacing -= cardWidth * numSuits;
      playStackValues.spacing /= numSuits - 1;
    } else {
      playStackValues.spacing = PLAY_STACKS.bgaSpacing;
    }
  }
  playStackValues.w = cardWidth * numSuits;
  playStackValues.w += playStackValues.spacing * (numSuits - 1);

  // Center the stacks within the slots of the row.
  if (!fillsActionLogWidth) {
    playStackValues.x +=
      ((numStackSlots - numSuits) / 2) * (cardWidth + playStackValues.spacing);
  }

  // Make the invisible "hole" play stack for "Throw It in a Hole" variants (centered in the middle
  // of the rest of the stacks). Spectators need it too, since hypotheticals use the hole.
  if (globals.variant.throwItInAHole) {
    const playStackX =
      playStackValues.x + playStackValues.w / 2 - cardWidth / 2;
    const playStack = new PlayStack({
      x: playStackX * winW,
      y: playStackValues.y * winH,
      width: cardWidth * winW,
      height: cardHeight * winH,
    });
    globals.elements.playStacks.set("hole", playStack);
    globals.layers.card.add(playStack);

    // Players cannot see the score, so show them how many cards they have put in the hole. (This is
    // drawn above the cards so that it can overlap the stack bases.)
    if (globals.state.playing || globals.state.shadowing) {
      globals.elements.holeCounter = drawHoleCounter(
        (playStackValues.x + playStackValues.w / 2) * winW,
        (playStackValues.y + cardHeight / 2) * winH,
      );
      globals.layers.UI2.add(globals.elements.holeCounter);
    }
  }

  for (const [i, suit] of globals.variant.suits.entries()) {
    const suitIndex = i as SuitIndex;

    // Make the play stack for this suit.
    const playStackX =
      playStackValues.x + (cardWidth + playStackValues.spacing) * i;
    const playStack = new PlayStack({
      x: playStackX * winW,
      y: playStackValues.y * winH,
      width: cardWidth * winW,
      height: cardHeight * winH,
    });
    globals.elements.playStacks.set(suit, playStack);
    globals.layers.card.add(playStack);

    // Add the stack base to the play stack.
    const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
    const order = (totalCardsInDeck + i) as CardOrder;
    // Stack bases use card orders after the final card in the deck.
    const stackBase = new HanabiCard(
      order,
      suitIndex,
      undefined,
      true,
      globals.variant,
      globals.options.numPlayers,
    );
    globals.stackBases.push(stackBase);

    playStack.addChild(stackBase.layout);

    // Draw the suit name next to each suit (a text description of the suit).
    if (globals.variant.showSuitNames) {
      let text = suit.displayName;

      if (
        store.getState().session.settings.colorblindMode
        && suit.clueColors.length === 2
      ) {
        const colorList = suit.clueColors
          .map((color) => color.abbreviation)
          .join("/");
        text += ` [${colorList}]`;
      }

      if (globals.variant.upOrDown) {
        text = "";
      }

      if (globals.variant.sudoku) {
        // Do not show anything here, the starting values will be written by the state observers
        // updating when the starting or the played cards value changes.
        text = "";
      }

      const suitLabelText = new FitText({
        x:
          (playStackValues.x
            - SUIT_LABEL.overhangX
            + (cardWidth + playStackValues.spacing) * i)
          * winW,
        y: (playStackValues.y + cardHeight + SUIT_LABEL.gapY) * winH,
        width: (cardWidth + SUIT_LABEL.overhangX * 2) * winW,
        height: SUIT_LABEL.h * winH,
        fontSize: SUIT_LABEL.fontSize * winH,
        fontFamily: FONT_FAMILY,
        align: "center",
        text,
        fill: LABEL_COLOR,
        listening: false,
      });

      globals.layers.UI.add(suitLabelText);
      globals.elements.suitLabelTexts.push(suitLabelText);
    }
  }

  // This is the invisible rectangle that players drag cards to in order to play them. Make it a
  // little big bigger than the stacks.
  const overlap = PLAY_AREA_OVERHANG;
  playAreaValues = {
    x: playStackValues.x,
    y: playStackValues.y,
    w: playStackValues.w,
    h: cardHeight,
  };
  globals.elements.playArea = new Konva.Rect({
    x: (playAreaValues.x - overlap) * winW,
    y: (playAreaValues.y - overlap) * winH,
    width: (playAreaValues.w! + overlap * 2) * winW,
    height: (playAreaValues.h! + overlap * 2) * winH,
    listening: false,
  });
}

function drawDiscardStacks() {
  const discardStackSpacing =
    globals.variant.suits.length === MAX_SUITS
      ? DISCARD_STACK_SPACING.maxSuits
      : DISCARD_STACK_SPACING.fewerSuits;

  for (const [suitIndex, suit] of globals.variant.suits.entries()) {
    // Make the discard stack for this suit.
    const discardStack = new CardLayout({
      x: (DISCARD_AREA.x + DISCARD_STACK_INSET) * winW,
      y:
        (DISCARD_AREA.y + DISCARD_STACK_INSET + discardStackSpacing * suitIndex)
        * winH,
      width: (DISCARD_AREA.w - DISCARD_STACK_INSET * 2) * winW,
      height: DISCARD_STACK_H * winH,
    });
    globals.elements.discardStacks.set(suit, discardStack);
    globals.layers.card.add(discardStack);
  }
}

function drawBottomLeftButtons() {
  bottomLeftButtonValues = {
    x: STAGE_MARGIN,
    ...BOTTOM_LEFT_BUTTON,
  };

  // The "New UI" button goes above the column. The Keldon layout has a hand in that place, so there
  // it goes at the top of the column instead, and the four buttons share the height of three.
  const { keldonMode, newUi } = store.getState().session.settings;
  const newUiInColumn = newUi && keldonMode;
  const columnH =
    BOTTOM_LEFT_BUTTON.h * BOTTOM_LEFT_BUTTON_ROWS
    + BOTTOM_LEFT_GAP * (BOTTOM_LEFT_BUTTON_ROWS - 1);
  const rowH = newUiInColumn
    ? (columnH - BOTTOM_LEFT_GAP * BOTTOM_LEFT_BUTTON_ROWS)
      / (BOTTOM_LEFT_BUTTON_ROWS + 1)
    : BOTTOM_LEFT_BUTTON.h;
  const firstRow = newUiInColumn ? 1 : 0;

  /** The place of a button in the column, counting from the replay button's row. */
  function row(index: number) {
    return {
      x: bottomLeftButtonValues.x * winW,
      y:
        (BOTTOM_LEFT_BUTTON.y + (firstRow + index) * (rowH + BOTTOM_LEFT_GAP))
        * winH,
      width: BOTTOM_LEFT_BUTTON.w * winW,
      height: rowH * winH,
    };
  }

  // The toggle in-game replay button.
  const replayButton = new Button(
    {
      ...row(0),
      visible: !globals.state.finished,
    },
    [lobbyGlobals.imageLoader.get("replay")],
  );
  replayButton.on("click tap", () => {
    if (globals.state.replay.segment === undefined) {
      replay.enter();
    } else {
      replay.exit();
    }
  });
  globals.layers.UI.add(replayButton);
  replayButton.tooltipName = "replay";
  replayButton.tooltipContent =
    "Toggle the in-game replay, where you can rewind the game to see what happened on a specific turn.";
  initKonvaTooltips(replayButton, true, false);
  globals.elements.replayButton = replayButton;

  // The button that switches to the redesigned game screen. It shows only for players who turned on
  // the "New UI" setting.
  const newUiButton = new Button({
    ...row(-1),
    text: "New UI",
    visible: newUi,
  });
  newUiButton.on("click tap", () => {
    gameMain.showNewUi();
  });
  globals.layers.UI.add(newUiButton);
  newUiButton.tooltipName = "new-ui";
  newUiButton.tooltipContent = "Switch to the redesigned game screen.";
  initKonvaTooltips(newUiButton, true, false);
  globals.elements.newUiButton = newUiButton;

  // The restart button (to bring up the restart menu).
  const restartButton = new Button({
    ...row(0),
    text: "Restart",
    visible: false,
  });
  globals.layers.UI.add(restartButton);
  restartButton.on("click tap", () => {
    const { shared } = globals.state.replay;
    const everyoneWilling =
      shared !== undefined && restart.declinedPlayers(shared).length === 0;
    if (globals.options.speedrun && everyoneWilling) {
      restart.request(true);
    } else {
      globals.elements.restartArea?.visible(true);
      globals.layers.UI2.batchDraw();
    }
  });
  restartButton.tooltipName = "restart";
  restartButton.tooltipContent =
    "Automatically go into a new game with the current members of the shared replay (using the same game settings as this one).";
  initKonvaTooltips(restartButton, true, false);
  globals.elements.restartButton = restartButton;

  // The button for other players to tell the leader whether they will play again. (It takes the
  // place of the restart button, which only the leader sees.)
  const readyCheckbox = new Checkbox(
    {
      ...row(0),
      visible: false,
    },
    "Ready",
  );
  globals.layers.UI.add(readyCheckbox);
  readyCheckbox.on("click tap", () => {
    restart.decline(readyCheckbox.checked);
  });
  readyCheckbox.tooltipName = "restart-ready";
  readyCheckbox.tooltipContent =
    "Tells the shared replay leader whether you will play another game.";
  initKonvaTooltips(readyCheckbox, true, false);
  globals.elements.readyCheckbox = readyCheckbox;

  // The chat button.
  const chatButton = new Button({
    ...row(1),
    // eslint-disable-next-line complete/require-ascii
    text: "💬",
    visible:
      !globals.state.finished || globals.state.replay.shared !== undefined,
  });
  globals.layers.UI.add(chatButton);
  chatButton.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.evt.button === RIGHT_MOUSE_BUTTON) {
      toggleZen();
    } else {
      gameChat.toggle();
    }
  });
  chatButton.tooltipName = "chat";
  chatButton.tooltipContent = "Toggle the in-game chat.";
  initKonvaTooltips(chatButton, true, false);
  globals.elements.chatButton = chatButton;

  // The lobby button (which takes the user back to the lobby).
  const lobbyButton = new Button({
    ...row(2),
    text: "Lobby",
  });
  globals.layers.UI.add(lobbyButton);
  lobbyButton.on("click tap", lobbyButtonClick);
  lobbyButton.tooltipName = "lobby";
  lobbyButton.tooltipContent = "Return to the lobby.";
  initKonvaTooltips(lobbyButton, true, false);
  globals.elements.lobbyButton = lobbyButton;
}

function drawDeck() {
  deckValues = {
    x: bottomLeftButtonValues.x + bottomLeftButtonValues.w! + BOTTOM_LEFT_GAP,
    y: bottomLeftButtonValues.y,
    w: FULL_CARD_STAGE_SIZE.W,
    h: FULL_CARD_STAGE_SIZE.H,
  };

  // This is the faded rectangle that is hidden until all of the deck has been depleted. (This has
  // to be separate from the Deck object since it exists on a separate layer.)
  const deckRect = new RectWithTooltip({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: true,
  });
  globals.layers.UI.add(deckRect);

  // Near the top of the deck, draw the database ID for the respective game. (In an ongoing game,
  // this will not show.)
  globals.elements.gameIdLabel = new FitText({
    text: getGameIdLabel(globals.state) ?? "",
    x: deckValues.x * winW,
    y: (deckValues.y + GAME_ID_LABEL.insetY) * winH,
    width: deckValues.w! * winW,
    fontFamily: FONT_FAMILY,
    fill: "white",
    align: "center",
    fontSize: GAME_ID_LABEL.fontSize * winH,
    ...TEXT_SHADOW,
    visible: getGameIdLabel(globals.state) !== undefined,
    listening: false,
  });
  // We draw the label on the arrow layer because it is on top of the card but not on top of the
  // black second layer.
  globals.layers.arrow.add(globals.elements.gameIdLabel);

  // At the bottom of the deck, draw a thing hinting that the user can mouse over the deck for
  // detailed information about the current game.
  const gameInfoImageSize = deckValues.w! * GAME_INFO_IMAGE.SIZE * winW;
  const gameInfoImageInset = GAME_INFO_IMAGE.INSET * winW;
  globals.elements.gameInfoImage = new Konva.Image({
    x: deckValues.x * winW + gameInfoImageInset,
    y:
      (deckValues.y + deckValues.h!) * winH
      - gameInfoImageInset
      - gameInfoImageSize,
    width: gameInfoImageSize,
    height: gameInfoImageSize,
    image: lobbyGlobals.imageLoader.get("question-mark"),
    ...TEXT_SHADOW,
    shadowBlur: GAME_INFO_IMAGE.SHADOW_BLUR,
    listening: false,
  });
  // This goes on the same layer as the gameIdLabel.
  globals.layers.arrow.add(globals.elements.gameInfoImage);

  globals.elements.deck = new Deck({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    cardBack: "deck-back",
    suits: globals.variant.suits,
    listening: false,
  });
  globals.layers.card.add(globals.elements.deck);

  // Also apply the card deck tooltip to the faded background rectangle.
  deckRect.tooltipName = "deck";
  deckRect.tooltipContent = globals.elements.deck.tooltipContent;
  // Refresh the content on hover so that elapsed times are current.
  deckRect.on("mouseover touchstart", () => {
    globals.elements.deck?.updateDeckTooltip();
  });
  initKonvaTooltips(deckRect, true, true);

  // When there are no cards left in the deck, show a label that indicates how many turns are left
  // before the game ends.
  const deckBottom = deckValues.y + deckValues.h!;
  globals.elements.deckTurnsRemainingLabel1 = basicTextLabel.clone({
    text: "Turns",
    x: (deckValues.x + DECK_TURNS_LEFT_LABEL.insetX) * winW,
    y: (deckBottom - DECK_TURNS_LEFT_LABEL.line1Y) * winH,
    fontSize: DECK_TURNS_LEFT_LABEL.fontSize * winH,
    visible: false,
  }) as Konva.Text;
  globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel1);
  globals.elements.deckTurnsRemainingLabel2 = basicTextLabel.clone({
    text: "left: #",
    x: (deckValues.x + DECK_TURNS_LEFT_LABEL.insetX) * winW,
    y: (deckBottom - DECK_TURNS_LEFT_LABEL.line2Y) * winH,
    fontSize: DECK_TURNS_LEFT_LABEL.fontSize * winH,
    visible: false,
  }) as Konva.Text;
  globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel2);

  // This is a yellow border around the deck that will appear when only one card is left (if the
  // "Bottom-Deck Blind-Plays" game option is enabled).
  globals.elements.deckPlayAvailableLabel = new Konva.Rect({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    stroke: DECK_PLAY_AVAILABLE_COLOR,
    cornerRadius: DECK_BORDER_CORNER_RADIUS * winH,
    strokeWidth: DECK_PLAY_AVAILABLE_BORDER_WIDTH * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);
}

function drawScoreArea() {
  // The rectangle that holds the turn, score, and clue count.
  scoreAreaValues = {
    x: SCORE_AREA.keldonX,
    y: deckValues.y + (deckValues.h! - SCORE_AREA.h) / 2,
    w: SCORE_AREA.w,
    h: SCORE_AREA.h,
  };
  if (!store.getState().session.settings.keldonMode) {
    scoreAreaValues.x = deckValues.x + deckValues.w! + BOTTOM_LEFT_GAP;
    scoreAreaValues.y = SCORE_AREA.bgaY;
  }
  globals.elements.scoreArea = new Konva.Group({
    x: scoreAreaValues.x * winW,
    y: scoreAreaValues.y * winH,
  });
  globals.layers.UI.add(globals.elements.scoreArea);

  // The border that surrounds the score area when the team is at X clues.
  globals.elements.scoreAreaBorder = new Konva.Rect({
    x: scoreAreaValues.x * winW,
    y: scoreAreaValues.y * winH,
    width: scoreAreaValues.w! * winW,
    height: scoreAreaValues.h! * winH,
    stroke: WARNING_COLOR,
    strokeWidth: WARNING_BORDER_WIDTH.scoreArea * winW,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.scoreAreaBorder);

  // The faded rectangle around the score area.
  const scoreAreaRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: scoreAreaValues.w! * winW,
    height: scoreAreaValues.h! * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: false,
  });
  globals.elements.scoreArea.add(scoreAreaRect);

  const labelX = SCORE_AREA_LABELS.x;
  const labelSpacing = SCORE_AREA_LABELS.numberOffsetX;
  const labelRowY = SCORE_AREA_LABELS.rowY;

  const turnTextLabel = basicTextLabel.clone({
    text: "Turn",
    x: labelX * winW,
    y: labelRowY.turn * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(turnTextLabel);
  turnTextLabel.on("click", (event: Konva.KonvaEventObject<MouseEvent>) => {
    // "event.evt.buttons" is always 0 here.
    if (event.evt.button === LEFT_MOUSE_BUTTON) {
      // Left-click. We want to be able to left-click the turn number to go to a specific turn in
      // the replay.
      replay.promptTurn();
    } else if (event.evt.button === RIGHT_MOUSE_BUTTON) {
      // Right-click
      arrows.click(event, "turn");
    }
  });
  turnTextLabel.on("dbltap", replay.promptTurn);

  globals.elements.turnNumberLabel = basicNumberLabel.clone({
    text: "1",
    x: (labelX + labelSpacing) * winW,
    y: labelRowY.turn * winH,
    listening: true,
  }) as TextWithTooltip;
  globals.elements.scoreArea.add(globals.elements.turnNumberLabel);
  globals.elements.turnNumberLabel.tooltipName = "turn-number";
  // "statsView.ts" fills in the tooltip.
  globals.elements.turnNumberLabel.tooltipContent = "";
  initKonvaTooltips(globals.elements.turnNumberLabel, true, false);
  globals.elements.turnNumberLabel.on(
    "click",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      // "event.evt.buttons" is always 0 here.
      if (event.evt.button === LEFT_MOUSE_BUTTON) {
        // Left-click. We want to be able to left-click the turn number to go to a specific turn in
        // the replay.
        replay.promptTurn();
      } else if (event.evt.button === RIGHT_MOUSE_BUTTON) {
        // Right-click.
        arrows.click(event, "turn");
      }
    },
  );
  globals.elements.turnNumberLabel.on("dbltap", replay.promptTurn);

  globals.elements.scoreTextLabel = basicTextLabel.clone({
    text: "Score",
    x: labelX * winW,
    y: labelRowY.score * winH,
    listening: true,
    visible:
      !globals.variant.throwItInAHole
      || (!globals.state.playing && !globals.state.shadowing),
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.scoreTextLabel);
  globals.elements.scoreTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "score");
    },
  );

  globals.elements.scoreNumberLabel = basicNumberLabel.clone({
    text: "0",
    x: (labelX + labelSpacing) * winW,
    y: labelRowY.score * winH,
    listening: true,
    visible:
      !globals.variant.throwItInAHole
      || (!globals.state.playing && !globals.state.shadowing),
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.scoreNumberLabel);
  globals.elements.scoreNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "score");
    },
  );

  globals.elements.maxScoreNumberLabel = basicNumberLabel.clone({
    text: "",
    x: (labelX + labelSpacing) * winW,
    y: (labelRowY.score + MAX_SCORE_LABEL.offsetY) * winH,
    fontSize: MAX_SCORE_LABEL.fontSize * winH,
    listening: true,
    visible:
      !globals.variant.throwItInAHole
      || (!globals.state.playing && !globals.state.shadowing),
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.maxScoreNumberLabel);
  globals.elements.maxScoreNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "maxScore");
    },
  );

  if (
    globals.variant.throwItInAHole
    && (globals.state.playing || globals.state.shadowing)
  ) {
    globals.elements.playsTextLabel = basicTextLabel.clone({
      text: "Plays",
      x: labelX * winW,
      y: labelRowY.score * winH,
      listening: true,
    }) as Konva.Text;
    globals.elements.scoreArea.add(globals.elements.playsTextLabel);
    globals.elements.playsTextLabel.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        arrows.click(event, "clues");
      },
    );

    globals.elements.playsNumberLabel = basicNumberLabel.clone({
      text: "0",
      x: (labelX + labelSpacing) * winW,
      y: labelRowY.score * winH,
      listening: true,
    }) as Konva.Text;
    globals.elements.scoreArea.add(globals.elements.playsNumberLabel);
    globals.elements.playsNumberLabel.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        arrows.click(event, "clues");
      },
    );
  }

  const cluesTextLabel = basicTextLabel.clone({
    text: "Clues",
    x: labelX * winW,
    y: labelRowY.clues * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(cluesTextLabel);
  cluesTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "clues");
    },
  );

  const cluesNumberLabel = basicNumberLabel.clone({
    text: MAX_CLUES.toString(),
    x: (labelX + labelSpacing) * winW,
    y: labelRowY.clues * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(cluesNumberLabel);
  globals.elements.cluesNumberLabel = cluesNumberLabel;
  cluesNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "clues");
    },
  );

  // Add an animation to signify that discarding at 8 clues is illegal. With reduced motion, the
  // count only turns red, and does not grow.
  if (!globals.isResizing) {
    const grow = !store.getState().session.settings.reducedMotion;
    globals.elements.cluesNumberLabelPulse = new Konva.Tween({
      node: cluesNumberLabel,
      fill: WARNING_COLOR,
      ...(grow && {
        fontSize: CLUES_PULSE.fontSize * winH,
        offsetX: CLUES_PULSE.offsetX * winH,
        offsetY: CLUES_PULSE.offsetY * winH,
      }),
      duration: CARD_ANIMATION_LENGTH_SECONDS,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (globals.elements.cluesNumberLabelPulse !== undefined) {
          globals.elements.cluesNumberLabelPulse.reverse();
        }
      },
    });
    globals.elements.cluesNumberLabelPulse.anim.addLayer(globals.layers.UI);
  }

  // Draw the strike (bomb) black squares / X's.
  function strikeClick(
    this: StrikeSquare | StrikeX,
    event: Konva.KonvaEventObject<MouseEvent>,
  ) {
    if (globals.variant.throwItInAHole) {
      return;
    }

    switch (event.evt.button) {
      case LEFT_MOUSE_BUTTON: {
        // Left-clicking a strike X or a strike square takes us to the turn that the strike
        // happened. Spoiler-free reviews only reveal strikes that have already happened.
        const { strikes } = replay.isSpoilerFree()
          ? globals.state.visibleState!
          : globals.state.ongoingGame;
        const strike = strikes[this.num];
        if (strike === undefined) {
          // There is no strike yet that corresponds to this square / X, so do nothing.
          return;
        }

        replay.goToSegment(strike.segment, true);

        // Highlight the card
        const card = getCardOrStackBase(strike.order);
        if (card) {
          arrows.toggle(card.order, true);
        }

        break;
      }

      case RIGHT_MOUSE_BUTTON: {
        // Right-clicking a strike X or a strike square shows an arrow over the strike square.
        arrows.click(event, STRIKE_ARROW_TARGETS[this.num]);

        break;
      }

      default: {
        break;
      }
    }
  }

  for (const i of tupleKeys(STRIKE_ARROW_TARGETS)) {
    // Draw the background square.
    const strikeSquare = new StrikeSquare(
      {
        x: strikeSquareX(i) * winW,
        y: STRIKE_SQUARE.y * winH,
        width: STRIKE_SQUARE.w * winW,
        height: STRIKE_SQUARE.h * winH,
        stroke: "black",
        strokeWidth: THIN_STROKE_WIDTH * winH,
        cornerRadius: STRIKE_SQUARE.cornerRadius * winW,
        listening: true,
      },
      i,
    );
    globals.elements.scoreArea.add(strikeSquare);
    globals.elements.strikeSquares.push(strikeSquare);

    // Draw the red X that indicates the strike.
    const strikeX = new StrikeX(
      {
        x: (strikeSquareX(i) + (STRIKE_SQUARE.w - STRIKE_X.w) / 2) * winW,
        y: (STRIKE_SQUARE.y + STRIKE_X.insetY) * winH,
        width: STRIKE_X.w * winW,
        height: STRIKE_X.h * winH,
        image: lobbyGlobals.imageLoader.get("x"),
        opacity: 0,
        listening: true,
      },
      i,
    );
    globals.elements.scoreArea.add(strikeX);
    globals.elements.strikeXs.push(strikeX);

    // For variants where the strikes are hidden, draw a "?".
    if (
      globals.variant.throwItInAHole
      && (globals.state.playing || globals.state.shadowing)
    ) {
      const questionMarkLabel = basicTextLabel.clone({
        text: "?",
        fontSize: STRIKE_QUESTION_MARK.fontSize * winH,
        x: (strikeSquareX(i) + STRIKE_QUESTION_MARK.insetX) * winW,
        y: (STRIKE_SQUARE.y + STRIKE_QUESTION_MARK.insetY) * winH,
        listening: false,
      }) as Konva.Text;
      globals.elements.scoreArea.add(questionMarkLabel);
      globals.elements.questionMarkLabels.push(questionMarkLabel);
    }

    // Handle the tooltips
    strikeSquare.tooltipName = "strikes";
    strikeX.tooltipName = strikeSquare.tooltipName;
    strikeSquare.tooltipContent =
      "This shows how many strikes (bombs) the team currently has.";
    strikeX.tooltipContent = strikeSquare.tooltipContent;
    initKonvaTooltips(strikeSquare, true, false);
    initKonvaTooltips(strikeX, true, false);

    // Click on the strike to go to the turn that the strike happened, if any (and highlight the
    // card that misplayed).
    strikeSquare.on("click tap", strikeClick);
    strikeX.on("click tap", strikeClick);
  }

  // The terminate button (which immediately ends the current game). This is placed on top of the
  // last strike.
  if (globals.state.playing) {
    globals.elements.strikeSquares.at(-1)!.hide();
    globals.elements.strikeXs.at(-1)!.hide();
    globals.elements.questionMarkLabels.at(-1)?.hide();

    const terminateButton = new Button(
      {
        x: strikeSquareX(MAX_STRIKES - 1) * winW,
        y: STRIKE_SQUARE.y * winH,
        width: STRIKE_SQUARE.w * winW,
        height: STRIKE_SQUARE.h * winH,
        visible: globals.state.playing,
      },
      [lobbyGlobals.imageLoader.get("skull")],
    );
    globals.elements.scoreArea.add(terminateButton);
    terminateButton.tooltipName = "kill";
    terminateButton.tooltipContent = "End the game";
    initKonvaTooltips(terminateButton, true, false);
    globals.elements.terminateButton = terminateButton;
  }
}

// The "eyes" symbol to show that one or more people are spectating the game.
function drawSpectators() {
  // Position it to the bottom-left of the score area.
  spectatorsLabelValues = {
    x: scoreAreaValues.x + KELDON_SPECTATORS_OFFSET.x,
    y: scoreAreaValues.y + KELDON_SPECTATORS_OFFSET.y,
  };
  if (!store.getState().session.settings.keldonMode) {
    // Position it to the bottom-right of the score area.
    spectatorsLabelValues.x =
      scoreAreaValues.x + scoreAreaValues.w! + BOTTOM_LEFT_GAP;
  }
  const imageSize = SPECTATORS_COLUMN.EYES_SIZE;
  const spectatorsLabel = new ImageWithTooltip({
    // Center the eyes over the number of spectators.
    x: (spectatorsLabelValues.x + (SPECTATORS_COLUMN.W - imageSize) / 2) * winW,
    y: spectatorsLabelValues.y * winH,
    width: imageSize * winW,
    height: imageSize * winW,
    // (This is not a typo; we want it to have the same width and height.)
    align: "center",
    image: lobbyGlobals.imageLoader.get("eyes"),
    ...TEXT_SHADOW,
    visible: false,
    listening: true,
  });
  globals.layers.UI.add(spectatorsLabel);
  spectatorsLabel.tooltipName = "spectators";
  spectatorsLabel.tooltipContent = ""; // This will be filled in later by the "spectators" command.
  initKonvaTooltips(spectatorsLabel, false, true);
  globals.elements.spectatorsLabel = spectatorsLabel;

  globals.elements.spectatorsNumLabel = new Konva.Text({
    x: spectatorsLabelValues.x * winW,
    y: (spectatorsLabelValues.y + SPECTATORS_COLUMN.NUMBER_Y) * winH,
    width: SPECTATORS_COLUMN.W * winW,
    height: SPECTATORS_COLUMN.NUMBER_FONT_SIZE * winH,
    fontSize: SPECTATORS_COLUMN.NUMBER_FONT_SIZE * winH,
    fontFamily: FONT_FAMILY,
    align: "center",
    text: "0",
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.spectatorsNumLabel);
}

// The "crown" symbol to show that we are in a shared replay.
function drawSharedReplay() {
  // The crown is centered over the spectators column, above the eyes.
  const size = CROWN.SIZE * winW;
  const crownCenter = {
    x: (spectatorsLabelValues.x + SPECTATORS_COLUMN.W / 2) * winW,
    y: (spectatorsLabelValues.y + CROWN_TOP_Y) * winH + size / 2,
  };

  // A circle around the crown indicates that we are the current replay leader. (We want the icon to
  // be on top of this so that it does not interfere with mouse events.)
  globals.elements.sharedReplayLeaderCircle = new Konva.Circle({
    ...crownCenter,
    radius: CROWN.LEADER_RING_RADIUS * winH,
    stroke: ACTIVE_INDICATOR_COLOR,
    strokeWidth: THIN_STROKE_WIDTH * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.sharedReplayLeaderCircle);

  // The crown
  const sharedReplayLeaderLabel = new ImageWithTooltip({
    x: crownCenter.x - size / 2,
    y: crownCenter.y - size / 2,
    width: size,
    height: size,
    image: lobbyGlobals.imageLoader.get("crown"),
    ...TEXT_SHADOW,
    visible: false,
    listening: true,
  });
  globals.layers.UI.add(sharedReplayLeaderLabel);
  globals.elements.sharedReplayLeaderLabel = sharedReplayLeaderLabel;

  // Add an animation to alert everyone when shared replay leadership has been transferred.
  if (!globals.isResizing && !store.getState().session.settings.reducedMotion) {
    globals.elements.sharedReplayLeaderLabelPulse = new Konva.Tween({
      node: sharedReplayLeaderLabel,
      // Grow from the center of the crown.
      width: size * CROWN.PULSE_SCALE,
      height: size * CROWN.PULSE_SCALE,
      offsetX: (size * (CROWN.PULSE_SCALE - 1)) / 2,
      offsetY: (size * (CROWN.PULSE_SCALE - 1)) / 2,
      duration: CARD_ANIMATION_LENGTH_SECONDS,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (globals.elements.sharedReplayLeaderLabelPulse !== undefined) {
          globals.elements.sharedReplayLeaderLabelPulse.reverse();
        }
      },
    });
    globals.elements.sharedReplayLeaderLabelPulse.anim.addLayer(
      globals.layers.UI,
    );
  }

  // Tooltip for the crown.
  sharedReplayLeaderLabel.tooltipName = "leader";
  // This will get filled in later by the "replayLeader" command.
  sharedReplayLeaderLabel.tooltipContent = "";
  initKonvaTooltips(sharedReplayLeaderLabel, false, true);

  // The user can click on the crown to pass the replay leader to an arbitrary person. Require a
  // double tap to prevent accidentally opening the dialog when hovering over the crown.
  sharedReplayLeaderLabel.on("click dbltap", showPassLeaderDialog);
}

// A notification that shows it is your turn.
function drawYourTurn() {
  if (store.getState().session.settings.keldonMode) {
    return;
  }

  // The group is centered on the ellipse.
  globals.elements.yourTurn = new Konva.Group({
    x: (spectatorsLabelValues.x + YOUR_TURN_CENTER.x) * winW,
    y: (spectatorsLabelValues.y + YOUR_TURN_CENTER.y) * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.yourTurn);

  const circle = new Konva.Ellipse({
    radiusX: YOUR_TURN.radiusX * winW,
    radiusY: YOUR_TURN.radiusY * winH,
    ...INDICATOR_ELLIPSE_STYLE,
    strokeWidth: INDICATOR_ELLIPSE_STROKE_WIDTH * winH,
    listening: false,
  });
  globals.elements.yourTurn.add(circle);

  const text = new Konva.Text({
    fontSize: YOUR_TURN.fontSize * winH,
    fontFamily: FONT_FAMILY,
    fill: CURRENT_TURN_COLOR,
    align: "center",
    text: "Your\nTurn",
    listening: false,
  });
  text.offset({
    x: text.width() / 2,
    y: text.height() / 2,
  });
  globals.elements.yourTurn.add(text);
}

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log).
function drawStatistics() {
  // The statistics are a grid of labels with their numbers beside them.
  const labelX = (STATISTICS_PANEL.x + STATISTICS_LABEL_INSET_X) * winW;
  const numberX = (STATISTICS_PANEL.x + STATISTICS_TEXT.numberX) * winW;
  const paceY = (STATISTICS_PANEL.y + STATISTICS_TEXT.paceY) * winH;
  const efficiencyY = (STATISTICS_PANEL.y + STATISTICS_TEXT.efficiencyY) * winH;
  const fontSize = STATISTICS_TEXT.fontSize * winH;

  const statsRect = new Konva.Rect({
    x: STATISTICS_PANEL.x * winW,
    y: STATISTICS_PANEL.y * winH,
    width: STATISTICS_PANEL.w * winW,
    height: STATISTICS_PANEL.h * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: false,
  });
  globals.layers.UI.add(statsRect);

  const variantLabel = new FitText({
    text: globals.variant.name.replace(/(?<!\s)\s*\(\d Suits\)/u, ""),
    x: labelX,
    y: (STATISTICS_PANEL.y + STATISTICS_TEXT.variantY) * winH,
    width: STATISTICS_TEXT.variantW * winW,
    height: STATISTICS_TEXT.variantH * winH,
    fontSize,
    fontFamily: FONT_FAMILY,
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
    align: "center",
    listening: false,
  });
  globals.layers.UI.add(variantLabel);
  globals.elements.variantLabel = variantLabel;

  const underlineY = (STATISTICS_PANEL.y + STATISTICS_TEXT.underlineY) * winH;
  const variantUnderline = new Konva.Line({
    points: [
      labelX,
      underlineY,
      (STATISTICS_PANEL.x + STATISTICS_PANEL.w - STATISTICS_LABEL_INSET_X)
        * winW,
      underlineY,
    ],
    stroke: LABEL_COLOR,
    strokeWidth: VARIANT_UNDERLINE_WIDTH_PIXELS,
    lineJoin: "round",
    ...LINE_SHADOW,
    shadowOpacity: 0,
    listening: false,
  });
  globals.layers.UI.add(variantUnderline);
  globals.elements.variantUnderline = variantUnderline;

  const paceTextLabel = basicTextLabel.clone({
    text: "Pace",
    x: labelX,
    y: paceY,
    fontSize,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(paceTextLabel);
  paceTextLabel.tooltipName = "pace";
  paceTextLabel.tooltipContent = `
    Pace is a measure of how many discards can happen while<br />
    still having a chance to get the maximum score.<br />
    (For more information, click on the "Help" button in the lobby.)
  `;
  initKonvaTooltips(paceTextLabel, true, false);

  const paceNumberLabel = basicNumberLabel.clone({
    text: "-",
    x: numberX,
    y: paceY,
    fontSize,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(paceNumberLabel);
  globals.elements.paceNumberLabel = paceNumberLabel;

  paceTextLabel.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
    arrows.click(event, "pace");
  });
  paceNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "pace");
    },
  );

  const efficiencyTextLabel = basicTextLabel.clone({
    text: "Efficiency",
    x: labelX,
    y: efficiencyY,
    fontSize,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(efficiencyTextLabel);
  efficiencyTextLabel.tooltipName = "efficiency-text";
  const efficiencyTextLabelContent = `
    Efficiency is calculated by:
    <em class="tooltip-indent">
      (number of cards played +<br />
      number of touched cards) /<br />
      number of clues given or lost
    </em>
    The first number is the minimum amount of efficiency needed from<br />
    this turn onward in order to win (i.e. future required efficiency).<br />
    The second number shows the minimum possible efficiency needed<br />
    to win with the current number of players and the current variant.<br />
    (For more information, click on the "Help" button in the lobby.)
  `;
  efficiencyTextLabel.tooltipContent = efficiencyTextLabelContent;
  initKonvaTooltips(efficiencyTextLabel, true, false);
  efficiencyTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "efficiency");
    },
  );

  const efficiencyNumberLabel = basicNumberLabel.clone({
    text: "-",
    x: numberX,
    y: efficiencyY,
    fontSize,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(efficiencyNumberLabel);
  globals.elements.efficiencyNumberLabel = efficiencyNumberLabel;
  efficiencyNumberLabel.on("click", stats.efficiencyLabelClick);
  efficiencyNumberLabel.on("dbltap", stats.askForEfficiency);
  efficiencyNumberLabel.tooltipName = "efficiency-number";
  // "statsView.ts" fills in the tooltip.
  efficiencyNumberLabel.tooltipContent = "";
  initKonvaTooltips(efficiencyNumberLabel, true, false);

  const efficiencyPipeLabel = basicNumberLabel.clone({
    text: " | ",
    x: numberX + STATISTICS_TEXT.pipeX * winW,
    y: efficiencyY,
    fontSize,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyPipeLabel);
  globals.elements.efficiencyPipeLabel = efficiencyPipeLabel;

  const efficiencyMinNeededLabel = basicNumberLabel.clone({
    text: globals.metadata.minEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES),
    x: numberX + STATISTICS_TEXT.minEfficiencyX * winW,
    y: efficiencyY,
    fontSize,
    // - "Easy" variants use the default color (off-white).
    // - "Hard" variants use pink.
    fill:
      globals.metadata.hardVariant
      && store.getState().session.settings.hGroupConventions
        ? HARD_VARIANT_EFFICIENCY_COLOR
        : LABEL_COLOR,
    // If colorblindMode is activated, indicate make font bold if "Hard".
    fontStyle:
      globals.metadata.hardVariant
      && store.getState().session.settings.hGroupConventions
      && store.getState().session.settings.colorblindMode
        ? "bold"
        : "normal",
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyMinNeededLabel);
  efficiencyMinNeededLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "minEfficiency");
    },
  );
  globals.elements.efficiencyMinNeededLabel = efficiencyMinNeededLabel;
}

function drawDiscardArea() {
  // The red border that surrounds the discard pile when the team is at 8 clues.
  globals.elements.noDiscardBorder = new Konva.Rect({
    x: DISCARD_AREA.x * winW,
    y: DISCARD_AREA.y * winH,
    width: DISCARD_AREA.w * winW,
    height: DISCARD_AREA.h * winH,
    stroke: WARNING_COLOR,
    strokeWidth: WARNING_BORDER_WIDTH.noDiscard * winW,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.noDiscardBorder);

  // The yellow border that surrounds the discard pile when it is a "Double Discard" situation.
  globals.elements.noDoubleDiscardBorder = new Konva.Rect({
    x: DISCARD_AREA.x * winW,
    y: DISCARD_AREA.y * winH,
    width: DISCARD_AREA.w * winW,
    height: DISCARD_AREA.h * winH,
    stroke: DOUBLE_DISCARD_COLOR,
    strokeWidth: WARNING_BORDER_WIDTH.doubleDiscard * winW,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    opacity: DOUBLE_DISCARD_BORDER_OPACITY,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.noDoubleDiscardBorder);

  // The faded rectangle around the trash can.
  const discardAreaRect = new Konva.Rect({
    x: DISCARD_AREA.x * winW,
    y: DISCARD_AREA.y * winH,
    width: DISCARD_AREA.w * winW,
    height: DISCARD_AREA.h * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: false,
  });
  globals.layers.UI.add(discardAreaRect);

  // The trash can icon over the discard pile.
  const trashcan = new Konva.Image({
    x: (DISCARD_AREA.x + TRASH_CAN_INSET.x) * winW,
    y: (DISCARD_AREA.y + TRASH_CAN_INSET.top) * winH,
    width: (DISCARD_AREA.w - TRASH_CAN_INSET.x * 2) * winW,
    height:
      (DISCARD_AREA.h - TRASH_CAN_INSET.top - TRASH_CAN_INSET.bottom) * winH,
    opacity: TRASH_CAN_OPACITY,
    image: lobbyGlobals.imageLoader.get("trashcan"),
    listening: false,
  });
  globals.layers.UI.add(trashcan);

  // This is the invisible rectangle that players drag cards to in order to discard them. It extends
  // to the edges of the stage so that cards dropped beside the discard pile still count.
  globals.elements.discardArea = new Konva.Rect({
    x: DISCARD_AREA.x * winW,
    y: DISCARD_AREA.y * winH,
    width: (1 - DISCARD_AREA.x) * winW,
    height: (1 - DISCARD_AREA.y) * winH,
    listening: false,
  });
}

function drawArrows() {
  repeat(MAX_CARDS_PER_HAND, () => {
    const arrow = new Arrow(
      winW,
      winH,
      store.getState().session.settings.colorblindMode,
    );
    globals.layers.arrow.add(arrow);
    globals.elements.arrows.push(arrow);
  });
}

function drawTimers() {
  // We do not want the timer to show in replays or untimed games (unless they have the optional
  // setting turned on).
  if (
    globals.state.finished
    || (globals.options.timeControl === undefined
      && !store.getState().session.settings.showTimerInUntimed)
  ) {
    return;
  }

  const timerValues = {
    ...TIMER,
    ...(store.getState().session.settings.keldonMode
      ? {
          x1: KELDON_TIMERS.x1,
          x2: KELDON_TIMERS.x2,
          y1: KELDON_TIMERS.y,
          y2: KELDON_TIMERS.y,
        }
      : {
          x1: BGA_TIMERS.x,
          x2: BGA_TIMERS.x,
          y1: BGA_TIMERS.y1,
          y2: BGA_TIMERS.y2,
        }),
  };

  // A circle around the timer indicates that we have queued a pause. (We want the timer to be on
  // top of this so that it does not interfere with mouse events.)
  globals.elements.timer1Circle = new Konva.Ellipse({
    x: (timerValues.x1 + TIMER_PAUSE_RING_CENTER.x) * winW,
    y: (timerValues.y1 + TIMER_PAUSE_RING_CENTER.y) * winH,
    radiusX: TIMER_PAUSE_RING_RADIUS.x * winW,
    radiusY: TIMER_PAUSE_RING_RADIUS.y * winH,
    stroke: ACTIVE_INDICATOR_COLOR,
    strokeWidth: THIN_STROKE_WIDTH * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.timer1Circle);

  // The timer for "You".
  globals.elements.timer1 = new TimerDisplay({
    x: timerValues.x1 * winW,
    y: timerValues.y1 * winH,
    width: timerValues.w * winW,
    height: timerValues.h * winH,
    fontSize: timerValues.fontSize * winH,
    cornerRadius: timerValues.cornerRadius * winH,
    spaceH: timerValues.spaceH * winH,
    label: "You",
    visible: false,
    listening: true,
  });
  globals.layers.timer.add(globals.elements.timer1);

  globals.elements.timer1.on(
    "click",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      // "event.evt.buttons" is always 0 here.
      if (event.evt.button === RIGHT_MOUSE_BUTTON) {
        // Right-click
        timerClick();
      }
    },
  );
  globals.elements.timer1.on("dbltap", timerClick);

  // The timer for the current player.
  globals.elements.timer2 = new TimerDisplay({
    x: timerValues.x2 * winW,
    y: timerValues.y2 * winH,
    width: timerValues.w * winW,
    height: timerValues.h * winH,
    fontSize: timerValues.fontSize * winH,
    labelFontSize: timerValues.labelFontSize * winH,
    cornerRadius: timerValues.cornerRadius * winH,
    spaceH: timerValues.spaceH * winH,
    visible: false,
    listening: true,
  });
  globals.layers.timer.add(globals.elements.timer2);
  if (
    globals.options.timeControl !== undefined
    || store.getState().session.settings.showTimerInUntimed
  ) {
    globals.elements.timer2.tooltipName = "time-taken";
    initKonvaTooltips(globals.elements.timer2, true, false);
  }
}

function timerClick() {
  if (
    globals.options.timeControl === undefined // We do not need to pause if this is not a timed game.
    || globals.state.pause.pausingPlayerIndex !== undefined // We do not need to pause if the game is already paused.
  ) {
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;

  const tableId = lobbyGlobals.joinedTableId;
  if (isOurSeat(currentPlayerIndex, globals.metadata)) {
    lobbyGlobals.connection.send("pause", {
      tableId,
      paused: true,
    });
    return;
  }

  const queued = !globals.state.pause.queued;
  store.dispatch(
    gameUpdated({
      type: "pauseQueue",
      queued,
    }),
  );
  lobbyGlobals.connection.send("pauseQueue", {
    tableId,
    queued,
  });
}

function drawClueArea() {
  // Put the clue area directly below the play stacks, with a little bit of spacing.
  clueAreaValues = {
    x: actionLogValues.x,
    y: playAreaValues.y + playAreaValues.h! + CLUE_AREA.gapY,
    w: actionLogValues.w!,
    h: CLUE_AREA.h,
  };
  if (globals.variant.showSuitNames) {
    clueAreaValues.y += CLUE_AREA.suitNamesOffsetY;
  }
  // In BGA mode, we can afford to put a bit more spacing to make it look less packed together.
  if (!store.getState().session.settings.keldonMode) {
    clueAreaValues.y += CLUE_AREA.bgaOffsetY;
  }
  globals.elements.clueArea = new Konva.Group({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
    visible: false,
  });

  // Player buttons
  const { numPlayers } = globals.options;
  const playerButtonH = store.getState().session.settings.keldonMode
    ? CLUE_TARGET_BUTTON.keldonH
    : CLUE_TARGET_BUTTON.bgaH;
  const playerButtonSpacing = CLUE_TARGET_BUTTON.spacing;

  // If this is a two player game, we can slide the clue UI down by a bit (since the clue target
  // buttons won't be shown).
  const playerButtonAdjustment =
    numPlayers === MIN_PLAYERS ? playerButtonH / 2 : 0;

  // This is the normal button group, which does not include us.
  globals.elements.clueTargetButtonGroup = new ButtonGroup({});
  {
    const totalPlayerButtons = numPlayers - 1;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (const i of eRange(totalPlayerButtons)) {
      const playerIndex = ((getViewPlayerIndex(globals.metadata) + i + 1)
        % numPlayers) as PlayerIndex;
      const button = new PlayerButton(
        {
          x: (playerButtonW + playerButtonSpacing) * i * winW,
          y: 0,
          width: playerButtonW * winW,
          height: playerButtonH * winH,
          text: globals.metadata.playerNames[playerIndex],
        },
        playerIndex,
      );
      globals.elements.clueTargetButtonGroup.add(button);
      globals.elements.clueTargetButtonGroup.addList(button);
    }
  }
  globals.elements.clueArea.add(globals.elements.clueTargetButtonGroup);
  if (numPlayers === MIN_PLAYERS) {
    // The clue target buttons are pointless if we are playing a 2-player game (because we only have
    // the ability to clue one player).
    globals.elements.clueTargetButtonGroup.hide();
    // Default the clue recipient button to the only other player available.
    globals.elements.clueTargetButtonGroup.list[0]!.setPressed(true);
  }

  // This button group includes us, which is used for hypotheticals.
  globals.elements.clueTargetButtonGroup2 = new ButtonGroup({});
  {
    const totalPlayerButtons = numPlayers;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (const i of eRange(totalPlayerButtons)) {
      // We change the calculation of `playerIndex` from the above code block because we want the
      // buttons to follow the order of players from top to bottom (in BGA mode).
      const playerIndex = ((getViewPlayerIndex(globals.metadata) + i)
        % numPlayers) as PlayerIndex;
      const button = new PlayerButton(
        {
          x: (playerButtonW + playerButtonSpacing) * i * winW,
          y: 0,
          width: playerButtonW * winW,
          height: playerButtonH * winH,
          text: globals.metadata.playerNames[playerIndex],
        },
        playerIndex,
      );
      globals.elements.clueTargetButtonGroup2.add(button);
      globals.elements.clueTargetButtonGroup2.addList(button);
    }
  }
  globals.elements.clueArea.add(globals.elements.clueTargetButtonGroup2);
  globals.elements.clueTargetButtonGroup2.hide();

  // Clue type buttons
  const {
    w: buttonW,
    h: buttonH,
    spacingX: buttonXSpacing,
    spacingY: buttonYSpacing,
  } = CLUE_TYPE_BUTTON;
  globals.elements.clueTypeButtonGroup = new ButtonGroup({});

  // In a hypo, the lower part of the clue UI slides left independently of the clue target buttons.
  // The limiting factor on how far it can slide is when there is a color button for every suit.
  const maxColorWidth = buttonW * MAX_SUITS + buttonXSpacing * (MAX_SUITS - 1);
  lowerClueAreaSlideX = (clueAreaValues.w! - maxColorWidth) / 2;
  const offsetX = -lowerClueAreaSlideX * winW;
  function setLeft(this: SlidableGroup) {
    const x = offsetX;
    this.x(x);
  }

  function setCenter(this: SlidableGroup) {
    this.x(0);
  }

  lowerClueAreaValues = {
    x: 0,
    y: playerButtonH,
    w: maxColorWidth,
  };

  globals.elements.lowerClueArea = new SlidableGroup({
    x: lowerClueAreaValues.x * winW,
    y: lowerClueAreaValues.y * winH,
    width: lowerClueAreaValues.w!,
  });

  globals.elements.lowerClueArea.setLeft = setLeft;
  globals.elements.lowerClueArea.setCenter = setCenter;
  globals.elements.lowerClueArea.setCenter();
  globals.elements.clueArea.add(globals.elements.lowerClueArea);

  // Color buttons
  globals.elements.colorClueButtons = [];
  let totalColorWidth = buttonW * globals.variant.clueColors.length;
  totalColorWidth += buttonXSpacing * (globals.variant.clueColors.length - 1);
  const colorX = (clueAreaValues.w! - totalColorWidth) / 2;
  const colorY = buttonYSpacing - playerButtonAdjustment;
  for (const [i, clueColor] of globals.variant.clueColors.entries()) {
    // Find the first suit that matches this color.
    let matchingSuit: Suit | undefined;
    for (const suit of globals.variant.suits) {
      if (suit.clueColors.includes(clueColor)) {
        matchingSuit = suit;
        break;
      }
    }
    assertDefined(
      matchingSuit,
      `Failed to find the suit for the clue color of: ${clueColor.name}`,
    );

    const button = new ColorButton(
      {
        x: (colorX + i * (buttonW + buttonXSpacing)) * winW,
        y: colorY * winH,
        width: buttonW * winW,
        height: buttonH * winH,
        color: clueColor.fill,
        text: clueColor.abbreviation,
        clue: newColorClue(clueColor),
      },
      matchingSuit,
      globals.variant,
    );

    globals.elements.clueTypeButtonGroup.add(button);
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.colorClueButtons.push(button);
  }

  // Rank buttons / number buttons.
  globals.elements.rankClueButtons = [];
  const numRanks = globals.variant.clueRanks.length;
  let totalRankWidth = buttonW * numRanks;
  totalRankWidth += buttonXSpacing * (numRanks - 1);
  const rankX = (clueAreaValues.w! - totalRankWidth) / 2;
  const rankY = colorY + buttonH + buttonYSpacing;
  lowerClueAreaRowsW = Math.max(
    totalColorWidth,
    totalRankWidth,
    GIVE_CLUE_BUTTON.w,
  );
  for (const [i, rank] of globals.variant.clueRanks.entries()) {
    const button = new RankButton({
      x: (rankX + i * (buttonW + buttonXSpacing)) * winW,
      y: rankY * winH,
      width: buttonW * winW,
      height: buttonH * winH,
      label: rankTextFromVariant(rank),
      clue: newRankClue(rank),
    });

    globals.elements.clueTypeButtonGroup.add(button);
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.rankClueButtons.push(button);
  }

  // Set button functionality
  globals.elements.clueTargetButtonGroup.on("change", clues.checkLegal);
  globals.elements.clueTargetButtonGroup2.on("change", clues.checkLegal);
  globals.elements.clueTypeButtonGroup.on("change", clues.checkLegal);

  globals.elements.lowerClueArea.add(globals.elements.clueTypeButtonGroup);

  // The "Give Clue" button.
  giveClueValues = {
    x: (clueAreaValues.w! - GIVE_CLUE_BUTTON.w) / 2,
    y: rankY + buttonH + buttonYSpacing,
    w: GIVE_CLUE_BUTTON.w - buttonW - buttonXSpacing,
    h: GIVE_CLUE_BUTTON.h,
  };

  globals.elements.giveClueButton = new Button({
    x: giveClueValues.x * winW,
    y: giveClueValues.y * winH,
    width: giveClueValues.w! * winW,
    height: giveClueValues.h! * winH,
    text: "Give Clue",
  });
  globals.elements.giveClueButton.setEnabled(false);
  globals.elements.lowerClueArea.add(globals.elements.giveClueButton);
  globals.elements.giveClueButton.on("click tap", clues.give);

  // The post-clue empathy checkbox, to the right of the "Give Clue" button.
  const postClueEmpathyCheckbox = new Checkbox(
    {
      x: (giveClueValues.x + giveClueValues.w! + buttonXSpacing) * winW,
      y: giveClueValues.y * winH,
      width: buttonW * winW,
      height: giveClueValues.h! * winH,
    },
    lobbyGlobals.imageLoader.get("flashlight"),
  );
  globals.elements.lowerClueArea.add(postClueEmpathyCheckbox);
  postClueEmpathyCheckbox.on("click tap", cluePreview.toggle);
  postClueEmpathyCheckbox.tooltipName = "post-clue-empathy";
  postClueEmpathyCheckbox.tooltipContent =
    "Show post-clue empathy: show the target's hand as they would see it after the selected clue.";
  initKonvaTooltips(postClueEmpathyCheckbox, true, false);
  globals.elements.postClueEmpathyCheckbox = postClueEmpathyCheckbox;

  globals.layers.UI.add(globals.elements.clueArea);

  // The clue area is disabled when there are 0 clue tokens.
  drawClueAreaDisabled(offsetX);

  // The "waiting" animation that will display until the server acknowledges the player's action.
  drawClueAreaWaitingForServer();
}

function rankTextFromVariant(rank: ClueRank): string {
  if (globals.variant.oddsAndEvens) {
    return rank === ODD_RANK_CLUE ? "O" : "E";
  }

  return rank.toString();
}

function drawClueAreaDisabled(offsetX: number) {
  // We fade the clue area and draw a rectangle on top of it when there are no clues available.
  globals.elements.clueAreaDisabled = new SlidableGroup({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
  });

  function setLeft(this: SlidableGroup) {
    this.x(clueAreaValues.x * winW + offsetX);
  }
  globals.elements.clueAreaDisabled.setLeft = setLeft;

  function setCenter(this: SlidableGroup) {
    this.x(clueAreaValues.x * winW);
  }
  globals.elements.clueAreaDisabled.setCenter = setCenter;
  globals.elements.clueAreaDisabled.setCenter();

  // A transparent rectangle to stop clicks.
  const rect = new Konva.Rect({
    width: clueAreaValues.w! * winW,
    height: clueAreaValues.h! * winH,
    listening: true, // It must listen or it won't stop clicks.
  });
  globals.elements.clueAreaDisabled.add(rect);

  const spacing = CLUE_AREA_DISABLED_CROSS_INSET;
  const lineStyle = {
    stroke: CLUE_AREA_DISABLED_CROSS_COLOR,
    strokeWidth: CLUE_AREA_DISABLED_CROSS_WIDTH * winH,
    listening: false,
  } as const;

  // The line from top-left to bottom-right.
  const line1 = new Konva.Line({
    points: [
      spacing.x * winW,
      spacing.y * winH,
      (clueAreaValues.w! - spacing.x) * winW,
      (clueAreaValues.h! - spacing.y) * winH,
    ],
    ...lineStyle,
  });
  globals.elements.clueAreaDisabled.add(line1);

  // The line from bottom-left to top-right.
  const line2 = new Konva.Line({
    points: [
      spacing.x * winW,
      (clueAreaValues.h! - spacing.y) * winH,
      (clueAreaValues.w! - spacing.x) * winW,
      spacing.y * winH,
    ],
    ...lineStyle,
  });
  globals.elements.clueAreaDisabled.add(line2);

  // The "No clues available" text.
  const noCluesText = new FitText({
    y: clueAreaValues.h! * NO_CLUES_TEXT.y * winH,
    width: clueAreaValues.w! * winW,
    fontSize: NO_CLUES_TEXT.fontSize * winH,
    fontFamily: FONT_FAMILY,
    align: "center",
    text: "No clues",
    fill: LABEL_COLOR,
    stroke: "black",
    strokeWidth: THIN_STROKE_WIDTH * winH,
    listening: false,
  });
  globals.elements.clueAreaDisabled.add(noCluesText);

  globals.elements.clueAreaDisabled.hide();
  globals.layers.UI.add(globals.elements.clueAreaDisabled);
}

function drawClueAreaWaitingForServer() {
  const waitingOnServer = new Konva.Group({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
    height: clueAreaValues.h! * winH,
    visible: false,
    listening: false,
  });

  globals.layers.UI.add(waitingOnServer);
  globals.elements.waitingOnServer = waitingOnServer;
  globals.elements.waitingOnServerAnimation = createWaitingOnServerAnimation(
    waitingOnServer,
    globals.layers.UI,
  );
}

function createWaitingOnServerAnimation(
  waitingOnServer: Konva.Group,
  layer: Konva.Layer,
): Konva.Animation {
  const circleConfig = {
    x: waitingOnServer.width() / 2,
    y: waitingOnServer.height() / 2,
    radius: WAITING_ON_SERVER_RING.radius * winH,
    strokeWidth: WAITING_ON_SERVER_RING.strokeWidth * winH,
  } as const;

  const blueCircle = new Konva.Circle({
    ...circleConfig,
    stroke: "blue",
  });

  waitingOnServer.add(blueCircle);

  const redCircle = new Konva.Circle({
    ...circleConfig,
    stroke: "red",
  });

  waitingOnServer.add(redCircle);

  const period = SECOND_IN_MILLISECONDS;
  return new Konva.Animation((frame: Konva.Animation["frame"]) => {
    const scale = (frame.time % period) / period;
    blueCircle.scale({
      x: scale,
      y: scale,
    });
    blueCircle.opacity(1 - scale);

    const redScale = ((frame.time + period / 2) % period) / period;
    redCircle.scale({
      x: redScale,
      y: redScale,
    });
    redCircle.opacity(1 - redScale);
  }, layer);
}

function drawCurrentPlayerArea() {
  // The "Current player: [player name]" box
  const currentPlayerAreaValues = {
    x: clueAreaValues.x + (clueAreaValues.w! - CURRENT_PLAYER_AREA.w) / 2,
    y: clueAreaValues.y + CURRENT_PLAYER_AREA.offsetY,
    w: CURRENT_PLAYER_AREA.w,
    h: CURRENT_PLAYER_AREA.h,
    spacing: CURRENT_PLAYER_AREA.spacing,
  };
  globals.elements.currentPlayerArea = new CurrentPlayerArea(
    currentPlayerAreaValues,
    winW,
    winH,
  );
  globals.layers.UI.add(globals.elements.currentPlayerArea);
}

function drawPreplayArea() {
  const { w, h } = PREMOVE_CANCEL_BUTTON;
  const x = clueAreaValues.x + (clueAreaValues.w! - w) / 2;
  const y = clueAreaValues.y + PREMOVE_CANCEL_BUTTON.offsetY;
  globals.elements.premoveCancelButton = new Button({
    x: x * winW,
    y: y * winH,
    width: w * winW,
    height: h * winH,
    text: "Cancel Pre-Move",
    visible: false,
  });
  globals.layers.UI.add(globals.elements.premoveCancelButton);
  globals.elements.premoveCancelButton.on("click tap", () => {
    store.dispatch(
      gameUpdated({
        type: "premove",
        premove: undefined,
      }),
    );
  });
}

function drawHypotheticalArea() {
  const hypoValues = {
    x: actionLogValues.x,
    y: clueAreaValues.y + HYPO_INDICATOR.offsetY,
    w: actionLogValues.w,
    h: HYPO_INDICATOR.h,
  };

  // The circle is centered on the text.
  const hypoTextY = hypoValues.h * HYPO_INDICATOR.textY;
  const hypoFontSize = HYPO_INDICATOR.fontSize;

  // The "Hypothetical" circle that shows we are currently in a hypothetical.
  globals.elements.hypoCircle = new Konva.Group({
    x: hypoValues.x * winW,
    y: hypoValues.y * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.hypoCircle);

  const circle = new Konva.Ellipse({
    x: (hypoValues.w! / 2) * winW,
    y: (hypoTextY + hypoFontSize / 2) * winH,
    radiusX: hypoValues.w! * HYPO_INDICATOR.radiusX * winW,
    radiusY: hypoValues.h * winH,
    ...INDICATOR_ELLIPSE_STYLE,
    strokeWidth: INDICATOR_ELLIPSE_STROKE_WIDTH * winH,
    listening: false,
  });
  globals.elements.hypoCircle.add(circle);

  const text = new FitText({
    y: hypoTextY * winH,
    name: "text",
    width: hypoValues.w! * winW,
    fontSize: hypoFontSize * winH,
    fontFamily: FONT_FAMILY,
    fill: LABEL_COLOR,
    align: "center",
    text: "Hypothetical",
    listening: false,
  });
  globals.elements.hypoCircle.add(text);

  // The replay area is hidden during hypotheticals, so spectators need another "Pause Shared Turns"
  // button to leave the leader's hypothetical.
  const pauseButtonValues = HYPO_INDICATOR.button;
  const ellipseBottomY =
    hypoValues.y + hypoTextY + hypoFontSize / 2 + hypoValues.h;
  globals.elements.hypoPauseSharedTurnsButton = new Button({
    x: (hypoValues.x + (hypoValues.w! - pauseButtonValues.w) / 2) * winW,
    y: (ellipseBottomY + pauseButtonValues.gapY) * winH,
    width: pauseButtonValues.w * winW,
    height: pauseButtonValues.h * winH,
    text: "Pause Shared Turns",
    visible: false,
  });
  globals.elements.hypoPauseSharedTurnsButton.on(
    "click tap",
    replay.toggleSharedSegments,
  );
  globals.layers.UI.add(globals.elements.hypoPauseSharedTurnsButton);

  globals.elements.hypoButtonsArea = new Konva.Group({
    visible: false,
  });

  globals.layers.UI.add(globals.elements.hypoButtonsArea);

  // The hypothetical buttons share the row of the give clue button.
  const hypoButtonHeight = giveClueValues.h!;
  const hypoButtonFontSize = HYPO_BUTTON.fontSize;
  const hypoButtonWidth = HYPO_BUTTON.w;
  const hypoButtonSpacing = HYPO_BUTTON.spacing;

  // The "Back 1 Turn" button (to the right of the widest row of the clue area, after it slides
  // left).
  const hypoBackButtonValues = {
    x:
      clueAreaValues.x
      + lowerClueAreaValues.x
      - lowerClueAreaSlideX
      + (clueAreaValues.w! + lowerClueAreaRowsW) / 2
      + hypoButtonSpacing,
    y: clueAreaValues.y + lowerClueAreaValues.y + giveClueValues.y,
    w: HYPO_BUTTON.backW,
    h: hypoButtonHeight,
  };

  globals.elements.hypoBackButton = new Button({
    x: hypoBackButtonValues.x * winW,
    y: hypoBackButtonValues.y * winH,
    width: hypoBackButtonValues.w * winW,
    height: hypoBackButtonValues.h * winH,
    text: "Back",
    fontSize: hypoButtonFontSize * winH,
  });

  globals.elements.hypoBackButton.tooltipName = "hypo-back";
  globals.elements.hypoBackButton.tooltipContent =
    "Go back a turn in this hypothetical.";
  initKonvaTooltips(globals.elements.hypoBackButton, true, false);

  globals.elements.hypoBackButton.on(
    "click tap",
    hypothetical.sendHypotheticalBack,
  );
  globals.elements.hypoButtonsArea.add(globals.elements.hypoBackButton);

  // The "Pass" button (above the back button).
  globals.elements.hypoPassTurnButton = new Button({
    x: hypoBackButtonValues.x * winW,
    y: (hypoBackButtonValues.y - hypoButtonHeight - hypoButtonSpacing) * winH,
    width: hypoBackButtonValues.w * winW,
    height: hypoBackButtonValues.h * winH,
    text: "Pass",
    fontSize: hypoButtonFontSize * winH,
  });

  globals.elements.hypoPassTurnButton.tooltipName = "hypo-pass-turn";
  globals.elements.hypoPassTurnButton.tooltipContent =
    "Spend a clue to pass the turn to the next player without giving a clue. (Right arrow)";
  initKonvaTooltips(globals.elements.hypoPassTurnButton, true, false);

  globals.elements.hypoPassTurnButton.on(
    "click tap",
    hypothetical.sendHypotheticalPassTurn,
  );
  globals.elements.hypoButtonsArea.add(globals.elements.hypoPassTurnButton);

  // The "End Hypothetical" button (to the right of the back button).
  const endHypotheticalButtonValues = {
    x: hypoBackButtonValues.x + hypoBackButtonValues.w + hypoButtonSpacing,
    y: hypoBackButtonValues.y,
  };

  const endHypotheticalButton = new Button({
    x: endHypotheticalButtonValues.x * winW,
    y: endHypotheticalButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Exit Hypo",
    fontSize: hypoButtonFontSize * winH,
  });
  globals.elements.hypoButtonsArea.add(endHypotheticalButton);
  endHypotheticalButton.on("click tap", () => {
    hypothetical.endHypothetical();
  });
  globals.elements.endHypotheticalButton = endHypotheticalButton;

  // The "Edit cards" checkbox (above the exit hypo button).
  const editCardsValues = {
    x: endHypotheticalButtonValues.x,
    y: endHypotheticalButtonValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.editCardsCheckbox = new Checkbox(
    {
      x: editCardsValues.x * winW,
      y: editCardsValues.y * winH,
      width: hypoButtonWidth * winW,
      height: hypoButtonHeight * winH,
    },
    "Edit cards",
    hypoButtonFontSize * winH,
  );

  globals.elements.editCardsCheckbox.tooltipName = "hypo-edit-cards";
  globals.elements.editCardsCheckbox.tooltipContent =
    "While this is checked, click on a card to change it into another card.";
  initKonvaTooltips(globals.elements.editCardsCheckbox, true, false);

  globals.elements.editCardsCheckbox.on("click tap", () => {
    globals.elements.editCardsCheckbox?.setChecked(
      !globals.elements.editCardsCheckbox.checked,
    );
  });
  globals.elements.hypoButtonsArea.add(globals.elements.editCardsCheckbox);

  // The "Show drawn cards" checkbox (above the edit cards checkbox).
  const showDrawnCardsValues = {
    x: editCardsValues.x,
    y: editCardsValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.showDrawnCardsCheckbox = new Checkbox(
    {
      x: showDrawnCardsValues.x * winW,
      y: showDrawnCardsValues.y * winH,
      width: hypoButtonWidth * winW,
      height: hypoButtonHeight * winH,
    },
    "Show drawn cards",
    hypoButtonFontSize * winH,
  );
  globals.elements.showDrawnCardsCheckbox.tooltipName = "hypo-show-drawn";
  globals.elements.showDrawnCardsCheckbox.tooltipContent =
    "Show the front faces of cards drawn during the hypothetical.";
  initKonvaTooltips(globals.elements.showDrawnCardsCheckbox, true, false);

  globals.elements.showDrawnCardsCheckbox.on(
    "click tap",
    hypothetical.toggleRevealed,
  );
  globals.elements.hypoButtonsArea.add(globals.elements.showDrawnCardsCheckbox);
}

function drawPauseArea() {
  const pauseAreaValues = PAUSE_DIALOG;

  globals.elements.pauseArea = new Konva.Group({
    x: ((1 - pauseAreaValues.w) / 2) * winW,
    y: ((1 - pauseAreaValues.h) / 2) * winH,
    visible: false,
  });
  globals.layers.UI2.add(globals.elements.pauseArea);

  const pauseRect = new Konva.Rect({
    width: pauseAreaValues.w * winW,
    height: pauseAreaValues.h * winH,
    fill: getCanvasColors().surfaceArea,
    cornerRadius: DIALOG_CORNER_RADIUS * winH,
    listening: true,
  });
  globals.elements.pauseArea.add(pauseRect);

  const pauseTitle = new Konva.Text({
    y: DIALOG.TITLE_Y * winH,
    width: pauseAreaValues.w * winW,
    fontFamily: FONT_FAMILY,
    fontSize: DIALOG.TITLE_FONT_SIZE * winH,
    text: "Game Paused",
    align: "center",
    fill: "white",
    ...TEXT_SHADOW,
    listening: false,
  });
  globals.elements.pauseArea.add(pauseTitle);

  globals.elements.pauseText = new Konva.Text({
    y: PAUSE_DIALOG.textY * winH,
    width: pauseAreaValues.w * winW,
    fontFamily: FONT_FAMILY,
    fontSize: PAUSE_DIALOG.textFontSize * winH,
    text: "by: [username]",
    align: "center",
    fill: "white",
    ...TEXT_SHADOW,
    listening: false,
  });
  globals.elements.pauseArea.add(globals.elements.pauseText);

  const button1W = pauseAreaValues.w * PAUSE_DIALOG.unpauseButtonW;
  const button2W = pauseAreaValues.w * PAUSE_DIALOG.smallButtonW;
  const { buttonY } = PAUSE_DIALOG;
  const spacing = pauseAreaValues.w * DIALOG.BUTTON_SPACING;
  // The row has the same margin on both sides, with equal gaps between the buttons.
  const buttonGap =
    (pauseAreaValues.w - spacing * 2 - button1W - button2W * 2) / 2;
  const chatButtonX = spacing + button1W + buttonGap;
  const pauseLobbyButtonX = chatButtonX + button2W + buttonGap;

  globals.elements.pauseButton = new Button({
    x: spacing * winW,
    y: buttonY * winH,
    width: button1W * winW,
    height: DIALOG.BUTTON_H * winH,
    text: "Unpause",
  });
  globals.elements.pauseButton.on("click tap", () => {
    lobbyGlobals.connection.send("pause", {
      tableId: lobbyGlobals.joinedTableId,
      paused: false,
    });
  });
  globals.elements.pauseArea.add(globals.elements.pauseButton);

  const chatButton = new Button({
    x: chatButtonX * winW,
    y: buttonY * winH,
    width: button2W * winW,
    height: DIALOG.BUTTON_H * winH,
    // eslint-disable-next-line complete/require-ascii
    text: "💬",
  });
  globals.elements.pauseArea.add(chatButton);
  chatButton.on("click tap", () => {
    gameChat.toggle();
  });

  const pauseLobbyButton = new Button(
    {
      x: pauseLobbyButtonX * winW,
      y: buttonY * winH,
      width: button2W * winW,
      height: DIALOG.BUTTON_H * winH,
    },
    [lobbyGlobals.imageLoader.get("home")],
  );
  globals.elements.pauseArea.add(pauseLobbyButton);
  pauseLobbyButton.on("click tap", lobbyButtonClick);
}

function drawRestartArea() {
  const restartAreaValues = RESTART_DIALOG;

  globals.elements.restartArea = new Konva.Group({
    x: ((1 - restartAreaValues.w) / 2) * winW,
    y: ((1 - restartAreaValues.h) / 2) * winH,
    visible: false,
  });
  globals.layers.UI2.add(globals.elements.restartArea);

  const restartRect = new Konva.Rect({
    width: restartAreaValues.w * winW,
    height: restartAreaValues.h * winH,
    fill: getCanvasColors().surfaceArea,
    cornerRadius: DIALOG_CORNER_RADIUS * winH,
    listening: true,
  });
  globals.elements.restartArea.add(restartRect);

  const restartContents = new Konva.Group();
  globals.elements.restartContents = restartContents;
  globals.elements.restartArea.add(restartContents);

  const restartTitle = new Konva.Text({
    y: DIALOG.TITLE_Y * winH,
    width: restartAreaValues.w * winW,
    fontFamily: FONT_FAMILY,
    fontSize: DIALOG.TITLE_FONT_SIZE * winH,
    text: "Restart?",
    align: "center",
    fill: "white",
    ...TEXT_SHADOW,
    listening: false,
  });
  restartContents.add(restartTitle);

  // Lists the players who will not play again. (Filled in by the replay view.)
  const restartText = new Konva.Text({
    y: RESTART_DIALOG.declinedY * winH,
    width: restartAreaValues.w * winW,
    fontFamily: FONT_FAMILY,
    fontSize: RESTART_DIALOG.declinedFontSize * winH,
    align: "center",
    fill: "white",
    ...TEXT_SHADOW,
    listening: false,
  });
  restartContents.add(restartText);
  globals.elements.restartText = restartText;

  const buttonW = restartAreaValues.w * RESTART_DIALOG.buttonW;
  const { buttonY } = RESTART_DIALOG;
  const spacing = restartAreaValues.w * DIALOG.BUTTON_SPACING;
  const { cancelButtonGapY } = RESTART_DIALOG;

  const restartGameButton = new Button({
    x: spacing * winW,
    y: buttonY * winH,
    width: buttonW * winW,
    height: DIALOG.BUTTON_H * winH,
    text: "Restart game",
  });
  restartGameButton.on("click tap", () => {
    restart.request(true);
  });
  restartContents.add(restartGameButton);
  globals.elements.restartGameButton = restartGameButton;

  const restartTableButton = new Button({
    x: (2 * spacing + buttonW) * winW,
    y: buttonY * winH,
    width: buttonW * winW,
    height: DIALOG.BUTTON_H * winH,
    text: "Remake table",
  });
  restartTableButton.on("click tap", () => {
    restart.request(false);
  });
  restartContents.add(restartTableButton);
  globals.elements.restartTableButton = restartTableButton;

  const restartCancelButton = new Button({
    x: (restartAreaValues.w - buttonW / 2 - spacing) * winW,
    y: (buttonY + DIALOG.BUTTON_H + cancelButtonGapY) * winH,
    width: (buttonW / 2) * winW,
    height: DIALOG.BUTTON_H * winH,
    text: "Cancel",
  });
  restartCancelButton.on("click tap", () => {
    globals.elements.restartArea?.visible(false);
    globals.layers.UI2.batchDraw();
  });
  restartContents.add(restartCancelButton);

  const waitingOnServer = new Konva.Group({
    width: restartAreaValues.w * winW,
    height: restartAreaValues.h * winH,
    listening: false,
    visible: false,
  });
  globals.elements.restartArea.add(waitingOnServer);
  globals.elements.restartWaitingOnServer = waitingOnServer;
  globals.elements.restartWaitingOnServerAnimation =
    createWaitingOnServerAnimation(waitingOnServer, globals.layers.UI2);
  restart.setPending(gameSession.isRestartPending());
}

function drawTerminateMenu() {
  const { terminateButton } = globals.elements;
  if (terminateButton === undefined) {
    return;
  }

  const menu = new TerminateMenu(terminateButton, winW, winH);
  globals.layers.UI2.add(menu);
  globals.elements.terminateMenu = menu;
  terminateButton.on("click tap", () => {
    menu.open();
  });
  updateTerminationVotes();
}

function drawExtraAnimations() {
  // These images are shown to the player to indicate which direction we are moving in a shared
  // replay.
  const size = SHARED_REPLAY_DIRECTION_SIZE;
  const x = playAreaValues.x + (playAreaValues.w! - size) / 2;
  const y = playAreaValues.y + (playAreaValues.h! - size) / 2;

  globals.elements.sharedReplayForward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: lobbyGlobals.imageLoader.get("replay-forward-border"),
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.sharedReplayForward);

  globals.elements.sharedReplayBackward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: lobbyGlobals.imageLoader.get("replay-back-border"),
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.sharedReplayBackward);
}

// Subroutines
function lobbyButtonClick(this: Button) {
  // Unregister the click handler to ensure that the user does not double-click and go to the lobby
  // twice.
  this.off("click tap");

  backToLobby();
}
