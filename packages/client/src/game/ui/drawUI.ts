// This function draws the UI when going into a game for the first time.

import { ReplayArrowOrder } from "@hanabi-live/data";
import type {
  CardOrder,
  PlayerIndex,
  RankClueNumber,
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
import * as modals from "../../modals";
import { getCanvasColors } from "../../theme";
import { getHTMLElement } from "../../utils";
import { ButtonGroup } from "./ButtonGroup";
import { CardLayout } from "./CardLayout";
import { ClueLog } from "./ClueLog";
import { ColorButton } from "./ColorButton";
import { Deck } from "./Deck";
import { Elements } from "./Elements";
import { FullActionLog } from "./FullActionLog";
import { HanabiCard } from "./HanabiCard";
import { MultiFitText } from "./MultiFitText";
import { PlayStack } from "./PlayStack";
import { RankButton } from "./RankButton";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { backToLobby } from "./backToLobby";
import * as clues from "./clues";
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
  STRIKE_ARROW_ORDERS,
  STROKE_WIDTH_UNIT,
  TEXT_SHADOW,
  WARNING_COLOR,
} from "./constants";
import { Arrow } from "./controls/Arrow";
import { Button } from "./controls/Button";
import { CheckButton } from "./controls/CheckButton";
import { CurrentPlayerArea } from "./controls/CurrentPlayerArea";
import { FitText } from "./controls/FitText";
import { ImageWithTooltip } from "./controls/ImageWithTooltip";
import { PlayerButton } from "./controls/PlayerButton";
import { RectWithTooltip } from "./controls/RectWithTooltip";
import { SlidableGroup } from "./controls/SlidableGroup";
import { StrikeSquare } from "./controls/StrikeSquare";
import { StrikeX } from "./controls/StrikeX";
import type { TextWithTooltip } from "./controls/TextWithTooltip";
import { TimerDisplay } from "./controls/TimerDisplay";
import * as cursor from "./cursor";
import { drawHands } from "./drawHands";
import { drawReplayArea } from "./drawReplayArea";
import { getCardOrStackBase } from "./getCardOrStackBase";
import * as hypothetical from "./hypothetical";
import { initKonvaTooltips } from "./konvaTooltips";
import * as replay from "./replay";
import * as restart from "./restart";
import * as stats from "./stats";
import * as timer from "./timer";
import { toggleZen } from "./zen";

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
let clueLogValues: Values;
let giveClueValues: Values;
let spectatorsLabelValues: Values;

const leaderPlaceholder = getHTMLElement("#leader-placeholder");

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

/** The number of recent actions shown in the action log. */
const ACTION_LOG_LINES = 8;

/** The number of recent actions shown in the smaller action log of the Keldon layout. */
const KELDON_ACTION_LOG_LINES = 3;

/** Pink, for the minimum efficiency of a "Hard" variant when hyphenated conventions are enabled. */
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
} as const;

/** The top of the crown of a shared replay, relative to the top of the spectators' eyes. */
const CROWN_TOP_Y = -0.067;

/**
 * The center of the "Your Turn" indicator, relative to the top-left corner of the spectators
 * column, in fractions of the stage.
 */
const YOUR_TURN_CENTER = { x: 0.0695, y: 0.026 } as const;

/**
 * Where the middle of the ring around a timer (which shows that a pause is queued) is, relative to
 * the timer's top-left corner, in fractions of the stage.
 */
const TIMER_PAUSE_RING_CENTER = {
  x: 0.0328,
  y: 0.034,
} as const;

/** The left edge of a strike square, in fractions of the stage width. */
function strikeSquareX(strikeIndex: number): number {
  return STRIKE_SQUARE.x + STRIKE_SQUARE.spacing * strikeIndex;
}

