// Functions related to the clue objects themselves: converting, getting names, etc

import { getCharacter } from '../data/gameData';
import { getCharacterIDForPlayer } from '../reducers/reducerHelpers';
import Clue, { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import { START_CARD_RANK } from '../types/constants';
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

// This mirrors the function "variantIsCardTouched()" in "variants.go"
export const touchesCard = (
  variant: Variant,
  clue: Clue,
  suitIndex: number,
  rank: number,
) => {
  const suit = variant.suits[suitIndex];

  if (clue.type === ClueType.Color) {
    if (variant.colorCluesTouchNothing) {
      return false;
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
