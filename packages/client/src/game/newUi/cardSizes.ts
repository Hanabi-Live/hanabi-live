// The sizes of the cards on the redesigned game screen, from the space that the screen has.

import { clamp } from "complete-common";
import {
  CARD_HEIGHT_PER_WIDTH,
  CLUE_TOKEN_REACH_PER_WIDTH,
  CLUED_RAISE_PER_WIDTH,
} from "./Card.tsx";
import {
  CARD_GAP,
  HAND_BOX_BOTTOM_PADDING,
  HAND_BOX_TOP_SPACE,
  NAME_COLUMN_MAX_WIDTH,
  NAME_GAP,
} from "./Hands.tsx";
import {
  DECK_PILE_DEPTH,
  PLAY_AREA_GAP,
  PLAY_STACK_GAP,
  PLAY_STACKS_PADDING,
  TABLE_TOKENS_HEIGHT,
} from "./SharedCards.tsx";

/** The smallest and largest card in a hand, in CSS pixels of width. */
const HAND_CARD_WIDTH = {
  MIN: 36,
  MAX: 150,
} as const;

/**
 * In the phone layout, the names go beside the cards if the cards are still at least this wide.
 * Otherwise, the names go above the cards, if that makes the cards larger, or if the names and the
 * smallest cards do not fit beside each other (see "namesFitBesideCards").
 */
export const NAMES_BESIDE_CARDS_MIN_CARD_WIDTH = 90;

/** The smallest and largest card on the play stacks. */
const STACK_CARD_WIDTH = {
  MIN: 30,
  MAX: 96,
} as const;

/**
 * The largest card in the discard pile. Its column has a fixed width, so its cards stay smaller
 * than the play stacks can be.
 */
export const DISCARD_CARD_MAX_WIDTH = 64;

/** The width in a stacked play area that is not cards: its padding and the gap before the deck. */
const STACKED_PLAY_AREA_OTHER_WIDTH = 2 * PLAY_STACKS_PADDING + PLAY_AREA_GAP;

const HAND_BOX_HORIZONTAL_PADDING = 32;

/**
 * The space above the hands and the play area, in CSS pixels. When the columns stack, the screen is
 * narrow, so it is smaller.
 */
export const TABLE_TOP_PADDING = {
  WIDE: 24,
  STACKED: 12,
} as const;

/**
 * How far the clue token of a card in a hand reaches above the hand's box, as a fraction of the
 * card's width, before the fixed part of the box's top padding.
 */
const CLUE_TOKEN_OVERHANG_PER_WIDTH =
  CLUE_TOKEN_REACH_PER_WIDTH - CLUED_RAISE_PER_WIDTH;

/** The least space between a clue token on the top hand and the top of the table. */
const CLUE_TOKEN_TABLE_MARGIN = 8;

/**
 * Returns the space above the hands, inside the table's top padding, for the clue tokens of the top
 * hand. Otherwise, the top of the screen cuts a large token. With the names above the cards, the
 * gap between the name and the cards already has room for the tokens.
 */
export function getHandsTopPadding(
  cardWidth: number,
  namesBesideCards: boolean,
  stacked: boolean,
): number {
  if (!namesBesideCards) {
    return 0;
  }

  const tablePadding = stacked
    ? TABLE_TOP_PADDING.STACKED
    : TABLE_TOP_PADDING.WIDE;
  return Math.max(
    0,
    cardWidth * CLUE_TOKEN_OVERHANG_PER_WIDTH
      - HAND_BOX_TOP_SPACE
      - tablePadding
      + CLUE_TOKEN_TABLE_MARGIN,
  );
}

/**
 * The height in the play area that is not cards: the padding of the stacks' box, the gap above the
 * deck, the edges under the top of the deck, and the tokens under it.
 */
const PLAY_AREA_OTHER_HEIGHT =
  2 * PLAY_STACKS_PADDING
  + PLAY_AREA_GAP
  + DECK_PILE_DEPTH
  + TABLE_TOKENS_HEIGHT;

/**
 * Whether the column of names and a hand of the smallest cards fit in the width of the hands. If
 * not, the hands would be wider than the screen.
 */
export function namesFitBesideCards(
  handsWidth: number,
  cardsPerHand: number,
  nameColumnWidth: number,
): boolean {
  return (
    getHandsWidthForCards(HAND_CARD_WIDTH.MIN, cardsPerHand, nameColumnWidth)
    <= handsWidth
  );
}

/**
 * The width of the wide layout's right column, with the discard pile and the clue log, in CSS
 * pixels. The column is `NORMAL` wide. It gets narrower when the hands need room, and wider when
 * the hands do not use all of theirs.
 */
const DISCARD_COLUMN_WIDTH = {
  MIN: 240,
  NORMAL: 300,
  MAX: 420,
} as const;

/** The space on each side of the wide layout's table, in CSS pixels. */
const TABLE_SIDE_PADDING = {
  MIN: 20,
  MAX: 28,
} as const;