export function drawUI(): void {
  globals.elements.restartWaitingOnServerAnimation?.stop();

  // Constants
  winW = globals.stage.width();
  winH = globals.stage.height();

  const layersBeforeDestroy = globals.stage
    .getLayers()
    .toArray() as Konva.Layer[];

  // Just in case, destroy all existing layers on the stage.
  for (const layer of layersBeforeDestroy) {
    layer.destroy();
  }

  // Clear children from the cached layers.
  for (const layer of Object.values(globals.layers) as Konva.Layer[]) {
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
  drawClueLog();
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
}

export function setSkullEnabled(): void {
  globals.elements.terminateButton?.setImage(
    globals.imageLoader!.get("skull_vtk"),
  );
}

export function setSkullNormal(): void {
  globals.elements.terminateButton?.setImage(globals.imageLoader!.get("skull"));
}

function drawBackground() {
  // Draw a green background behind everything.
  const background = new Konva.Image({
    x: 0,
    y: 0,
    width: winW,
    height: winH,
    image: globals.imageLoader!.get("background"),
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
    x: 0.01 * winW,
    y: 0.01 * winH,
    width: 0.11 * winW,
    height: 0.03 * winH,
    fontSize: 0.026 * winH,
    fontFamily: FONT_FAMILY,
    align: "left",
    text: "Placeholder text",
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
    listening: false,
  });
  basicNumberLabel = basicTextLabel.clone() as Konva.Text;
  basicNumberLabel.text("0");
  basicNumberLabel.width(0.03 * winW);
}

function drawActionLog() {
  actionLogValues = globals.lobby.settings.keldonMode
    ? {
        x: 0.2,
        y: 0.235,
        w: 0.4,
        h: 0.098,
      }
    : BGA_ACTION_LOG;

  const actionLogGroup = new Konva.Group({
    x: actionLogValues.x * winW,
    y: actionLogValues.y * winH,
    listening: false,
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
  const maxLines = globals.lobby.settings.keldonMode
    ? KELDON_ACTION_LOG_LINES
    : ACTION_LOG_LINES;
  globals.elements.actionLog = new MultiFitText(
    {
      align: "center",
      fontSize: 0.028 * winH,
      fontFamily: FONT_FAMILY,
      fill: LABEL_COLOR,
      ...TEXT_SHADOW,
      x: 0.01 * winW,
      y: 0.003 * winH,
      width: (actionLogValues.w! - 0.02) * winW,
      height: (actionLogValues.h! - 0.003) * winH,
      listening: false,
    },
    maxLines,
  );
  actionLogGroup.add(globals.elements.actionLog as unknown as Konva.Group);

  // The full action log (that appears when you click on the action log).
  globals.elements.fullActionLog = new FullActionLog(winW, winH);
  globals.layers.UI2.add(
    globals.elements.fullActionLog as unknown as Konva.Group,
  );
}

interface PlayStackValues {
  x: number;
  y: number;
  w: number;
  spacing: number;
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
    yOffset = 0.019;
  } else {
    cardWidth = FULL_CARD_STAGE_SIZE.W;
    cardHeight = FULL_CARD_STAGE_SIZE.H;
    yOffset = 0;
  }
  const playStackValues: PlayStackValues = {
    x: 0.183,
    y: 0.345 + yOffset,
    w: 0, // Is set below
    spacing: 0.015,
  };
  if (globals.variant.showSuitNames) {
    playStackValues.y -= 0.018;
  }

  // In BGA mode, a full row of stacks spreads out to the width of the action log.
  const fillsActionLogWidth =
    !globals.lobby.settings.keldonMode && numSuits >= fullSizeStackSlots;
  if (!globals.lobby.settings.keldonMode) {
    playStackValues.x = actionLogValues.x;
    playStackValues.y = actionLogValues.y + actionLogValues.h! + 0.02;
    if (fillsActionLogWidth) {
      playStackValues.spacing = actionLogValues.w!;
      playStackValues.spacing -= cardWidth * numSuits;
      playStackValues.spacing /= numSuits - 1;
    } else {
      playStackValues.spacing = 0.006;
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
      listening: false,
    });
    globals.elements.playStacks.set("hole", playStack);
    globals.layers.card.add(playStack as unknown as Konva.Group);
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
      listening: false,
    });
    globals.elements.playStacks.set(suit, playStack);
    globals.layers.card.add(playStack as unknown as Konva.Group);

    // Add the stack base to the play stack.
    const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
    const order = (totalCardsInDeck + i) as CardOrder;
    // Stack bases use card orders after the final card in the deck.
    const stackBase = new HanabiCard(
      order,
      suitIndex,
      null,
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
        globals.lobby.settings.colorblindMode
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
  const overlap = 0.03;
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
    globals.variant.suits.length === MAX_SUITS ? 0.038 : 0.047;

  for (const [suitIndex, suit] of globals.variant.suits.entries()) {
    // Make the discard stack for this suit.
    const discardStack = new CardLayout({
      x: (DISCARD_AREA.x + DISCARD_STACK_INSET) * winW,
      y:
        (DISCARD_AREA.y + DISCARD_STACK_INSET + discardStackSpacing * suitIndex)
        * winH,
      width: (DISCARD_AREA.w - DISCARD_STACK_INSET * 2) * winW,
      height: 0.15 * winH,
      listening: false,
    });
    globals.elements.discardStacks.set(suit, discardStack);
    globals.layers.card.add(discardStack as unknown as Konva.Group);
  }
}

function drawBottomLeftButtons() {
  bottomLeftButtonValues = {
    x: STAGE_MARGIN,
    y: 0.8,
    w: 0.07,
    h: 0.0563,
  };

  // The toggle in-game replay button.
  const replayButton = new Button(
    {
      x: bottomLeftButtonValues.x * winW,
      y: bottomLeftButtonValues.y * winH,
      width: bottomLeftButtonValues.w! * winW,
      height: bottomLeftButtonValues.h! * winH,
      visible: !globals.state.finished,
    },
    [globals.imageLoader!.get("replay")],
  );
  replayButton.on("click tap", () => {
    if (globals.state.replay.active) {
      replay.exit();
    } else {
      replay.enter();
    }
  });
  globals.layers.UI.add(replayButton as unknown as Konva.Group);
  replayButton.tooltipName = "replay";
  replayButton.tooltipContent =
    "Toggle the in-game replay, where you can rewind the game to see what happened on a specific turn.";
  initKonvaTooltips(replayButton, true, false);
  globals.elements.replayButton = replayButton;

  // The restart button (to bring up the restart menu).
  const restartButton = new Button({
    x: bottomLeftButtonValues.x * winW,
    y: bottomLeftButtonValues.y * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: bottomLeftButtonValues.h! * winH,
    text: "Restart",
    visible: false,
  });
  globals.layers.UI.add(restartButton as unknown as Konva.Group);
  restartButton.on("click tap", () => {
    if (globals.options.speedrun) {
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

  // The chat button.
  const chatButton = new Button({
    x: bottomLeftButtonValues.x * winW,
    y:
      (bottomLeftButtonValues.y + bottomLeftButtonValues.h! + BOTTOM_LEFT_GAP)
      * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: bottomLeftButtonValues.h! * winH,
    // eslint-disable-next-line complete/require-ascii
    text: "💬",
    visible: !globals.state.finished || globals.state.replay.shared !== null,
  });
  globals.layers.UI.add(chatButton as unknown as Konva.Group);
  chatButton.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (event.evt.button === RIGHT_MOUSE_BUTTON) {
      toggleZen();
    } else {
      globals.game!.chat.toggle();
    }
  });
  chatButton.tooltipName = "chat";
  chatButton.tooltipContent = "Toggle the in-game chat.";
  initKonvaTooltips(chatButton, true, false);
  globals.elements.chatButton = chatButton;

  // The lobby button (which takes the user back to the lobby).
  const lobbyButtonValues = {
    x: bottomLeftButtonValues.x,
    y:
      bottomLeftButtonValues.y
      + 2 * (bottomLeftButtonValues.h! + BOTTOM_LEFT_GAP),
    h: bottomLeftButtonValues.h,
  };
  const lobbyButton = new Button({
    x: lobbyButtonValues.x * winW,
    y: lobbyButtonValues.y * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: lobbyButtonValues.h! * winH,
    text: "Lobby",
  });
  globals.layers.UI.add(lobbyButton as unknown as Konva.Group);
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
  globals.elements.gameIDLabel = new FitText({
    text: `ID: ${globals.state.replay.databaseID ?? 0}`,
    x: deckValues.x * winW,
    y: (deckValues.y + 0.01) * winH,
    width: deckValues.w! * winW,
    fontFamily: FONT_FAMILY,
    fill: "white",
    align: "center",
    fontSize: 0.019 * winH,
    ...TEXT_SHADOW,
    visible: globals.state.finished && globals.state.replay.databaseID !== null,
    listening: false,
  });
  // We draw the label on the arrow layer because it is on top of the card but not on top of the
  // black second layer.
  globals.layers.arrow.add(globals.elements.gameIDLabel);

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
    image: globals.imageLoader!.get("question-mark"),
    ...TEXT_SHADOW,
    shadowBlur: 2,
  });
  // This goes on the same layer as the gameIDLabel.
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
  globals.layers.card.add(globals.elements.deck as unknown as Konva.Group);

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
  const xOffset = 0.017;
  const fontSize = 0.025;
  globals.elements.deckTurnsRemainingLabel1 = basicTextLabel.clone({
    text: "Turns",
    x: (deckValues.x + xOffset) * winW,
    y: (deckValues.y + deckValues.h! - 0.07) * winH,
    fontSize: fontSize * winH,
    visible: false,
  }) as Konva.Text;
  globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel1);
  globals.elements.deckTurnsRemainingLabel2 = basicTextLabel.clone({
    text: "left: #",
    x: (deckValues.x + xOffset) * winW,
    y: (deckValues.y + deckValues.h! - 0.04) * winH,
    fontSize: fontSize * winH,
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
    strokeWidth: 10 * STROKE_WIDTH_UNIT * winH,
    visible: false,
  });
  globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);
}

