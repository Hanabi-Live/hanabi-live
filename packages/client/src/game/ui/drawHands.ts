import type { NumPlayers, PlayerIndex } from "@hanabi-live/game";
import { MAX_PLAYERS, getCardsPerHand, getCharacter } from "@hanabi-live/game";
import { eRange } from "complete-common";
import Konva from "konva";
import { CardLayout } from "./CardLayout.ts";
import { NameFrame } from "./NameFrame.ts";
import { globals } from "./UIGlobals.ts";
import {
  BGA_ACTION_LOG,
  CARD_H,
  CARD_W,
  CLUE_LOG,
  FONT_FAMILY,
  FULL_CARD_STAGE_SIZE,
  INDICATOR_OPACITY,
  OFF_BLACK,
  QUARTER_TURN_DEGREES,
  TEXT_SHADOW,
} from "./constants.ts";
import { TextWithTooltip } from "./controls/TextWithTooltip.ts";
import { initKonvaTooltips } from "./konvaTooltips.ts";

interface HandConfig {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

/** The gap between the hands and the logs on either side, in fractions of the stage width. */
const HAND_LOG_GAP = 0.02;

/**
 * How far a name frame below a hand extends past each side of it, in fractions of the stage width.
 */
const NAME_FRAME_INSET_X = 0.005;

/** The width of the name frame of a hand that runs down the left or right side of the board. */
const SIDE_NAME_FRAME_W = 0.12;

/**
 * How far left of a hand on the right side of the board its name frame starts, in fractions of the
 * stage width.
 */
const RIGHT_SIDE_NAME_FRAME_OFFSET_X = 0.111;

/**
 * In the Keldon layout for 5 and 6 players, the gap between a hand and the name frame below it, in
 * fractions of the stage height.
 */
const KELDON_NAME_FRAME_GAP_Y = 0.02;

/**
 * In the Keldon layout for 5 players, the gap between a hand in the top row and the name frame
 * below it, in fractions of the stage height.
 */
const KELDON_5P_TOP_NAME_FRAME_GAP_Y = 0.005;

/**
 * In the Keldon layout for 5 and 6 players, where the name frames of the hands that run down the
 * left and right sides of the board are, in fractions of the stage. The left frame starts `leftX`
 * to the left of its hand. The left and right frames sit `leftY` and `rightY` below the top of the
 * left side hand.
 */
const KELDON_SIDE_NAME_FRAME_OFFSET = {
  5: { leftX: 0.0095, leftY: 0.022, rightY: 0.025 },
  6: { leftX: 0.009, leftY: 0.01, rightY: 0.01 },
} as const;

/** In the Keldon layout for 6 players, how much narrower our own hand and the top hands are. */
const KELDON_6P_HAND_WIDTH_SCALE = 0.75;

/**
 * In the Keldon layout for 6 players, how much narrower the hands on the sides of the board are.
 */
const KELDON_6P_SIDE_HAND_WIDTH_SCALE = 0.8;

/** The black line drawn at one end of each hand. */
const HAND_BLACK_LINE = {
  /** In fractions of the stage width. */
  w: 0.0075,
  /** In fractions of the stage height. */
  strokeWidth: 0.002,
  /** In fractions of the stage width. */
  cornerRadius: 0.003,
} as const;

/**
 * In the Keldon layout, where the black line at the oldest end of a hand is, in fractions of the
 * stage width.
 */
interface BlackLineX {
  /** The line's left edge, relative to the hand's left edge. */
  readonly start: number;
  /** Replaces `start` for the hands that run down the sides of the board. */
  readonly sideStart?: number;
  /** The line's left edge for a reversed hand, relative to the hand's right edge. */
  readonly reversedStart: number;
}

const KELDON_HAND_BLACK_LINE_X = {
  2: { start: -0.0075, reversedStart: 0.002 },
  3: { start: -0.0125, reversedStart: 0.002 },
  4: { start: -0.005, reversedStart: 0 },
  5: { start: -0.001, sideStart: -0.01, reversedStart: -0.005 },
  6: { start: -0.0025, reversedStart: -0.005 },
} as const satisfies Record<NumPlayers, BlackLineX>;

/** The top of our own hand at the bottom of the board in Keldon mode. */
const KELDON_BOTTOM_HAND_Y = 0.77;

/** The top of the hands along the top of the board in Keldon mode. */
const KELDON_TOP_HAND_Y = 0.01;

/** The top of the name frame below our own hand in Keldon mode, when it is not derived from it. */
const KELDON_BOTTOM_NAME_FRAME_Y = 0.97;

/** The top of the name frame below the hands along the top of the board in Keldon mode. */
const KELDON_TOP_NAME_FRAME_Y = 0.21;

/**
 * In the Keldon layout for 2 to 4 players, how far the name frames of the hands along the top and
 * bottom of the board extend past each side of them, in fractions of the stage width.
 */
const KELDON_NAME_FRAME_INSET_X = { 2: 0.015, 3: 0.01, 4: 0.01 } as const;

/**
 * In the Keldon layout for 3 and 4 players, where the name frames of the tilted hands on the sides
 * of the board are, in fractions of the stage.
 */
const KELDON_TILTED_SIDE_NAME_FRAME = {
  3: { leftX: 0.0075, rightX: 0.675, y: 0.775, w: SIDE_NAME_FRAME_W },
  4: { leftX: 0.01, rightX: 0.66, y: 0.74, w: 0.13 },
} as const;

/**
 * In BGA mode, the black box drawn around a player's hand to indicate that it is their turn. It
 * extends past the hand by fractions of the hand's size, split evenly between opposite sides. These
 * were tuned by eye for how the box looks around the cards; it is not meant to match the width of
 * the name frame below the hand.
 */
const BGA_TURN_RECT = {
  /** `wide` replaces `default` in games with `wideNumPlayers` players. */
  paddingW: { default: 0.025, wide: 0.055 },
  wideNumPlayers: 5,
  paddingH: 0.075,
  /** How much further the bottom edge extends in games with the most players, in stage heights. */
  maxPlayersExtraH: 0.005,
  /** In fractions of the box's height. */
  cornerRadius: 0.1,
} as const;

/**
 * The size of the detrimental character icon, which is centered on the corner of a player's name
 * frame, in fractions of the stage's width and height. The emoji fills the icon's height.
 */
const CHARACTER_ICON_SIZE = 0.03;

/** In the Keldon layout, the width of a hand that does not span the board, as with 4 players. */
const KELDON_NARROW_HAND_W = 0.34;

/**
 * In the Keldon layout, the height of a hand whose cards are shrunk to make room, such as in the
 * top row of 6-player games or when each hand has one extra card.
 */
const KELDON_REDUCED_HAND_H = 0.165;

/**
 * In the Keldon layout, the size of a hand that runs down the left or right side of the board with
 * 5 and 6 players, and the left edges of the hands on each side.
 */
const KELDON_SIDE_HAND = {
  w: 0.301,
  h: 0.18,
  leftX: 0.03,
  rightX: 0.77,
} as const;

/** In the Keldon layout, the width of the tilted hands on the sides of the board with 3 players. */
const KELDON_TILTED_SIDE_HAND_W = 0.41;

/**
 * In the Keldon layout, how far the hands on the sides of the board are rotated with 3 players, in
 * degrees. The left hand is rotated by the negative value.
 */
const KELDON_3P_SIDE_HAND_ROTATION = 82;

/**
 * In the Keldon layout, how far the hands on the sides of the board are rotated with 4 players, in
 * degrees. The left hand is rotated by the negative value.
 */
const KELDON_4P_SIDE_HAND_ROTATION = 78;

/** In the Keldon layout, the left edge and width of a hand that spans the board (2 players). */
const KELDON_WIDE_HAND = { x: 0.19, w: 0.42 } as const;

/**
 * In the Keldon layout, the left edge and width of a narrow hand in the middle of the board, as
 * with 4 players.
 */
const KELDON_CENTERED_NARROW_HAND = {
  x: 0.23,
  w: KELDON_NARROW_HAND_W,
} as const;

/**
 * In the Keldon layout, the hand-tuned positions of the hands that no shared value places, in
 * fractions of the stage. `left` and `right` are the hands on the sides of the board, and `top` the
 * hands along its top.
 */
const KELDON_HAND_POSITIONS = {
  3: { left: { x: 0.011, y: 0.73 }, right: { x: 0.735, y: 0.024 } },
  4: { left: { x: 0.015, y: 0.68 }, right: { x: 0.715, y: 0.095 } },
  5: { leftY: 0.756, topLeftX: 0.0205, topRightX: 0.44, rightY: 0.238 },
  6: {
    bottomX: 0.273,
    leftY: 0.72,
    topLeftX: 0.0235,
    topMiddleX: 0.289,
    topRightX: 0.5535,
    rightY: 0.292,
  },
} as const;

/** In the Keldon layout with one extra card, how far our own hand and the others move down. */
const KELDON_EXTRA_CARD_OFFSET_Y = { us: 0.018, other: 0.013 } as const;

/**
 * In the Keldon layout with one extra card, the hands that run down the sides of the board, and
 * every hand in 6-player games, shrink further to fit the extra card.
 */
const KELDON_EXTRA_CARD_HAND_H = {
  side: KELDON_REDUCED_HAND_H - 0.02,
  sixPlayerBottom: KELDON_REDUCED_HAND_H - 0.01,
  sixPlayerTop: KELDON_REDUCED_HAND_H - 0.03,
} as const;

/** The height of a player's name frame, in fractions of the stage height. */
const NAME_FRAME_H = 0.02;

/** In BGA mode, how the hands are spaced in the column between the logs. */
const BGA_HANDS = {
  /** The top of the first hand, in fractions of the stage height. */
  topY: 0.03,
  /**
   * With at least this many players, the hands start further right so that they do not overlap with
   * the timer for spectators or the hypothetical controls during a shared replay.
   */
  timerClearanceMinPlayers: 4,
  /** With at least this many players, the first hand starts higher to make room for the cards. */
  manyPlayers: 5,
  /** How much higher the first hand starts with `manyPlayers` or more players. */
  manyPlayersRaiseY: 0.005,
  /** The lowest that the last hand can reach, in fractions of the stage height. */
  bottomY: 0.96,
  /** The gap between adjacent cards, in card widths. */
  cardSpacing: 0.1,
  /** The most cards in each hand for which `fewCardsSpacing` replaces `cardSpacing`. */
  maxFewCards: 4,
  /** Replaces `cardSpacing` when each hand holds `maxFewCards` or fewer cards. */
  fewCardsSpacing: 0.2,
  /** The gap between adjacent hands, in hand heights. */
  handSpacing: 0.45,
  /** The gap between a hand and the name frame below it, in fractions of the stage height. */
  nameFrameGapY: 0.01,
} as const;

/** Shown in place of a character when a player has none, which can happen when debugging. */
const UNASSIGNED_CHARACTER = {
  id: -1,
  name: "n/a",
  description: "",
  emoji: "",
} as const;

const handPos: HandConfig[][] = [];
const namePos: HandConfig[][] = [];
const namePosBGA: HandConfig[][] = [];

/** A name frame with its top at `y`, extending `insetX` past each side of a hand. */
function nameFrameBelow(
  hand: { readonly x: number; readonly w: number },
  insetX: number,
  y: number,
): HandConfig {
  return { x: hand.x - insetX, y, w: hand.w + insetX * 2, h: NAME_FRAME_H };
}

/** The name frame of a tilted hand on one side of the board in the Keldon layout. */
function tiltedSideNameFrame(
  numPlayers: keyof typeof KELDON_TILTED_SIDE_NAME_FRAME,
  side: "left" | "right",
): HandConfig {
  const frame = KELDON_TILTED_SIDE_NAME_FRAME[numPlayers];
  return {
    x: side === "left" ? frame.leftX : frame.rightX,
    y: frame.y,
    w: frame.w,
    h: NAME_FRAME_H,
  };
}

export function drawHands(winW: number, winH: number): void {
  // Constants
  const { numPlayers } = globals.options;
  const numCardsPerHand = getCardsPerHand(globals.options);

  // In Keldon mode, the hand positions are different depending on the amount of players, so they
  // have to be hard-coded.
  const keldonHandH = FULL_CARD_STAGE_SIZE.H;
  const handPos6Ratio = KELDON_NARROW_HAND_W / keldonHandH;
  const handPos6W =
    KELDON_REDUCED_HAND_H * handPos6Ratio * KELDON_6P_HAND_WIDTH_SCALE;
  handPos[2] = [
    { ...KELDON_WIDE_HAND, y: KELDON_BOTTOM_HAND_Y, h: keldonHandH, rot: 0 },
    { ...KELDON_WIDE_HAND, y: KELDON_TOP_HAND_Y, h: keldonHandH, rot: 0 },
  ];
  handPos[3] = [
    { ...KELDON_WIDE_HAND, y: KELDON_BOTTOM_HAND_Y, h: keldonHandH, rot: 0 },
    {
      x: KELDON_HAND_POSITIONS[3].left.x,
      y: KELDON_HAND_POSITIONS[3].left.y,
      w: KELDON_TILTED_SIDE_HAND_W,
      h: keldonHandH,
      rot: -KELDON_3P_SIDE_HAND_ROTATION,
    },
    {
      x: KELDON_HAND_POSITIONS[3].right.x,
      y: KELDON_HAND_POSITIONS[3].right.y,
      w: KELDON_TILTED_SIDE_HAND_W,
      h: keldonHandH,
      rot: KELDON_3P_SIDE_HAND_ROTATION,
    },
  ];
  handPos[4] = [
    {
      ...KELDON_CENTERED_NARROW_HAND,
      y: KELDON_BOTTOM_HAND_Y,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_HAND_POSITIONS[4].left.x,
      y: KELDON_HAND_POSITIONS[4].left.y,
      w: KELDON_NARROW_HAND_W,
      h: keldonHandH,
      rot: -KELDON_4P_SIDE_HAND_ROTATION,
    },
    {
      ...KELDON_CENTERED_NARROW_HAND,
      y: KELDON_TOP_HAND_Y,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_HAND_POSITIONS[4].right.x,
      y: KELDON_HAND_POSITIONS[4].right.y,
      w: KELDON_NARROW_HAND_W,
      h: keldonHandH,
      rot: KELDON_4P_SIDE_HAND_ROTATION,
    },
  ];
  handPos[5] = [
    {
      ...KELDON_CENTERED_NARROW_HAND,
      y: KELDON_BOTTOM_HAND_Y,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_SIDE_HAND.leftX,
      y: KELDON_HAND_POSITIONS[5].leftY,
      w: KELDON_SIDE_HAND.w,
      h: KELDON_SIDE_HAND.h,
      rot: -QUARTER_TURN_DEGREES,
    },
    {
      x: KELDON_HAND_POSITIONS[5].topLeftX,
      y: KELDON_TOP_HAND_Y,
      w: KELDON_NARROW_HAND_W,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_HAND_POSITIONS[5].topRightX,
      y: KELDON_TOP_HAND_Y,
      w: KELDON_NARROW_HAND_W,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_SIDE_HAND.rightX,
      y: KELDON_HAND_POSITIONS[5].rightY,
      w: KELDON_SIDE_HAND.w,
      h: KELDON_SIDE_HAND.h,
      rot: QUARTER_TURN_DEGREES,
    },
  ];
  handPos[6] = [
    {
      x: KELDON_HAND_POSITIONS[6].bottomX,
      y: KELDON_BOTTOM_HAND_Y,
      w: KELDON_NARROW_HAND_W * KELDON_6P_HAND_WIDTH_SCALE,
      h: keldonHandH,
      rot: 0,
    },
    {
      x: KELDON_SIDE_HAND.leftX,
      y: KELDON_HAND_POSITIONS[6].leftY,
      w: KELDON_SIDE_HAND.w * KELDON_6P_SIDE_HAND_WIDTH_SCALE,
      h: KELDON_SIDE_HAND.h,
      rot: -QUARTER_TURN_DEGREES,
    },
    {
      x: KELDON_HAND_POSITIONS[6].topLeftX,
      y: KELDON_TOP_HAND_Y,
      w: handPos6W,
      h: KELDON_REDUCED_HAND_H,
      rot: 0,
    },
    {
      x: KELDON_HAND_POSITIONS[6].topMiddleX,
      y: KELDON_TOP_HAND_Y,
      w: handPos6W,
      h: KELDON_REDUCED_HAND_H,
      rot: 0,
    },
    {
      x: KELDON_HAND_POSITIONS[6].topRightX,
      y: KELDON_TOP_HAND_Y,
      w: handPos6W,
      h: KELDON_REDUCED_HAND_H,
      rot: 0,
    },
    {
      x: KELDON_SIDE_HAND.rightX,
      y: KELDON_HAND_POSITIONS[6].rightY,
      w: KELDON_SIDE_HAND.w * KELDON_6P_SIDE_HAND_WIDTH_SCALE,
      h: KELDON_SIDE_HAND.h,
      rot: QUARTER_TURN_DEGREES,
    },
  ];
  if (globals.options.oneExtraCard) {
    // 2-player
    handPos[2][0]!.h = KELDON_REDUCED_HAND_H;
    handPos[2][1]!.h = KELDON_REDUCED_HAND_H;
    handPos[2][0]!.y += KELDON_EXTRA_CARD_OFFSET_Y.us;
    handPos[2][1]!.y += KELDON_EXTRA_CARD_OFFSET_Y.other;

    // 3-player
    handPos[3][0]!.h = KELDON_REDUCED_HAND_H;
    handPos[3][1]!.h = KELDON_REDUCED_HAND_H;
    handPos[3][2]!.h = KELDON_REDUCED_HAND_H;
    handPos[3][0]!.y += KELDON_EXTRA_CARD_OFFSET_Y.us;

    // 4-player
    handPos[4][0]!.h = KELDON_REDUCED_HAND_H;
    handPos[4][1]!.h = KELDON_REDUCED_HAND_H;
    handPos[4][2]!.h = KELDON_REDUCED_HAND_H;
    handPos[4][3]!.h = KELDON_REDUCED_HAND_H;
    handPos[4][0]!.y += KELDON_EXTRA_CARD_OFFSET_Y.us;
    handPos[4][2]!.y += KELDON_EXTRA_CARD_OFFSET_Y.other;

    // 5-player
    handPos[5][0]!.h = KELDON_REDUCED_HAND_H;
    handPos[5][1]!.h = KELDON_EXTRA_CARD_HAND_H.side;
    handPos[5][2]!.h = KELDON_REDUCED_HAND_H;
    handPos[5][3]!.h = KELDON_REDUCED_HAND_H;
    handPos[5][4]!.h = KELDON_EXTRA_CARD_HAND_H.side;
    handPos[5][0]!.y += KELDON_EXTRA_CARD_OFFSET_Y.us;

    // 6-player
    handPos[6][0]!.h = KELDON_EXTRA_CARD_HAND_H.sixPlayerBottom;
    handPos[6][1]!.h = KELDON_EXTRA_CARD_HAND_H.side;
    handPos[6][2]!.h = KELDON_EXTRA_CARD_HAND_H.sixPlayerTop;
    handPos[6][3]!.h = KELDON_EXTRA_CARD_HAND_H.sixPlayerTop;
    handPos[6][4]!.h = KELDON_EXTRA_CARD_HAND_H.sixPlayerTop;
    handPos[6][5]!.h = KELDON_EXTRA_CARD_HAND_H.side;
    handPos[6][2]!.y += KELDON_EXTRA_CARD_OFFSET_Y.other;
    handPos[6][3]!.y += KELDON_EXTRA_CARD_OFFSET_Y.other;
    handPos[6][4]!.y += KELDON_EXTRA_CARD_OFFSET_Y.other;
  }

  // In Board Game Arena mode, the hands are all in a line, so they do not have to be hard-coded.
  const handPosBGA: HandConfig[][] = [];
  if (!globals.lobby.settings.keldonMode) {
    let leftX = BGA_ACTION_LOG.x + BGA_ACTION_LOG.w + HAND_LOG_GAP;
    const rightX = CLUE_LOG.x - HAND_LOG_GAP;
    let topY: number = BGA_HANDS.topY;
    const { bottomY, handSpacing } = BGA_HANDS;
    let cardSpacing: number = BGA_HANDS.cardSpacing;

    if (numPlayers >= BGA_HANDS.timerClearanceMinPlayers) {
      leftX += HAND_LOG_GAP / 2;
    }
    if (numPlayers >= BGA_HANDS.manyPlayers) {
      topY -= BGA_HANDS.manyPlayersRaiseY;
    }

    if (numCardsPerHand <= BGA_HANDS.maxFewCards) {
      // We do not need to keep the cards so close to each other.
      cardSpacing = BGA_HANDS.fewCardsSpacing;
    }

    // The ratio of hand width to card width.
    const widthRatio = numCardsPerHand * (1 + cardSpacing) - cardSpacing;
    const maxCardWidth = (rightX - leftX) / widthRatio;
    // The ratio of hand height to the total height used by the hands (not including name frames).
    const heightRatio = numPlayers * (1 + handSpacing) - handSpacing;
    const maxCardHeight = (bottomY - topY) / heightRatio;

    // We need this because all of the other variables are defined relative to the canvas
    // dimensions.
    const relativeCardRatio = CARD_W / winW / (CARD_H / winH);

    let handX: number;
    let handY: number;
    let handW: number;
    let handH: number;
    if (maxCardWidth / maxCardHeight <= relativeCardRatio) {
      // If we were to stretch the hands as much as possible, the cards would be too tall. So, the
      // limiting factor on card size is the width.
      handX = leftX;
      handY = topY;
      handW = rightX - leftX;
      handH = maxCardWidth / relativeCardRatio;
    } else {
      handW = maxCardHeight * relativeCardRatio * widthRatio;
      handH = maxCardHeight; // The height of cards and hands are the same.
      handX = (rightX + leftX - handW) / 2;
      handY = topY;
    }

    handPosBGA[numPlayers] = [];
    for (const j of eRange(numPlayers)) {
      handPosBGA[numPlayers].push({
        x: handX,
        y: handY + handH * (1 + handSpacing) * j,
        w: handW,
        h: handH,
        rot: 0,
      });
    }
  }

  // In Keldon mode, the name frames along the top and bottom of the board sit below their hands,
  // and the ones on the sides of the board are placed by hand.
  namePos[2] = [
    nameFrameBelow(
      KELDON_WIDE_HAND,
      KELDON_NAME_FRAME_INSET_X[2],
      KELDON_BOTTOM_NAME_FRAME_Y,
    ),
    nameFrameBelow(
      KELDON_WIDE_HAND,
      KELDON_NAME_FRAME_INSET_X[2],
      KELDON_TOP_NAME_FRAME_Y,
    ),
  ];
  namePos[3] = [
    nameFrameBelow(
      KELDON_WIDE_HAND,
      KELDON_NAME_FRAME_INSET_X[3],
      KELDON_BOTTOM_NAME_FRAME_Y,
    ),
    tiltedSideNameFrame(3, "left"),
    tiltedSideNameFrame(3, "right"),
  ];
  namePos[4] = [
    nameFrameBelow(
      KELDON_CENTERED_NARROW_HAND,
      KELDON_NAME_FRAME_INSET_X[4],
      KELDON_BOTTOM_NAME_FRAME_Y,
    ),
    tiltedSideNameFrame(4, "left"),
    nameFrameBelow(
      KELDON_CENTERED_NARROW_HAND,
      KELDON_NAME_FRAME_INSET_X[4],
      KELDON_TOP_NAME_FRAME_Y,
    ),
    tiltedSideNameFrame(4, "right"),
  ];
  namePos[5] = [
    nameFrameBelow(
      handPos[5][0]!,
      NAME_FRAME_INSET_X,
      handPos[5][0]!.y + handPos[5][1]!.h + KELDON_NAME_FRAME_GAP_Y,
    ),
    {
      x: handPos[5][1]!.x - KELDON_SIDE_NAME_FRAME_OFFSET[5].leftX,
      y: handPos[5][1]!.y + KELDON_SIDE_NAME_FRAME_OFFSET[5].leftY,
      w: SIDE_NAME_FRAME_W,
      h: NAME_FRAME_H,
    },
    nameFrameBelow(
      handPos[5][2]!,
      NAME_FRAME_INSET_X,
      handPos[5][2]!.y + handPos[5][2]!.h + KELDON_5P_TOP_NAME_FRAME_GAP_Y,
    ),
    nameFrameBelow(
      handPos[5][3]!,
      NAME_FRAME_INSET_X,
      handPos[5][3]!.y + handPos[5][3]!.h + KELDON_5P_TOP_NAME_FRAME_GAP_Y,
    ),
    {
      x: handPos[5][4]!.x - RIGHT_SIDE_NAME_FRAME_OFFSET_X,
      y: handPos[5][1]!.y + KELDON_SIDE_NAME_FRAME_OFFSET[5].rightY,
      w: SIDE_NAME_FRAME_W,
      h: NAME_FRAME_H,
    },
  ];
  namePos[6] = [
    nameFrameBelow(
      handPos[6][0]!,
      NAME_FRAME_INSET_X,
      handPos[6][0]!.y + handPos[6][1]!.h + KELDON_NAME_FRAME_GAP_Y,
    ),
    {
      x: handPos[6][1]!.x - KELDON_SIDE_NAME_FRAME_OFFSET[6].leftX,
      y: handPos[6][1]!.y + KELDON_SIDE_NAME_FRAME_OFFSET[6].leftY,
      w: SIDE_NAME_FRAME_W,
      h: NAME_FRAME_H,
    },
    nameFrameBelow(
      handPos[6][2]!,
      NAME_FRAME_INSET_X,
      handPos[6][2]!.y + handPos[6][2]!.h + KELDON_NAME_FRAME_GAP_Y,
    ),
    nameFrameBelow(
      handPos[6][3]!,
      NAME_FRAME_INSET_X,
      handPos[6][3]!.y + handPos[6][3]!.h + KELDON_NAME_FRAME_GAP_Y,
    ),
    nameFrameBelow(
      handPos[6][4]!,
      NAME_FRAME_INSET_X,
      handPos[6][4]!.y + handPos[6][4]!.h + KELDON_NAME_FRAME_GAP_Y,
    ),
    {
      x: handPos[6][5]!.x - RIGHT_SIDE_NAME_FRAME_OFFSET_X,
      y: handPos[6][1]!.y + KELDON_SIDE_NAME_FRAME_OFFSET[6].rightY,
      w: SIDE_NAME_FRAME_W,
      h: NAME_FRAME_H,
    },
  ];

  if (!globals.lobby.settings.keldonMode) {
    const i = numPlayers;
    const { nameFrameGapY } = BGA_HANDS;
    namePosBGA[i] = [];
    for (const j of eRange(i)) {
      const hand = handPosBGA[i]![j]!;
      namePosBGA[i].push(
        nameFrameBelow(
          hand,
          NAME_FRAME_INSET_X,
          hand.y + hand.h + nameFrameGapY,
        ),
      );
    }
  }

  // Draw the hands
  for (const i of eRange(numPlayers)) {
    let j = i - globals.metadata.ourPlayerIndex;

    if (j < 0) {
      j += numPlayers;
    }

    let playerHandPos = handPos;
    let playerNamePos = namePos;
    if (!globals.lobby.settings.keldonMode) {
      playerHandPos = handPosBGA;
      playerNamePos = namePosBGA;
    }

    const handValues = {
      x: playerHandPos[numPlayers]![j]!.x,
      y: playerHandPos[numPlayers]![j]!.y,
      w: playerHandPos[numPlayers]![j]!.w,
      h: playerHandPos[numPlayers]![j]!.h,
      rot: playerHandPos[numPlayers]![j]!.rot,
    };
    globals.elements.playerHands[i] = new CardLayout({
      x: handValues.x * winW,
      y: handValues.y * winH,
      width: handValues.w * winW,
      height: handValues.h * winH,
      rotation: handValues.rot,
      align: "center",
      reverse: isHandReversed(j),
      // Hands must listen in order for the events to propagate through to the cards.
      listening: true,
    });
    globals.layers.card.add(globals.elements.playerHands[i]);

    if (globals.lobby.settings.keldonMode) {
      // In Keldon mode, we want to show a helper element that indicates which side of the hand is
      // the oldest.
      const blackLineGroup = new Konva.Group({
        x: handValues.x * winW,
        y: handValues.y * winH,
        width: handValues.w * winW,
        height: handValues.h * winH,
        rotation: handValues.rot,
        align: "center",
        listening: false,
      });
      globals.layers.UI.add(blackLineGroup);

      // The beginning of the hand is at 0. We want the line a little to the left of the first card.
      const blackLineXValues: BlackLineX = KELDON_HAND_BLACK_LINE_X[numPlayers];
      const isSideHand = handValues.rot !== 0;
      const startX = isSideHand
        ? (blackLineXValues.sideStart ?? blackLineXValues.start)
        : blackLineXValues.start;
      const blackLineX = isHandReversed(j)
        ? handValues.w + blackLineXValues.reversedStart
        : startX;
      const blackLineY = 0;
      const blackLine = new Konva.Rect({
        x: blackLineX * winW,
        y: blackLineY * winH,
        width: HAND_BLACK_LINE.w * winW,
        height: handValues.h * winH,
        fill: OFF_BLACK,
        stroke: OFF_BLACK,
        strokeWidth: HAND_BLACK_LINE.strokeWidth * winH,
        cornerRadius: HAND_BLACK_LINE.cornerRadius * winW,
        listening: false,
      });
      blackLineGroup.add(blackLine);
      globals.elements.playerHandBlackLines.push(blackLine);
    } else {
      // In BGA mode, we show a black box around a player's hand to indicate that it is their turn.
      const paddingW =
        numPlayers === BGA_TURN_RECT.wideNumPlayers
          ? BGA_TURN_RECT.paddingW.wide
          : BGA_TURN_RECT.paddingW.default;
      const { paddingH } = BGA_TURN_RECT;
      const turnRectValues = {
        x: handValues.x,
        y: handValues.y,
        w: handValues.w * (1 + paddingW),
        h: handValues.h * (1 + paddingH),
        offsetX: (handValues.w * paddingW) / 2,
        offsetY: (handValues.h * paddingH) / 2,
      };

      if (numPlayers === MAX_PLAYERS) {
        // Extend only the bottom edge.
        turnRectValues.h += BGA_TURN_RECT.maxPlayersExtraH;
      }
      const turnRect = new Konva.Rect({
        x: turnRectValues.x * winW,
        y: turnRectValues.y * winH,
        width: turnRectValues.w * winW,
        height: turnRectValues.h * winH,
        offset: {
          x: turnRectValues.offsetX * winW,
          y: turnRectValues.offsetY * winH,
        },
        fill: "black",
        cornerRadius: turnRectValues.h * BGA_TURN_RECT.cornerRadius * winH,
        rotation: handValues.rot,
        opacity: INDICATOR_OPACITY,
        visible: false,
        listening: false,
      });
      globals.layers.UI.add(turnRect);
      globals.elements.playerHandTurnRects.push(turnRect);
    }

    globals.elements.nameFrames[i] = new NameFrame(
      {
        x: playerNamePos[numPlayers]![j]!.x * winW,
        y: playerNamePos[numPlayers]![j]!.y * winH,
        width: playerNamePos[numPlayers]![j]!.w * winW,
        height: playerNamePos[numPlayers]![j]!.h * winH,
        name: globals.metadata.playerNames[i],
      },
      i as PlayerIndex,
    );
    globals.layers.UI.add(globals.elements.nameFrames[i]);

    drawDetrimentalCharacters(winW, winH, numPlayers, i, j);
  }
}

// Draw the "Detrimental Character Assignments" icon and tooltip.
function drawDetrimentalCharacters(
  winW: number,
  winH: number,
  numPlayers: NumPlayers,
  i: number,
  j: number,
) {
  let playerNamePos = namePos;
  if (!globals.lobby.settings.keldonMode) {
    playerNamePos = namePosBGA;
  }

  if (!globals.options.detrimentalCharacters) {
    return;
  }

  const characterId = globals.metadata.characterAssignments[i];
  const character =
    characterId === undefined
      ? UNASSIGNED_CHARACTER
      : getCharacter(characterId);

  const iconW = CHARACTER_ICON_SIZE * winW;
  const iconH = CHARACTER_ICON_SIZE * winH;
  const charIcon = new TextWithTooltip({
    width: iconW,
    height: iconH,
    x: playerNamePos[numPlayers]![j]!.x * winW - iconW / 2,
    y: playerNamePos[numPlayers]![j]!.y * winH - iconH / 2,
    fontSize: iconH,
    fontFamily: FONT_FAMILY,
    align: "center",
    text: character.emoji,
    fill: "yellow",
    ...TEXT_SHADOW,
    listening: true,
  });
  charIcon.emoji = true; // Mark that this is a text element containing only emoji
  globals.layers.UI.add(charIcon);

  charIcon.tooltipName = `character-assignment-${i}`;
  const metadata = globals.metadata.characterMetadata[i];
  const tooltipContent = `<strong>#${character.id} - ${character.name}</strong><br />${character.description}`;
  charIcon.tooltipContent =
    metadata === undefined
      ? tooltipContent
      : fillCharacterMetadata(tooltipContent, metadata);
  initKonvaTooltips(charIcon, false, true);
}

/** Replaces the placeholder in a character's description with the value it was assigned. */
function fillCharacterMetadata(description: string, metadata: number): string {
  if (description.includes("[random color]")) {
    return description.replace(
      "[random color]",
      globals.variant.clueColors[metadata]!.name.toLowerCase(),
    );
  }
  if (description.includes("[random number]")) {
    return description.replace("[random number]", metadata.toString());
  }
  if (description.includes("[random suit]")) {
    return description.replace(
      "[random suit]",
      globals.variant.suits[metadata]!.displayName,
    );
  }
  return description;
}

function isHandReversed(j: number) {
  // By default, the hand is not reversed.
  let reverse = false;

  if (j === 0) {
    // Reverse the ordering of the cards for our own hand. (For our hand, the oldest card is the
    // first card, which should be on the right.)
    reverse = true;
  }
  if (!globals.lobby.settings.keldonMode) {
    // In BGA mode, we need to reverse every hand.
    reverse = true;
  }
  if (globals.lobby.settings.reverseHands) {
    // If the "Reverse hand direction" option is turned on, then we need to flip the direction of
    // every hand.
    reverse = !reverse;
  }

  return reverse;
}