/** The space between the columns of the wide layout's table, in CSS pixels. */
const TABLE_COLUMN_GAP = {
  MIN: 24,
  MAX: 36,
} as const;

/** The room that the padding and the gaps of the table can give to the hands. */
const TABLE_SPACING_ROOM =
  2 * (TABLE_SIDE_PADDING.MAX - TABLE_SIDE_PADDING.MIN)
  + 2 * (TABLE_COLUMN_GAP.MAX - TABLE_COLUMN_GAP.MIN);

/**
 * Returns the width of the hands with cards `cardWidth` wide and the names beside them in a column
 * `nameColumnWidth` wide.
 */
function getHandsWidthForCards(
  cardWidth: number,
  cardsPerHand: number,
  nameColumnWidth: number,
): number {
  return (
    nameColumnWidth
    + NAME_GAP
    + HAND_BOX_HORIZONTAL_PADDING
    + CARD_GAP * (cardsPerHand - 1)
    + cardWidth * cardsPerHand
  );
}

/** The sizes of the wide layout's parts beside the hands, as `getWideLayoutRoom` sets them. */
export interface WideLayoutRoom {
  readonly discardColumnWidth: number;

  /**
   * The width of the hands' column. It is no wider than the hands, so that the table has the width
   * that they do not use on its sides, not between its columns.
   */
  readonly handsColumnMaxWidth: number;

  readonly tableSidePadding: number;
  readonly tableColumnGap: number;

  /**
   * Whether the hands are narrower than they can use when everything beside them has given up its
   * room, so that their cards get smaller.
   */
  readonly handsNarrowed: boolean;
}

/**
 * Returns the sizes of the wide layout's parts beside the hands. Each part is as large as it can
 * be, and the right column also takes the width that the hands do not use, up to its maximum. When
 * the width makes the hand cards smaller than their height allows, the parts give up room to the
 * hands, in this order, and only as much as the hands need: the right column, and then the padding
 * and the gaps of the table. The column of names does not give up room. `rowWidth` is the width of
 * the table's row without the play stacks' column. `nameWidth` is the width of the widest name, and
 * `nameExtraWidth` is the width beside the names, such as for the brain buttons.
 */
export function getWideLayoutRoom(
  rowWidth: number,
  handsHeight: number,
  numPlayers: number,
  cardsPerHand: number,
  nameWidth: number,
  nameExtraWidth: number,
): WideLayoutRoom {
  const widest: WideLayoutRoom = {
    discardColumnWidth: DISCARD_COLUMN_WIDTH.NORMAL,
    handsColumnMaxWidth: getHandsWidthForCards(
      HAND_CARD_WIDTH.MAX,
      cardsPerHand,
      NAME_COLUMN_MAX_WIDTH.WIDE + nameExtraWidth,
    ),
    tableSidePadding: TABLE_SIDE_PADDING.MAX,
    tableColumnGap: TABLE_COLUMN_GAP.MAX,
    handsNarrowed: false,
  };
  if (rowWidth <= 0 || handsHeight <= 0) {
    return widest;
  }

  const roomForHands =
    rowWidth
    - DISCARD_COLUMN_WIDTH.NORMAL
    - 2 * TABLE_SIDE_PADDING.MAX
    - 2 * TABLE_COLUMN_GAP.MAX;
  const cardWidth = getHandCardWidth(
    Infinity,
    handsHeight,
    numPlayers,
    cardsPerHand,
    0,
    0,
    false,
  );
  const nameColumnWidth = Math.min(nameWidth, NAME_COLUMN_MAX_WIDTH.WIDE);
  // The hands use no more width than their cards need. Then the cards are as large as the height
  // allows.
  const neededWidth = getHandsWidthForCards(
    cardWidth,
    cardsPerHand,
    nameColumnWidth + nameExtraWidth,
  );
  const handsColumnMaxWidth = Math.ceil(neededWidth);
  let missing = neededWidth - roomForHands;
  if (missing <= 0) {
    // The right column takes the width that the hands do not use, so that the hands do not have
    // empty space beside them.
    return {
      ...widest,
      handsColumnMaxWidth,
      discardColumnWidth:
        DISCARD_COLUMN_WIDTH.NORMAL
        + clamp(
          Math.floor(roomForHands - neededWidth),
          0,
          DISCARD_COLUMN_WIDTH.MAX - DISCARD_COLUMN_WIDTH.NORMAL,
        ),
    };
  }

  const discardRoom = Math.min(
    missing,
    DISCARD_COLUMN_WIDTH.NORMAL - DISCARD_COLUMN_WIDTH.MIN,
  );
  missing -= discardRoom;

  // The padding and the gaps give up room together, each in proportion to its range.
  const spacingShare =
    clamp(missing, 0, TABLE_SPACING_ROOM) / TABLE_SPACING_ROOM;
  missing -= spacingShare * TABLE_SPACING_ROOM;

  return {
    discardColumnWidth: DISCARD_COLUMN_WIDTH.NORMAL - discardRoom,
    handsColumnMaxWidth,
    tableSidePadding:
      TABLE_SIDE_PADDING.MAX
      - spacingShare * (TABLE_SIDE_PADDING.MAX - TABLE_SIDE_PADDING.MIN),
    tableColumnGap:
      TABLE_COLUMN_GAP.MAX
      - spacingShare * (TABLE_COLUMN_GAP.MAX - TABLE_COLUMN_GAP.MIN),
    handsNarrowed: missing > 0,
  };
}

