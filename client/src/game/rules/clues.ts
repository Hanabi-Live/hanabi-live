// Functions related to the clue objects themselves: converting, getting names, etc
/* eslint-disable import/prefer-default-export */

import { getCharacter } from '../data/gameData';
import { getCharacterIDForPlayer } from '../reducers/reducerHelpers';
import Clue, { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import MsgClue from '../types/MsgClue';
import Variant from '../types/Variant';
import * as variantRules from './variant';

export const getClueName = (
  clueType: ClueType,
  clueValue: number,
  variant: Variant,
  characterID: number | null,
) => {
  let characterName = '';
  if (characterID !== null) {
    const character = getCharacter(characterID);
    characterName = character.name;
  }

  let clueName;
  if (clueType === ClueType.Color) {
    clueName = variant.clueColors[clueValue].name;
  } else if (clueType === ClueType.Rank) {
    clueName = clueValue.toString();
  }
  if (variantRules.isCowAndPig(variant)) {
    if (clueType === ClueType.Color) {
      clueName = 'Moo';
    } else if (clueType === ClueType.Rank) {
      clueName = 'Oink';
    }
  } else if (
    variantRules.isDuck(variant)
     || characterName === 'Quacker'
  ) {
    clueName = 'Quack';
  }
  return clueName;
};

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
export const touchesCard = (
  variant: Variant,
  clue: Clue,
  suitIndex: number | null,
  rank: number | null,
) => {
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
};

export const shouldApplyClue = (
  giverIndex: number,
  metadata: GameMetadata,
  variant: Variant,
) => {
  const giverCharacterID = getCharacterIDForPlayer(
    giverIndex,
    metadata.characterAssignments,
  );
  let giverCharacterName = '';
  if (giverCharacterID !== null) {
    const giverCharacter = getCharacter(giverCharacterID);
    giverCharacterName = giverCharacter.name;
  }

  return (
    !variantRules.isCowAndPig(variant)
    && !variantRules.isDuck(variant)
    && giverCharacterName !== 'Quacker'
  );
};
