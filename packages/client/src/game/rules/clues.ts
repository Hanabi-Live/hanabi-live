// Functions related to the clue objects themselves: converting, getting names, etc

import type {
  MsgClue,
  PlayerIndex,
  Rank,
  Suit,
  SuitIndex,
  Variant,
} from "@hanabi/data";
import { ClueType, START_CARD_RANK } from "@hanabi/data";
import type { GameMetadata } from "@hanabi/game";
import { getCharacterNameForPlayer } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";
import type { Clue, ColorClue, RankClue } from "../types/Clue";
import { newColorClue, newRankClue } from "../types/Clue";

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
export function touchesCard(
  variant: Variant,
  clue: Clue,
  suitIndex: SuitIndex,
  rank: Rank,
): boolean {
  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return false;
  }

  switch (clue.type) {
    case ClueType.Color: {
      return touchesCardColor(variant, clue, suit, rank);
    }

    case ClueType.Rank: {
      return touchesCardRank(variant, clue, suitIndex, suit, rank);
    }
  }
}

function touchesCardColor(
  variant: Variant,
  clue: ColorClue,
  suit: Suit,
  rank: Rank,
): boolean {
  if (variant.colorCluesTouchNothing) {
    return false;
  }

  if (suit.allClueColors) {
    return true;
  }

  if (suit.noClueColors) {
    return false;
  }

  if (variant.synesthesia && !suit.noClueRanks) {
    // A card matches if it would match a prism card, in addition to normal color matches.
    const prismColorIndex = (rank - 1) % variant.clueColors.length;
    const color = variant.clueColors[prismColorIndex];
    if (color !== undefined && clue.value.name === color.name) {
      return true;
    }
  }

  if (rank === variant.specialRank) {
    if (variant.specialRankAllClueColors) {
      return true;
    }

    if (variant.specialRankNoClueColors) {
      return false;
    }
  }

  if (suit.prism) {
    // The color that touches a prism card is contingent upon the card's rank.
    let prismColorIndex = (rank - 1) % variant.clueColors.length;

    // "START" cards count as rank 0, so they are touched by the final color.
    if (rank === START_CARD_RANK) {
      prismColorIndex = variant.clueColors.length - 1;
    }

    const prismColor = variant.clueColors[prismColorIndex];
    return prismColor !== undefined && clue.value.name === prismColor.name;
  }

  const clueColorNames = suit.clueColors.map((clueColor) => clueColor.name);
  return clueColorNames.includes(clue.value.name);
}

function touchesCardRank(
  variant: Variant,
  clue: RankClue,
  suitIndex: SuitIndex,
  suit: Suit,
  rank: Rank,
): boolean {
  if (variant.rankCluesTouchNothing) {
    return false;
  }

  if (suit.allClueRanks) {
    return true;
  }

  if (suit.noClueRanks) {
    return false;
  }

  if (variant.funnels) {
    // Rank clues in Funnels touch also all lower ranked cards.
    return rank <= clue.value;
  }

  if (variant.chimneys) {
    // Rank clues in Chimneys touch also all lower ranked cards.
    return rank >= clue.value;
  }

  // Clue ranks in Odds And Evens can only be 1 or 2.
  if (variant.oddsAndEvens) {
    if (clue.value === 1) {
      return [1, 3, 5].includes(rank);
    }

    return [2, 4].includes(rank);
  }

  if (rank === variant.specialRank) {
    if (variant.specialRankAllClueRanks) {
      return true;
    }

    if (variant.specialRankNoClueRanks) {
      return false;
    }

    // The rank that touches a deceptive card is contingent upon the card's suit.
    if (variant.specialRankDeceptive) {
      const deceptiveRank =
        variant.clueRanks[suitIndex % variant.clueRanks.length];
      return clue.value === deceptiveRank;
    }
  }

  return clue.value === rank;
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
