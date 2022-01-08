// Functions related to the clue objects themselves: converting, getting names, etc

import { getCharacterNameForPlayer } from "../reducers/reducerHelpers";
import Clue, { colorClue, rankClue } from "../types/Clue";
import ClueType from "../types/ClueType";
import { START_CARD_RANK } from "../types/constants";
import GameMetadata from "../types/GameMetadata";
import MsgClue from "../types/MsgClue";
import Variant from "../types/Variant";
import * as variantRules from "./variant";

export function getClueName(
  clueType: ClueType,
  clueValue: number,
  variant: Variant,
  characterName: string,
): string {
  let clueName: string;
  if (clueType === ClueType.Color) {
    clueName = variant.clueColors[clueValue].name;
  } else if (clueType === ClueType.Rank) {
    clueName = clueValue.toString();
  } else {
    throw new Error("Invalid clue type.");
  }
  if (variantRules.isCowAndPig(variant)) {
    if (clueType === ClueType.Color) {
      clueName = "Moo";
    } else if (clueType === ClueType.Rank) {
      clueName = "Oink";
    }
  } else if (variantRules.isDuck(variant) || characterName === "Quacker") {
    clueName = "Quack";
  }
  return clueName;
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
