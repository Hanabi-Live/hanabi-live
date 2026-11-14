// The sizes of the cards on the redesigned game screen, from the space that the screen has.

import { clamp } from "complete-common";
import { CARD_HEIGHT_PER_WIDTH, CLUED_RAISE_PER_WIDTH } from "./Card.tsx";
import {
  CARD_GAP,
  HAND_BOX_BOTTOM_PADDING,
  HAND_BOX_TOP_SPACE,
  NAME_GAP,
} from "./Hands.tsx";
import { DECK_PILE_DEPTH, TABLE_TOKENS_HEIGHT } from "./SharedCards.tsx";

/** The smallest and largest card in a hand, in CSS pixels of width. */
const HAND_CARD_WIDTH = { MIN: 36, MAX: 150 } as const;

/**
 * When the columns stack, the names go beside the cards only if the cards are still at least this
 * wide. Otherwise, as on a phone, the names go above the cards, so that the cards get the whole
 * width.
 */
export const NAMES_BESIDE_CARDS_MIN_CARD_WIDTH = 90;

/** The smallest and largest card on the play stacks and in the discard pile. */
export const TABLE_CARD_WIDTH = { MIN: 30, MAX: 64 } as const;

/** The width in a stacked play area that is not cards: its padding and the gap before the deck. */
const STACKED_PLAY_AREA_OTHER_WIDTH = 48;

const HAND_BOX_HORIZONTAL_PADDING = 32;

/**
 * The height in the play area that is not cards: the padding of the stacks' box, the gap above the
 * deck, the edges under the top of the deck, and the tokens under it. The classes of these gaps are
 * in pixels, not "rem", so that this sum stays right.
 */
const PLAY_AREA_OTHER_HEIGHT =
  2 * 16 + 12 + DECK_PILE_DEPTH + TABLE_TOKENS_HEIGHT;

const PLAY_STACK_GAP = 8;

/**
 * Returns the width of the cards in the hands. When the columns stack, the page scrolls, so only
 * the width of the screen limits the cards.
 */
export function getHandCardWidth(
  handsWidth: number,
  handsHeight: number,
  numPlayers: number,
  cardsPerHand: number,
  nameColumnWidth: number | undefined,
  stacked: boolean,
): number {
  const widthForCards =
    handsWidth
    - (nameColumnWidth === undefined ? 0 : nameColumnWidth + NAME_GAP)
    - HAND_BOX_HORIZONTAL_PADDING
    - CARD_GAP * (cardsPerHand - 1);
  const byWidth = widthForCards / cardsPerHand;
  const rowHeight = handsHeight / numPlayers;
  const byHeight = stacked
    ? Infinity
    : // The padding above the cards grows with them (see "getHandBoxTopPadding").
      (rowHeight - HAND_BOX_BOTTOM_PADDING - HAND_BOX_TOP_SPACE)
      / (CARD_HEIGHT_PER_WIDTH + CLUED_RAISE_PER_WIDTH);
  return clamp(
    Math.floor(Math.min(byWidth, byHeight)),
    HAND_CARD_WIDTH.MIN,
    HAND_CARD_WIDTH.MAX,
  );
}

/**
 * Returns the width of the cards on the play stacks and in the discard pile. The play stacks and
 * the deck are one column of cards, or one row when the columns stack.
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
  return clamp(Math.floor(width), TABLE_CARD_WIDTH.MIN, TABLE_CARD_WIDTH.MAX);
}