function drawScoreArea() {
  // The rectangle that holds the turn, score, and clue count.
  const scoreAreaHeight = 0.18;
  scoreAreaValues = {
    x: 0.66,
    y: deckValues.y + (deckValues.h! - scoreAreaHeight) / 2,
    w: 0.13,
    h: scoreAreaHeight,
  };
  if (!globals.lobby.settings.keldonMode) {
    scoreAreaValues.x = deckValues.x + deckValues.w! + BOTTOM_LEFT_GAP;
    scoreAreaValues.y = 0.81;
  }
  globals.elements.scoreArea = new Konva.Group({
    x: scoreAreaValues.x * winW,
    y: scoreAreaValues.y * winH,
    listening: false,
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

  const labelX = 0.02;
  const labelSpacing = 0.06;

  /** The heights of the rows of labels, as fractions of the stage height. */
  const labelRowY = {
    turn: 0.01,
    score: 0.045,
    clues: 0.08,
  } as const;

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
      arrows.click(event, ReplayArrowOrder.Turn);
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
        arrows.click(event, ReplayArrowOrder.Turn);
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
      arrows.click(event, ReplayArrowOrder.Score);
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
      arrows.click(event, ReplayArrowOrder.Score);
    },
  );

  globals.elements.maxScoreNumberLabel = basicNumberLabel.clone({
    text: "",
    x: (labelX + labelSpacing) * winW,
    y: (labelRowY.score + 0.005) * winH,
    fontSize: 0.017 * winH,
    listening: true,
    visible:
      !globals.variant.throwItInAHole
      || (!globals.state.playing && !globals.state.shadowing),
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.maxScoreNumberLabel);
  globals.elements.maxScoreNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.MaxScore);
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
        arrows.click(event, ReplayArrowOrder.Clues);
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
        arrows.click(event, ReplayArrowOrder.Clues);
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
      arrows.click(event, ReplayArrowOrder.Clues);
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
      arrows.click(event, ReplayArrowOrder.Clues);
    },
  );

  // Add an animation to signify that discarding at 8 clues is illegal.
  if (!globals.isResizing) {
    globals.elements.cluesNumberLabelPulse = new Konva.Tween({
      node: cluesNumberLabel,
      fontSize: 0.04 * winH,
      fill: WARNING_COLOR,
      offsetX: 0.001 * winH,
      offsetY: 0.01 * winH,
      duration: CARD_ANIMATION_LENGTH_SECONDS,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (globals.elements.cluesNumberLabelPulse !== null) {
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
          arrows.toggle(card.state.order, true);
        }

        break;
      }

      case RIGHT_MOUSE_BUTTON: {
        // Right-clicking a strike X or a strike square shows an arrow over the strike square.
        arrows.click(event, STRIKE_ARROW_ORDERS[this.num]);

        break;
      }

      default: {
        break;
      }
    }
  }

  for (const i of tupleKeys(STRIKE_ARROW_ORDERS)) {
    // Draw the background square.
    const strikeSquare = new StrikeSquare(
      {
        x: strikeSquareX(i) * winW,
        y: STRIKE_SQUARE.y * winH,
        width: STRIKE_SQUARE.w * winW,
        height: STRIKE_SQUARE.h * winH,
        stroke: "black",
        strokeWidth: 2 * STROKE_WIDTH_UNIT * winH,
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
        image: globals.imageLoader!.get("x"),
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
      [globals.imageLoader!.get("skull")],
    );
    globals.elements.scoreArea.add(terminateButton as unknown as Konva.Group);
    function voteForTermination() {
      globals.lobby.conn!.send("tableVoteForTermination", {
        tableID: globals.lobby.tableID,
      });
    }
    terminateButton.on("click", (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (event.evt.button === LEFT_MOUSE_BUTTON) {
        voteForTermination();
      } else if (event.evt.button === RIGHT_MOUSE_BUTTON) {
        globals.lobby.conn!.send("tableTerminate", {
          tableID: globals.lobby.tableID,
        });
      }
    });
    // Touch events have no mouse button, so a tap always votes.
    terminateButton.on("tap", voteForTermination);
    terminateButton.tooltipName = "kill";
    terminateButton.tooltipContent = `
      <strong>Left click</strong> or <strong>tap</strong> to cast a vote to terminate the game (again to cancel the vote).<br />
      <strong>Right click</strong> to terminate immediately.
    `;
    initKonvaTooltips(terminateButton, true, false);
    globals.elements.terminateButton = terminateButton;
  }
}

