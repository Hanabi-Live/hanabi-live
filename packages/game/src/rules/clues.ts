// Functions related to the clue objects themselves: converting, getting names, etc.

import { assertDefined } from "complete-common";
import { EVEN_CARD_RANKS, ODD_CARD_RANKS } from "../constants.ts";
import {
  EVEN_RANK_CLUE,
  MIN_RANK,
  ODD_RANK_CLUE,
  START_CARD_RANK,
} from "../generated/protocol.ts";
import type { Color } from "../interfaces/Color.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { Suit } from "../interfaces/Suit.ts";
import type { Variant } from "../interfaces/Variant.ts";
import { getCharacterNameForPlayer } from "../reducers/reducerHelpers.ts";
import type { Clue } from "../types/Clue.ts";
import { newColorClue, newRankClue } from "../types/Clue.ts";
import type { HiddenClue } from "../types/HiddenClue.ts";
import type { MsgClue } from "../types/MsgClue.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type { Rank } from "../types/Rank.ts";
import type { RankClueNumber } from "../types/RankClueNumber.ts";
import type { SuitIndex } from "../types/SuitIndex.ts";
import type { ActionClue } from "../types/gameActions.ts";

/**
 * In a hypothetical, a player can pass the turn, spending a clue without giving one. It is recorded
 * as a hidden clue that the player gives to themselves, which a real game cannot contain.
 */
export function isPassTurnClue(action: ActionClue): boolean {
  return action.playerIndex === action.receiverIndex;
}

export function getClueName(
  clue: MsgClue | HiddenClue,
  variant: Variant,
  characterName: string,
): string {
  if (clue.type === undefined) {
    return "Quack";
  }
  if (variant.cowAndPig) {
    switch (clue.type) {
      case "color": {
        return "Moo";
      }

      case "rank": {
        return "Oink";
      }
    }
  }

  if (variant.duck || characterName === "Quacker") {
    return "Quack";
  }

  if (variant.oddsAndEvens && clue.type === "rank") {
    if (clue.value === ODD_RANK_CLUE) {
      return "Odd";
    }

    if (clue.value === EVEN_RANK_CLUE) {
      return "Even";
    }
  }

  switch (clue.type) {
    case "color": {
      const color = variant.clueColors[clue.value];
      return color === undefined ? "Unknown" : color.name;
    }

    case "rank": {
      return clue.value.toString();
    }
  }
}

/**
 * Convert a clue from the format used by the server to the format used by the client. On the
 * client, the color is a rich object. On the server, the color is a simple integer mapping.
 */
export function msgClueToClue(msgClue: MsgClue, variant: Variant): Clue {
  switch (msgClue.type) {
    case "color": {
      const color = variant.clueColors[msgClue.value];
      assertDefined(
        color,
        `Failed to get the variant clue color at index: ${msgClue.value}`,
      );

      return newColorClue(color);
    }

    case "rank": {
      const clueValue = msgClue.value;
      return newRankClue(clueValue);
    }
  }
}

export function isCardTouchedByClue(
  variant: Variant,
  clue: Clue,
  cardSuitIndex: SuitIndex,
  cardRank: Rank,
): boolean {
  const suit = variant.suits[cardSuitIndex];
  if (suit === undefined) {
    return false;
  }

  switch (clue.type) {
    case "color": {
      return isCardTouchedByClueColor(variant, clue.value, suit, cardRank);
    }

    case "rank": {
      return isCardTouchedByClueRank(
        variant,
        clue.value,
        cardSuitIndex,
        suit,
        cardRank,
      );
    }
  }
}

export function isCardTouchedByClueColor(
  variant: Variant,
  clueColor: Color,
  cardSuit: Suit,
  cardRank: Rank,
): boolean {
  if (variant.colorCluesTouchNothing) {
    return false;
  }

  if (variant.synesthesia && !cardSuit.noClueRanks) {
    // A card matches if it would match a prism card, in addition to normal color matches. This
    // applies even to suits that color clues do not touch, such as White.
    const color = getColorForRank(variant, cardRank);
    if (color !== undefined && clueColor.name === color.name) {
      return true;
    }
  }

  if (cardSuit.allClueColors) {
    return true;
  }

  if (cardSuit.noClueColors) {
    return false;
  }

  if (cardRank === variant.specialRank) {
    if (variant.specialRankAllClueColors) {
      return true;
    }

    if (variant.specialRankNoClueColors) {
      return false;
    }
  }

  if (cardSuit.prism) {
    const prismColor = getColorForPrismCard(variant, cardRank);
    return clueColor.name === prismColor.name;
  }

  const suitClueColorNames = cardSuit.clueColors.map(
    (suitClueColor) => suitClueColor.name,
  );
  return suitClueColorNames.includes(clueColor.name);
}

/**
 * The clue color that a rank contributes in Synesthesia variants and that touches a prism card of
 * the rank: the ranks cycle through the variant's clue colors in order.
 */
export function getColorForRank(
  variant: Variant,
  rank: number,
): Color | undefined {
  return variant.clueColors[(rank - MIN_RANK) % variant.clueColors.length];
}

/** The color that touches a prism card is contingent upon the card's rank. */
export function getColorForPrismCard(variant: Variant, rank: number): Color {
  // "START" cards count as rank 0, so they are touched by the final color.
  const prismColor =
    rank === START_CARD_RANK
      ? variant.clueColors.at(-1)
      : getColorForRank(variant, rank);
  assertDefined(
    prismColor,
    `Failed to get the color corresponding to a prism card of rank ${rank} for variant: ${variant.name}`,
  );

  return prismColor;
}

export function isCardTouchedByClueRank(
  variant: Variant,
  clueRank: RankClueNumber,
  cardSuitIndex: SuitIndex,
  cardSuit: Suit,
  cardRank: Rank,
): boolean {
  if (variant.rankCluesTouchNothing) {
    return false;
  }

  if (cardSuit.allClueRanks) {
    return true;
  }

  if (cardSuit.noClueRanks) {
    return false;
  }

  if (variant.funnels) {
    // Rank clues in Funnels touch also all lower ranked cards.
    return cardRank <= clueRank;
  }

  if (variant.chimneys) {
    // Rank clues in Chimneys touch also all lower ranked cards.
    return cardRank >= clueRank;
  }

  // Clue ranks in Odds And Evens can only be odd or even.
  if (variant.oddsAndEvens) {
    const touchedRanks: readonly number[] =
      clueRank === ODD_RANK_CLUE ? ODD_CARD_RANKS : EVEN_CARD_RANKS;
    return touchedRanks.includes(cardRank);
  }

  if (cardRank === variant.specialRank) {
    if (variant.specialRankAllClueRanks) {
      return true;
    }

    if (variant.specialRankNoClueRanks) {
      return false;
    }

    // The rank that touches a deceptive card is contingent upon the card's suit.
    if (variant.specialRankDeceptive) {
      const deceptiveRankIndex = cardSuitIndex % variant.clueRanks.length;
      const deceptiveRank = variant.clueRanks[deceptiveRankIndex];
      return clueRank === deceptiveRank;
    }
  }

  return clueRank === cardRank;
}

export function shouldApplyClue(
  giverPlayerIndex: PlayerIndex,
  metadata: GameMetadata,
  variant: Variant,
): boolean {
  const giverCharacterName = getCharacterNameForPlayer(
    giverPlayerIndex,
    metadata.characterAssignments,
  );

  return (
    !variant.cowAndPig && !variant.duck && giverCharacterName !== "Quacker"
  );
}
