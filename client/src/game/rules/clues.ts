// Functions related to the clue objects themselves: converting, getting names, etc
/* eslint-disable import/prefer-default-export */

import { getCharacter } from '../data/gameData';
import Clue, { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import { StateClue } from '../types/GameState';
import MsgClue from '../types/MsgClue';
import Variant from '../types/Variant';
import * as variantRules from './variant';

export function getClueName(clue: StateClue, variant: Variant, characterID: number | null) {
  let characterName = '';
  if (characterID !== null) {
    const character = getCharacter(characterID);
    characterName = character.name;
  }

  let clueName;
  if (clue.type === ClueType.Color) {
    clueName = variant.clueColors[clue.value].name;
  } else if (clue.type === ClueType.Rank) {
    clueName = clue.value.toString();
  }
  if (variantRules.isCowAndPig(variant)) {
    if (clue.type === ClueType.Color) {
      clueName = 'Moo';
    } else if (clue.type === ClueType.Rank) {
      clueName = 'Oink';
    }
  } else if (
    variantRules.isDuck(variant)
     || characterName === 'Quacker'
  ) {
    clueName = 'Quack';
  }
  return clueName;
}

// Convert a clue from the format used by the server to the format used by the client
// On the client, the color is a rich object
// On the server, the color is a simple integer mapping
export const msgClueToClue = (msgClue: MsgClue, variant: Variant) => {
  let clueValue;
  if (msgClue.type === ClueType.Color) {
    clueValue = variant.clueColors[msgClue.value]; // This is a Color object
    return colorClue(clueValue);
  } if (msgClue.type === ClueType.Rank) {
    clueValue = msgClue.value;
    return rankClue(clueValue);
  }
  throw new Error('Unknown clue type given to the "msgClueToClue()" function.');
};

// This mirrors the function "variantIsCardTouched" in "variants.go"
export function touchesCard(
  variant: Variant,
  clue: Clue,
  suitIndex: number | null,
  rank: number | null,
) {
  // Some detrimental characters are not able to see other people's hands
  if (suitIndex === null) {
    return false;
  }

  const suitObject = variant.suits[suitIndex];

  if (clue.type === ClueType.Color) {
    if (variant.colorCluesTouchNothing) {
      return false;
    }

    if (suitObject.allClueColors) {
      return true;
    }
    if (suitObject.noClueColors) {
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

    return suitObject.clueColors.map((c) => c.name).includes(clue.value.name);
  }

  if (clue.type === ClueType.Rank) {
    if (variant.rankCluesTouchNothing) {
      return false;
    }

    if (suitObject.allClueRanks) {
      return true;
    }
    if (suitObject.noClueRanks) {
      return false;
    }

    if (rank === variant.specialRank) {
      if (variant.specialAllClueRanks) {
        return true;
      }
      if (variant.specialNoClueRanks) {
        return false;
      }
    }

    return clue.value === rank;
  }

  return false;
}