// The "eyes" symbol to show that one or more people are spectating the game.
function drawSpectators() {
  // Position it to the bottom-left of the score area.
  spectatorsLabelValues = {
    x: scoreAreaValues.x - 0.037,
    y: scoreAreaValues.y + 0.09,
  };
  if (!globals.lobby.settings.keldonMode) {
    // Position it to the bottom-right of the score area.
    spectatorsLabelValues.x =
      scoreAreaValues.x + scoreAreaValues.w! + BOTTOM_LEFT_GAP;
  }
  const imageSize = 0.02;
  const spectatorsLabel = new ImageWithTooltip({
    // Center the eyes over the number of spectators.
    x: (spectatorsLabelValues.x + (SPECTATORS_COLUMN.W - imageSize) / 2) * winW,
    y: spectatorsLabelValues.y * winH,
    width: imageSize * winW,
    height: imageSize * winW,
    // (This is not a typo; we want it to have the same width and height.)
    align: "center",
    image: globals.imageLoader!.get("eyes"),
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
  const size = 0.025 * winW;
  const crownCenter = {
    x: (spectatorsLabelValues.x + SPECTATORS_COLUMN.W / 2) * winW,
    y: (spectatorsLabelValues.y + CROWN_TOP_Y) * winH + size / 2,
  };

  // A circle around the crown indicates that we are the current replay leader. (We want the icon to
  // be on top of this so that it does not interfere with mouse events.)
  globals.elements.sharedReplayLeaderCircle = new Konva.Circle({
    ...crownCenter,
    radius: 0.028 * winH,
    stroke: ACTIVE_INDICATOR_COLOR,
    strokeWidth: 2 * STROKE_WIDTH_UNIT * winH,
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
    image: globals.imageLoader!.get("crown"),
    ...TEXT_SHADOW,
    visible: false,
    listening: true,
  });
  globals.layers.UI.add(sharedReplayLeaderLabel);
  globals.elements.sharedReplayLeaderLabel = sharedReplayLeaderLabel;

  // Add an animation to alert everyone when shared replay leadership has been transferred.
  if (!globals.isResizing) {
    globals.elements.sharedReplayLeaderLabelPulse = new Konva.Tween({
      node: sharedReplayLeaderLabel,
      // Grow from the center of the crown.
      width: size * 2,
      height: size * 2,
      offsetX: size / 2,
      offsetY: size / 2,
      duration: CARD_ANIMATION_LENGTH_SECONDS,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        if (globals.elements.sharedReplayLeaderLabelPulse !== null) {
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
  sharedReplayLeaderLabel.on("click dbltap", () => {
    if (globals.state.replay.shared === null) {
      return;
    }

    if (globals.state.spectators.length === 1) {
      modals.showWarning(
        "You are the only person in the shared replay, so you cannot pass the leader to someone else.",
      );
      return;
    }

    leaderPlaceholder.replaceChildren();

    for (const spectator of globals.state.spectators) {
      if (spectator.name === globals.state.replay.shared.leader) {
        continue;
      }

      const button = document.createElement("button");

      button.textContent = spectator.name;
      button.classList.add("button");
      button.dataset["player"] = spectator.name;
      button.addEventListener("click", (event) => {
        const element = event.target as HTMLElement;
        setLeader(element.dataset["player"]);
      });
      button.type = "submit";

      leaderPlaceholder.append(button);
    }

    modals.showPrompt("#set-leader-modal");
  });
}

function setLeader(player: string | null | undefined) {
  modals.closeModals();

  if (player === null || player === undefined) {
    return;
  }

  globals.lobby.conn!.send("tableSetLeader", {
    tableID: globals.lobby.tableID,
    name: player,
  });
}

// A notification that shows it is your turn.
function drawYourTurn() {
  if (globals.lobby.settings.keldonMode) {
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
    radiusX: 0.039 * winW,
    radiusY: 0.05 * winH,
    ...INDICATOR_ELLIPSE_STYLE,
    strokeWidth: INDICATOR_ELLIPSE_STROKE_WIDTH * winH,
    listening: false,
  });
  globals.elements.yourTurn.add(circle);

  const text = new Konva.Text({
    fontSize: 0.034 * winH,
    fontFamily: FONT_FAMILY,
    fill: CURRENT_TURN_COLOR,
    align: "center",
    text: "Your\nTurn",
    listening: false,
  });
  text.offset({ x: text.width() / 2, y: text.height() / 2 });
  globals.elements.yourTurn.add(text);
}

function drawClueLog() {
  clueLogValues = CLUE_LOG;
  const clueLogRect = new Konva.Rect({
    x: clueLogValues.x * winW,
    y: clueLogValues.y * winH,
    width: clueLogValues.w! * winW,
    height: clueLogValues.h! * winH,
    fill: "black",
    opacity: PANEL_OPACITY,
    cornerRadius: PANEL_CORNER_RADIUS * winW,
    listening: false,
  });
  globals.layers.UI.add(clueLogRect);

  const spacing = 0.01;
  globals.elements.clueLog = new ClueLog({
    x: (clueLogValues.x + spacing) * winW,
    y: (clueLogValues.y + spacing) * winH,
    width: (clueLogValues.w! - spacing * 2) * winW,
    height: (clueLogValues.h! - spacing * 2) * winH,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.clueLog as unknown as Konva.Group);
}

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log).
function drawStatistics() {
  // The statistics are a grid of labels with their numbers beside them.
  const labelX = (STATISTICS_PANEL.x + STATISTICS_LABEL_INSET_X) * winW;
  const numberX = (STATISTICS_PANEL.x + 0.1) * winW;
  const paceY = (STATISTICS_PANEL.y + 0.04) * winH;
  const efficiencyY = (STATISTICS_PANEL.y + 0.06) * winH;
  const fontSize = 0.02 * winH;

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
    y: (STATISTICS_PANEL.y + 0.01) * winH,
    width: 0.15 * winW,
    height: 0.03 * winH,
    fontSize,
    fontFamily: FONT_FAMILY,
    fill: LABEL_COLOR,
    ...TEXT_SHADOW,
    align: "center",
    listening: false,
  });
  globals.layers.UI.add(variantLabel);
  globals.elements.variantLabel = variantLabel;

  const underlineY = (STATISTICS_PANEL.y + 0.03) * winH;
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
    arrows.click(event, ReplayArrowOrder.Pace);
  });
  paceNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Pace);
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
      arrows.click(event, ReplayArrowOrder.Efficiency);
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
  // The tooltip will be filled in later in the "statsView.onEfficiencyChanged()" function.

  const efficiencyPipeLabel = basicNumberLabel.clone({
    text: " | ",
    x: numberX + 0.005 * winW,
    y: efficiencyY,
    fontSize,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyPipeLabel);
  globals.elements.efficiencyPipeLabel = efficiencyPipeLabel;

  const efficiencyMinNeededLabel = basicNumberLabel.clone({
    text: globals.metadata.minEfficiency.toFixed(EFFICIENCY_DECIMAL_PLACES),
    x: numberX + 0.018 * winW,
    y: efficiencyY,
    fontSize,
    // - "Easy" variants use the default color (off-white).
    // - "Hard" variants use pink.
    fill:
      globals.metadata.hardVariant
      && globals.lobby.settings.hyphenatedConventions
        ? HARD_VARIANT_EFFICIENCY_COLOR
        : LABEL_COLOR,
    // If colorblindMode is activated, indicate make font bold if "Hard".
    fontStyle:
      globals.metadata.hardVariant
      && globals.lobby.settings.hyphenatedConventions
      && globals.lobby.settings.colorblindMode
        ? "bold"
        : "normal",
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyMinNeededLabel);
  efficiencyMinNeededLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.MinEfficiency);
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
    image: globals.imageLoader!.get("trashcan"),
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
    const arrow = new Arrow(winW, winH, globals.lobby.settings.colorblindMode);
    globals.layers.arrow.add(arrow as unknown as Konva.Group);
    globals.elements.arrows.push(arrow);
  });
}

