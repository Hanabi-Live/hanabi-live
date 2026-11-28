// In speedrun mode, a click on a teammate's card gives them a clue at once: a left-click gives a
// color, and a right-click gives a rank. These functions choose the clue for both game screens.

import type {
  ClueRank,
  Color,
  Rank,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import {
  getColorForPrismCard,
  isCardTouchedByClueColor,
  isCardTouchedByClueRank,
  isValidClueRank,
} from "@hanabi-live/game";

/**
 * A card may be clueable by more than one color, so we need to figure out which color to use. A
 * color that the player already chose (`chosenColor`) wins when it touches the card.
 */
export function getColorForSpeedrunClue(
  variant: Variant,
  suitIndex: SuitIndex | undefined,
  rank: Rank | undefined,
  chosenColor?: Color,
): Color | undefined {
  if (suitIndex === undefined || rank === undefined) {
    return undefined;
  }

  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return undefined;
  }

  if (
    chosenColor !== undefined
    && isCardTouchedByClueColor(variant, chosenColor, suit, rank)
  ) {
    return chosenColor;
  }

  // Otherwise, assume that they want to use the first possible color of the card.
  const firstClueColor = suit.clueColors[0];
  if (firstClueColor !== undefined) {
    return firstClueColor;
  }

  // Handle the cases where the "suit.clueColors" array is empty.
  if (suit.allClueColors) {
    return variant.clueColors[0];
  }
  if (suit.prism) {
    return getColorForPrismCard(variant, rank);
  }

  return undefined;
}

/**
 * A card may be clueable by more than one rank, so we need to figure out which rank to use. A rank
 * that the player already chose (`chosenRank`) wins when it touches the card.
 */
export function getRankForSpeedrunClue(
  variant: Variant,
  suitIndex: SuitIndex | undefined,
  rank: Rank | undefined,
  chosenRank?: ClueRank,
): ClueRank | undefined {
  if (suitIndex === undefined || rank === undefined) {
    return undefined;
  }

  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return undefined;
  }

  if (
    chosenRank !== undefined
    && isCardTouchedByClueRank(variant, chosenRank, suitIndex, suit, rank)
  ) {
    return chosenRank;
  }

  // Otherwise, assume that they want to use the real rank of the card. In some variants, that rank
  // is not a clue (such as a 3 in "Odds and Evens"), so use the first rank that touches the card.
  const ownRank =
    isValidClueRank(rank) && variant.clueRanks.includes(rank)
      ? rank
      : undefined;
  return ownRank !== undefined
    && isCardTouchedByClueRank(variant, ownRank, suitIndex, suit, rank)
    ? ownRank
    : (variant.clueRanks.find((clueRank) =>
        isCardTouchedByClueRank(variant, clueRank, suitIndex, suit, rank),
      ) ?? ownRank);
}
