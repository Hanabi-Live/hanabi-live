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
 * Otherwise, the names go above the cards, if that makes the cards larger.
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
  const widthForCards =
    handsWidth
    - (nameColumnWidth === undefined ? 0 : nameColumnWidth + NAME_GAP)
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * (cardsPerHand - 1);
  const byWidth = widthForCards / cardsPerHand;
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
 * stack.
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
  return clamp(Math.floor(width), STACK_CARD_WIDTH.MIN, STACK_CARD_WIDTH.MAX);
}