function drawTimers() {
  // Just in case, stop the previous timer, if any.
  timer.stop();

  // We do not want the timer to show in replays or untimed games (unless they have the optional
  // setting turned on).
  if (
    globals.state.finished
    || (!globals.options.timed && !globals.lobby.settings.showTimerInUntimed)
  ) {
    return;
  }

  // In the Keldon layout, the two timers sit in a row.
  const keldonTimerY = 0.645;
  const timerValues = {
    x1: 0.145,
    x2: 0.595,
    y1: keldonTimerY,
    y2: keldonTimerY,
    w: 0.065,
    h: 0.051,
    fontSize: 0.03,
    cornerRadius: 0.05,
    spaceH: 0.01,
  };
  if (!globals.lobby.settings.keldonMode) {
    timerValues.x1 = 0.352;
    timerValues.x2 = timerValues.x1;
    timerValues.y1 = 0.77;
    timerValues.y2 = 0.885;
  }

  // A circle around the timer indicates that we have queued a pause. (We want the timer to be on
  // top of this so that it does not interfere with mouse events.)
  globals.elements.timer1Circle = new Konva.Ellipse({
    x: (timerValues.x1 + TIMER_PAUSE_RING_CENTER.x) * winW,
    y: (timerValues.y1 + TIMER_PAUSE_RING_CENTER.y) * winH,
    radiusX: 0.05 * winW,
    radiusY: 0.07 * winH,
    stroke: ACTIVE_INDICATOR_COLOR,
    strokeWidth: 2 * STROKE_WIDTH_UNIT * winH,
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
  globals.layers.timer.add(globals.elements.timer1 as unknown as Konva.Group);

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
    labelFontSize: 0.02 * winH,
    cornerRadius: timerValues.cornerRadius * winH,
    spaceH: timerValues.spaceH * winH,
    visible: false,
    listening: true,
  });
  globals.layers.timer.add(globals.elements.timer2 as unknown as Konva.Group);
  if (globals.options.timed || globals.lobby.settings.showTimerInUntimed) {
    globals.elements.timer2.tooltipName = "time-taken";
    // (The content will be updated in the "setTickingDownTimeCPTooltip()" function.)
    initKonvaTooltips(globals.elements.timer2, true, false);
  }
}

