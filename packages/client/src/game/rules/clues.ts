// Functions related to the clue objects themselves: converting, getting names, etc

import { START_CARD_RANK, Variant } from "@hanabi/data";
import { getCharacterNameForPlayer } from "../reducers/reducerHelpers";
import Clue, { colorClue, rankClue } from "../types/Clue";
import ClueType from "../types/ClueType";
import GameMetadata from "../types/GameMetadata";
import MsgClue from "../types/MsgClue";
import * as variantRules from "./variant";

export function getClueName(
  clueType: ClueType,
  clueValue: number,
  variant: Variant,
  characterName: string,
): string {
  if (variantRules.isCowAndPig(variant)) {
    if (clueType === ClueType.Color) {
      return "Moo";
    }

    if (clueType === ClueType.Rank) {
      return "Oink";
    }
  }

  if (variantRules.isDuck(variant) || characterName === "Quacker") {
    return "Quack";
  }

  if (variantRules.isOddsAndEvens(variant) && clueType === ClueType.Rank) {
    if (clueValue === 1) {
      return "Odd";
    }

    if (clueValue === 2) {
      return "Even";
    }
  }

  if (clueType === ClueType.Color) {
    return variant.clueColors[clueValue].name;
  }

  if (clueType === ClueType.Rank) {
    return clueValue.toString();
  }

  throw new Error("Invalid clue type.");
}

// Convert a clue from the format used by the server to the format used by the client
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export function msgClueToClue(msgClue: MsgClue, variant: Variant): Clue {
  let clueValue;
  if (msgClue.type === ClueType.Color) {
    clueValue = variant.clueColors[msgClue.value]; // This is a Color object
    return colorClue(clueValue);
  }
  if (msgClue.type === ClueType.Rank) {
    clueValue = msgClue.value;
    return rankClue(clueValue);
  }
  throw new Error('Unknown clue type given to the "msgClueToClue()" function.');
}

// This mirrors the function "variantIsCardTouched()" in "variants.go"
export function touchesCard(
  variant: Variant,
  clue: Clue,
  suitIndex: number,
  rank: number,
): boolean {
  const suit = variant.suits[suitIndex];

  if (clue.type === ClueType.Color) {
    if (variant.colorCluesTouchNothing) {
      return false;
    }

    if (variantRules.isSynesthesia(variant) && !suit.noClueRanks) {
      // A card matches if it would match a prism card, in addition to normal color matches.
      const prismColorIndex = (rank - 1) % variant.clueColors.length;
      const prismColorName = variant.clueColors[prismColorIndex].name;
      if (clue.value.name === prismColorName) {
        return true;
      }
    }

    if (suit.allClueColors) {
      return true;
    }
    if (suit.noClueColors) {
      return false;
    }

    if (rank === variant.specialRank) {
      if (variant.specialAllClueColors) {
        return true;
      }
      if (variant.specialNoClueColors) {
        return false;
      }
    }

    if (suit.prism) {
      // The color that touches a prism card is contingent upon the card's rank
      let prismColorIndex = (rank - 1) % variant.clueColors.length;
      if (rank === START_CARD_RANK) {
        // "START" cards count as rank 0, so they are touched by the final color
        prismColorIndex = variant.clueColors.length - 1;
      }
      const prismColorName = variant.clueColors[prismColorIndex].name;
      return clue.value.name === prismColorName;
    }

    return suit.clueColors.map((c) => c.name).includes(clue.value.name);
  }

  if (clue.type === ClueType.Rank) {
    if (variant.rankCluesTouchNothing) {
      return false;
    }

    if (variant.oddsAndEvens) {
      // Clue ranks in Odds and Evens can only be 1 or 2
      if (clue.value === 1) {
        return [1, 3, 5].includes(rank);
      }
      return [2, 4].includes(rank);
    }

    if (suit.allClueRanks) {
      return true;
    }

    if (suit.noClueRanks) {
      return false;
    }

    if (rank === variant.specialRank) {
      if (variant.specialAllClueRanks) {
        return true;
      }
      if (variant.specialNoClueRanks) {
        return false;
      }
      if (variant.specialDeceptive) {
        // The rank that touches a deceptive card is contingent upon the card's suit
        const deceptiveRank =
          variant.clueRanks[suitIndex % variant.clueRanks.length];
        return clue.value === deceptiveRank;
      }
    }

    return clue.value === rank;
  }

  return false;
}

export function shouldApplyClue(
  giverIndex: number,
  metadata: GameMetadata,
  variant: Variant,
): boolean {
  const giverCharacterName = getCharacterNameForPlayer(
    giverIndex,
    metadata.characterAssignments,
  );

  return (
    !variantRules.isCowAndPig(variant) &&
    !variantRules.isDuck(variant) &&
    giverCharacterName !== "Quacker"
  );
}
