// Functions related to the clue objects themselves: converting, getting names, etc.

import { assertDefined } from "complete-common";
import { START_CARD_RANK } from "../constants";
import { ClueType } from "../enums/ClueType";
import type { Color } from "../interfaces/Color";
import type { GameMetadata } from "../interfaces/GameMetadata";
import type { Suit } from "../interfaces/Suit";
import type { Variant } from "../interfaces/Variant";
import { getCharacterNameForPlayer } from "../reducers/reducerHelpers";
import type { Clue } from "../types/Clue";
import { newColorClue, newRankClue } from "../types/Clue";
import type { MsgClue } from "../types/MsgClue";
import type { PlayerIndex } from "../types/PlayerIndex";
import type { Rank } from "../types/Rank";
import type { RankClueNumber } from "../types/RankClueNumber";
import type { SuitIndex } from "../types/SuitIndex";

export function getClueName(
  clueType: ClueType,
  clueValue: number,
  variant: Variant,
  characterName: string,
): string {
  if (variant.cowAndPig) {
    switch (clueType) {
      case ClueType.Color: {
        return "Moo";
      }

      case ClueType.Rank: {
        return "Oink";
      }
    }
  }

  if (variant.duck || characterName === "Quacker") {
    return "Quack";
  }

  if (variant.oddsAndEvens && clueType === ClueType.Rank) {
    if (clueValue === 1) {
      return "Odd";
    }

    if (clueValue === 2) {
      return "Even";
    }
  }

  switch (clueType) {
    case ClueType.Color: {
      const color = variant.clueColors[clueValue];
      return color === undefined ? "Unknown" : color.name;
    }

    case ClueType.Rank: {
      return clueValue.toString();
    }
  }
}

/**
 * Convert a clue from the format used by the server to the format used by the client. On the
 * client, the color is a rich object. On the server, the color is a simple integer mapping.
 */
export function msgClueToClue(msgClue: MsgClue, variant: Variant): Clue {
  switch (msgClue.type) {
    case ClueType.Color: {
      const color = variant.clueColors[msgClue.value];
      assertDefined(
        color,
        `Failed to get the variant clue color at index: ${msgClue.value}`,
      );

      return newColorClue(color);
    }

    case ClueType.Rank: {
      const clueValue = msgClue.value;
      return newRankClue(clueValue);
    }
  }
}

/** This mirrors the function `variantIsCardTouched` in "variants.go". */
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
    case ClueType.Color: {
      return isCardTouchedByClueColor(variant, clue.value, suit, cardRank);
    }

    case ClueType.Rank: {
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

  if (cardSuit.allClueColors) {
    return true;
  }

  if (cardSuit.noClueColors) {
    return false;
  }

  if (variant.synesthesia && !cardSuit.noClueRanks) {
    // A card matches if it would match a prism card, in addition to normal color matches.
    const prismColorIndex = (cardRank - 1) % variant.clueColors.length;
    const color = variant.clueColors[prismColorIndex];
    if (color !== undefined && clueColor.name === color.name) {
      return true;
    }
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

/** The color that touches a prism card is contingent upon the card's rank. */
export function getColorForPrismCard(variant: Variant, rank: Rank): Color {
  // "START" cards count as rank 0, so they are touched by the final color.
  const prismColorIndex =
    rank === START_CARD_RANK
      ? variant.clueColors.length - 1
      : (rank - 1) % variant.clueColors.length;

  const prismColor = variant.clueColors[prismColorIndex];
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

  // Clue ranks in Odds And Evens can only be 1 or 2.
  if (variant.oddsAndEvens) {
    if (clueRank === 1) {
      return [1, 3, 5].includes(cardRank);
    }

    return [2, 4].includes(cardRank);
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