function timerClick() {
  if (
    !globals.options.timed // We do not need to pause if this is not a timed game.
    || globals.state.pause.active // We do not need to pause if the game is already paused.
  ) {
    return;
  }

  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;

  let setting: "pause" | "pause-queue" | "pause-unqueue";
  if (currentPlayerIndex === ourPlayerIndex) {
    setting = "pause";
  } else if (globals.state.pause.queued) {
    setting = "pause-unqueue";

    globals.store!.dispatch({
      type: "pauseQueue",
      queued: false,
    });
  } else {
    setting = "pause-queue";

    globals.store!.dispatch({
      type: "pauseQueue",
      queued: true,
    });
  }

  globals.lobby.conn!.send("pause", {
    tableID: globals.lobby.tableID,
    setting,
  });
}

function drawClueArea() {
  // Put the clue area directly below the play stacks, with a little bit of spacing.
  clueAreaValues = {
    x: actionLogValues.x,
    y: playAreaValues.y + playAreaValues.h! + 0.005,
    w: actionLogValues.w!,
    h: 0.23,
  };
  if (globals.variant.showSuitNames) {
    clueAreaValues.y += 0.03;
  }
  // In BGA mode, we can afford to put a bit more spacing to make it look less packed together.
  if (!globals.lobby.settings.keldonMode) {
    clueAreaValues.y += 0.02;
  }
  globals.elements.clueArea = new Konva.Group({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
    visible: false,
    listening: false,
  });

  // Player buttons
  const { numPlayers } = globals.options;
  const playerButtonH = globals.lobby.settings.keldonMode ? 0.025 : 0.035;
  const playerButtonSpacing = 0.0075;

  // If this is a two player game, we can slide the clue UI down by a bit (since the clue target
  // buttons won't be shown).
  const playerButtonAdjustment =
    numPlayers === MIN_PLAYERS ? playerButtonH / 2 : 0;

  // This is the normal button group, which does not include us.
  globals.elements.clueTargetButtonGroup = new ButtonGroup({
    listening: false,
  });
  {
    const totalPlayerButtons = numPlayers - 1;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (const i of eRange(totalPlayerButtons)) {
      const playerIndex = ((globals.metadata.ourPlayerIndex + i + 1)
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
      globals.elements.clueTargetButtonGroup.add(
        button as unknown as Konva.Group,
      );
      globals.elements.clueTargetButtonGroup.addList(button);
    }
  }
  globals.elements.clueArea.add(
    globals.elements.clueTargetButtonGroup as unknown as Konva.Group,
  );
  if (numPlayers === MIN_PLAYERS) {
    // The clue target buttons are pointless if we are playing a 2-player game (because we only have
    // the ability to clue one player).
    globals.elements.clueTargetButtonGroup.hide();
    // Default the clue recipient button to the only other player available.
    globals.elements.clueTargetButtonGroup.list[0]!.setPressed(true);
  }

  // This button group includes us, which is used for hypotheticals.
  globals.elements.clueTargetButtonGroup2 = new ButtonGroup({
    listening: false,
  });
  {
    const totalPlayerButtons = numPlayers;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (const i of eRange(totalPlayerButtons)) {
      // We change the calculation of `playerIndex` from the above code block because we want the
      // buttons to follow the order of players from top to bottom (in BGA mode).
      const playerIndex = ((globals.metadata.ourPlayerIndex + i)
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
      globals.elements.clueTargetButtonGroup2.add(
        button as unknown as Konva.Group,
      );
      globals.elements.clueTargetButtonGroup2.addList(button);
    }
  }
  globals.elements.clueArea.add(
    globals.elements.clueTargetButtonGroup2 as unknown as Konva.Group,
  );
  globals.elements.clueTargetButtonGroup2.hide();

  // Clue type buttons
  const buttonW = 0.04;
  const buttonH = 0.071;
  const buttonXSpacing = 0.009;
  const buttonYSpacing = 0.002;
  globals.elements.clueTypeButtonGroup = new ButtonGroup({
    listening: false,
  });

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
  globals.elements.clueArea.add(
    globals.elements.lowerClueArea as unknown as Konva.Group,
  );

  // Color buttons
  globals.elements.colorClueButtons = [];
  let totalColorWidth = buttonW * globals.variant.clueColors.length;
  totalColorWidth += buttonXSpacing * (globals.variant.clueColors.length - 1);
  const colorX = clueAreaValues.w! * 0.5 - totalColorWidth * 0.5;
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

    globals.elements.clueTypeButtonGroup.add(button as unknown as Konva.Group);
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.colorClueButtons.push(button);
  }

  // Rank buttons / number buttons.
  globals.elements.rankClueButtons = [];
  const numRanks = globals.variant.clueRanks.length;
  let totalRankWidth = buttonW * numRanks;
  totalRankWidth += buttonXSpacing * (numRanks - 1);
  const rankX = clueAreaValues.w! * 0.5 - totalRankWidth * 0.5;
  const rankY = colorY + buttonH + buttonYSpacing;
  for (const [i, rank] of globals.variant.clueRanks.entries()) {
    const button = new RankButton({
      x: (rankX + i * (buttonW + buttonXSpacing)) * winW,
      y: rankY * winH,
      width: buttonW * winW,
      height: buttonH * winH,
      label: rankTextFromVariant(rank),
      clue: newRankClue(rank),
    });

    globals.elements.clueTypeButtonGroup.add(button as unknown as Konva.Group);
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.rankClueButtons.push(button);
  }

  // Set button functionality
  globals.elements.clueTargetButtonGroup.on("change", clues.checkLegal);
  globals.elements.clueTargetButtonGroup2.on("change", clues.checkLegal);
  globals.elements.clueTypeButtonGroup.on("change", clues.checkLegal);

  globals.elements.lowerClueArea.add(
    globals.elements.clueTypeButtonGroup as unknown as Konva.Group,
  );

  // The "Give Clue" button.
  giveClueValues = {
    x: 0,
    y: rankY + buttonH + buttonYSpacing,
    w: 0.236,
    h: 0.051,
  };
  giveClueValues.x = clueAreaValues.w! * 0.5 - giveClueValues.w! * 0.5;

  globals.elements.giveClueButton = new Button({
    x: giveClueValues.x * winW,
    y: giveClueValues.y * winH,
    width: giveClueValues.w! * winW,
    height: giveClueValues.h! * winH,
    text: "Give Clue",
  });
  globals.elements.giveClueButton.setEnabled(false);
  globals.elements.lowerClueArea.add(
    globals.elements.giveClueButton as unknown as Konva.Group,
  );
  globals.elements.giveClueButton.on("click tap", clues.give);

  globals.layers.UI.add(globals.elements.clueArea);

  // The clue area is disabled when there are 0 clue tokens.
  drawClueAreaDisabled(offsetX);

  // The "waiting" animation that will display until the server acknowledges the player's action.
  drawClueAreaWaitingForServer();
}

function rankTextFromVariant(rank: RankClueNumber): string {
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
    listening: false,
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

  const spacing = {
    x: 0.075,
    y: 0.03,
  };
  const lineStyle = {
    stroke: "#1a1a1a",
    strokeWidth: 5 * STROKE_WIDTH_UNIT * winH,
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
    y: clueAreaValues.h! * 0.4 * winH,
    width: clueAreaValues.w! * winW,
    fontSize: 0.07 * winH,
    fontFamily: FONT_FAMILY,
    align: "center",
    text: "No clues",
    fill: LABEL_COLOR,
    stroke: "black",
    strokeWidth: 2 * STROKE_WIDTH_UNIT * winH,
    listening: false,
  });
  globals.elements.clueAreaDisabled.add(noCluesText);

  globals.elements.clueAreaDisabled.hide();
  globals.layers.UI.add(
    globals.elements.clueAreaDisabled as unknown as Konva.Group,
  );
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
    blueCircle.scale({ x: scale, y: scale });
    blueCircle.opacity(1 - scale);

    const redScale = ((frame.time + period / 2) % period) / period;
    redCircle.scale({ x: redScale, y: redScale });
    redCircle.opacity(1 - redScale);
  }, layer);
}