/**
 * Returns the width of the wide layout's hands, from the sizes that `getWideLayoutRoom` returned
 * for `rowWidth`. It is the width that the hands' column gets on the screen. The game screen uses
 * it rather than measuring the column, because a measurement is one render late: while the window
 * resizes, the cards would show at the wrong size for a frame, and then jump to the right one.
 */
export function getWideHandsWidth(
  rowWidth: number,
  room: WideLayoutRoom,
): number {
  return clamp(
    rowWidth
      - room.discardColumnWidth
      - 2 * room.tableSidePadding
      - 2 * room.tableColumnGap,
    0,
    room.handsColumnMaxWidth,
  );
}

/**
 * Returns the width of the cards in a hand that fit in `handsWidth`, with the names beside the
 * cards in a column `nameColumnWidth` wide, or above them when it is `undefined`.
 */
function getHandCardWidthByWidth(
  handsWidth: number,
  cardsPerHand: number,
  nameColumnWidth: number | undefined,
): number {
  const widthForCards =
    handsWidth
    - (nameColumnWidth === undefined ? 0 : nameColumnWidth + NAME_GAP)
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * (cardsPerHand - 1);
  return widthForCards / cardsPerHand;
}

/**
 * Returns the width of the cards in the hands. They fit in `handsHeight`. In the phone layout, that
 * is the height of the table on the screen, so that every hand shows when the page is scrolled to
 * the top. Then the names can be above the cards, in a row `nameRowHeight` tall.
 */
export function getHandCardWidth(
  handsWidth: number,
  handsHeight: number,
  numPlayers: number,
  cardsPerHand: number,
  nameColumnWidth: number | undefined,
  nameRowHeight: number,
  stacked: boolean,
): number {
  const byWidth = getHandCardWidthByWidth(
    handsWidth,
    cardsPerHand,
    nameColumnWidth,
  );
  // The padding above the cards grows with them (see "getHandBoxTopPadding"), and so does the space
  // above the hands (see "getHandsTopPadding").
  const rowOtherHeight = HAND_BOX_BOTTOM_PADDING + HAND_BOX_TOP_SPACE;
  const rowHeightPerWidth = CARD_HEIGHT_PER_WIDTH + CLUED_RAISE_PER_WIDTH;
  let byHeight: number;
  if (nameColumnWidth === undefined) {
    // The name's row is above the cards, with a gap for the clue tokens (see "Hands.tsx").
    byHeight =
      (handsHeight / numPlayers - rowOtherHeight - nameRowHeight)
      / (rowHeightPerWidth + CLUE_TOKEN_REACH_PER_WIDTH);
  } else {
    const byRowHeight =
      (handsHeight / numPlayers - rowOtherHeight) / rowHeightPerWidth;
    const byTopPadding =
      (handsHeight
        - numPlayers * rowOtherHeight
        + HAND_BOX_TOP_SPACE
        + (stacked ? TABLE_TOP_PADDING.STACKED : TABLE_TOP_PADDING.WIDE)
        - CLUE_TOKEN_TABLE_MARGIN)
      / (numPlayers * rowHeightPerWidth + CLUE_TOKEN_OVERHANG_PER_WIDTH);
    byHeight = Math.min(byRowHeight, byTopPadding);
  }
  return clamp(
    Math.floor(Math.min(byWidth, byHeight)),
    HAND_CARD_WIDTH.MIN,
    HAND_CARD_WIDTH.MAX,
  );
}

/**
 * Returns the width of the cards on the play stacks and in the discard pile, before the discard
 * pile's limit. The play stacks and the deck are one column of cards, or one row when the columns
 * stack. The width is not rounded to whole pixels. Otherwise, as the hands' top padding shrinks,
 * the deck would move up, and then jump down when the cards grow by a pixel.
 */
export function getTableCardWidth(
  playAreaWidth: number,
  playAreaHeight: number,
  numSuits: number,
  stacked: boolean,
): number {
  const gaps = PLAY_STACK_GAP * (numSuits - 1);
  const width = stacked
    ? (playAreaWidth - STACKED_PLAY_AREA_OTHER_WIDTH - gaps) / (numSuits + 1)
    : (playAreaHeight - PLAY_AREA_OTHER_HEIGHT - gaps)
      / ((numSuits + 1) * CARD_HEIGHT_PER_WIDTH);
  return clamp(width, STACK_CARD_WIDTH.MIN, STACK_CARD_WIDTH.MAX);
}