function drawCurrentPlayerArea() {
  // The "Current player: [player name]" box
  const currentPlayerAreaWidth = 0.3; // This is big enough to fit in between the two timers
  const currentPlayerAreaValues = {
    x: clueAreaValues.x + clueAreaValues.w! / 2 - currentPlayerAreaWidth / 2,
    y: clueAreaValues.y + 0.015,
    w: currentPlayerAreaWidth,
    h: 0.15,
    spacing: 0.006,
  };
  globals.elements.currentPlayerArea = new CurrentPlayerArea(
    currentPlayerAreaValues,
    winW,
    winH,
  );
  globals.layers.UI.add(
    globals.elements.currentPlayerArea as unknown as Konva.Group,
  );
}

function drawPreplayArea() {
  const w = 0.29;
  const h = 0.1;
  const x = clueAreaValues.x + clueAreaValues.w! / 2 - w / 2;
  const y = clueAreaValues.y + 0.05; // Near the top of the clue area, not centered in it.
  globals.elements.premoveCancelButton = new Button({
    x: x * winW,
    y: y * winH,
    width: w * winW,
    height: h * winH,
    text: "Cancel Pre-Move",
    visible: false,
  });
  globals.layers.UI.add(
    globals.elements.premoveCancelButton as unknown as Konva.Group,
  );
  globals.elements.premoveCancelButton.on("click tap", () => {
    globals.store!.dispatch({
      type: "premove",
      premove: null,
    });
  });
}

function drawHypotheticalArea() {
  const hypoValues = {
    x: actionLogValues.x,
    y: clueAreaValues.y + 0.06,
    w: actionLogValues.w,
    h: 0.05,
  };

  // The circle is centered on the text.
  const hypoTextY = hypoValues.h * 0.4;
  const hypoFontSize = 0.06;

  // The "Hypothetical" circle that shows we are currently in a hypothetical.
  globals.elements.hypoCircle = new Konva.Group({
    x: hypoValues.x * winW,
    y: hypoValues.y * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.hypoCircle);

  const circle = new Konva.Ellipse({
    x: hypoValues.w! * 0.5 * winW,
    y: (hypoTextY + hypoFontSize / 2) * winH,
    radiusX: hypoValues.w! * 0.4 * winW,
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

  globals.elements.hypoButtonsArea = new Konva.Group({
    visible: false,
  });

  globals.layers.UI.add(globals.elements.hypoButtonsArea);

  // The hypothetical buttons share the row of the give clue button.
  const hypoButtonHeight = giveClueValues.h!;
  const hypoButtonFontSize = 0.019;

  const hypoButtonWidth = 0.075;
  const hypoButtonSpacing = 0.008;

  // The "Back 1 Turn" button (to the right of the give clue button, after it slides left).
  const hypoBackButtonValues = {
    x:
      clueAreaValues.x
      + lowerClueAreaValues.x
      - lowerClueAreaSlideX
      + giveClueValues.x
      + giveClueValues.w!
      + hypoButtonSpacing,
    y: clueAreaValues.y + lowerClueAreaValues.y + giveClueValues.y,
    w: 0.035,
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
  globals.elements.hypoButtonsArea.add(
    globals.elements.hypoBackButton as unknown as Konva.Group,
  );

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
  globals.elements.hypoButtonsArea.add(
    endHypotheticalButton as unknown as Konva.Group,
  );
  endHypotheticalButton.on("click tap", () => {
    hypothetical.endHypothetical();
  });
  globals.elements.endHypotheticalButton = endHypotheticalButton;

  // The "Edit Cards" button (above the exit hypo button).
  const editCardsButtonValues = {
    x: endHypotheticalButtonValues.x,
    y: endHypotheticalButtonValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.editCardsButton = new CheckButton({
    x: editCardsButtonValues.x * winW,
    y: editCardsButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Edit Cards",
    fontSize: hypoButtonFontSize * winH,
  });

  globals.elements.editCardsButton.tooltipName = "hypo-edit-cards";
  globals.elements.editCardsButton.tooltipContent =
    "Turn this on and then click on cards to change them into other cards.";
  initKonvaTooltips(globals.elements.editCardsButton, true, false);

  globals.elements.editCardsButton.on("click tap", () => {
    globals.elements.editCardsButton?.setPressed(
      !globals.elements.editCardsButton.pressed,
    );
  });
  globals.elements.hypoButtonsArea.add(
    globals.elements.editCardsButton as unknown as Konva.Group,
  );

  // The "Show Drawn Cards" / "Hide Drawn Cards" button (above the edit cards button).
  const toggleDrawnCardsButtonValues = {
    x: editCardsButtonValues.x,
    y: editCardsButtonValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.toggleDrawnCardsButton = new CheckButton({
    x: toggleDrawnCardsButtonValues.x * winW,
    y: toggleDrawnCardsButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Show Hidden",
    fontSize: 0.016 * winH,
  });
  globals.elements.toggleDrawnCardsButton.tooltipName = "hypo-show-drawn";
  globals.elements.toggleDrawnCardsButton.tooltipContent =
    "Show the front faces of cards drawn during the hypothetical.";
  initKonvaTooltips(globals.elements.toggleDrawnCardsButton, true, false);

  globals.elements.toggleDrawnCardsButton.on(
    "click tap",
    hypothetical.toggleRevealed,
  );
  globals.elements.hypoButtonsArea.add(
    globals.elements.toggleDrawnCardsButton as unknown as Konva.Group,
  );
}

function drawPauseArea() {
  const pauseAreaValues = {
    w: 0.5,
    h: 0.5,
  };

  globals.elements.pauseArea = new Konva.Group({
    x: ((1 - pauseAreaValues.w) / 2) * winW,
    y: ((1 - pauseAreaValues.h) / 2) * winH,
    visible: false,
    listening: false,
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
    y: 0.21 * winH,
    width: pauseAreaValues.w * winW,
    fontFamily: FONT_FAMILY,
    fontSize: 0.05 * winH,
    text: "by: [username]",
    align: "center",
    fill: "white",
    ...TEXT_SHADOW,
    listening: false,
  });
  globals.elements.pauseArea.add(globals.elements.pauseText);

  const button1W = pauseAreaValues.w * 0.4;
  const button2W = pauseAreaValues.w * 0.125;
  /** The top of the row of buttons, in fractions of the stage height. */
  const buttonY = 0.33;
  const spacing = pauseAreaValues.w * DIALOG.BUTTON_SPACING;

  globals.elements.pauseButton = new Button({
    x: spacing * winW,
    y: buttonY * winH,
    width: button1W * winW,
    height: DIALOG.BUTTON_H * winH,
    text: "Unpause",
  });
  globals.elements.pauseButton.on("click tap", () => {
    globals.lobby.conn!.send("pause", {
      tableID: globals.lobby.tableID,
      setting: "unpause",
    });
  });
  globals.elements.pauseArea.add(
    globals.elements.pauseButton as unknown as Konva.Group,
  );

  const chatButton = new Button({
    x: (pauseAreaValues.w - button2W * 2 - spacing * 2) * winW,
    y: buttonY * winH,
    width: button2W * winW,
    height: DIALOG.BUTTON_H * winH,
    // eslint-disable-next-line complete/require-ascii
    text: "💬",
  });
  globals.elements.pauseArea.add(chatButton as unknown as Konva.Group);
  chatButton.on("click tap", () => {
    globals.game!.chat.toggle();
  });

  const pauseLobbyButton = new Button(
    {
      x: (pauseAreaValues.w - button2W - spacing * 1.5) * winW,
      y: buttonY * winH,
      width: button2W * winW,
      height: DIALOG.BUTTON_H * winH,
    },
    [globals.imageLoader!.get("home")],
  );
  globals.elements.pauseArea.add(pauseLobbyButton as unknown as Konva.Group);
  pauseLobbyButton.on("click tap", lobbyButtonClick);
}

function drawRestartArea() {
  const restartAreaValues = {
    w: 0.7,
    h: 0.6,
  };

  globals.elements.restartArea = new Konva.Group({
    x: ((1 - restartAreaValues.w) / 2) * winW,
    y: ((1 - restartAreaValues.h) / 2) * winH,
    visible: false,
    listening: false,
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

  const buttonW = restartAreaValues.w * 0.35;
  /** The top of the row of buttons, in fractions of the stage height. */
  const buttonY = 0.25;
  const spacing = restartAreaValues.w * DIALOG.BUTTON_SPACING;
  /** The gap above the "Cancel" button, in fractions of the stage height. */
  const cancelButtonGapY = 0.095;

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
  restartContents.add(restartGameButton as unknown as Konva.Group);

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
  restartContents.add(restartTableButton as unknown as Konva.Group);

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
  restartContents.add(restartCancelButton as unknown as Konva.Group);

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
  restart.setPending(globals.restartPending);
}

function drawExtraAnimations() {
  // These images are shown to the player to indicate which direction we are moving in a shared
  // replay.
  const size = 0.1;
  const x = playAreaValues.x + (playAreaValues.w! - size) / 2;
  const y = playAreaValues.y + (playAreaValues.h! - size) / 2;

  globals.elements.sharedReplayForward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: globals.imageLoader!.get("replay-forward-border"),
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.sharedReplayForward);

  globals.elements.sharedReplayBackward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: globals.imageLoader!.get("replay-back-border"),
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
