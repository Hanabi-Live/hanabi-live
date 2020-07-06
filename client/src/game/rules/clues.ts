/* eslint-disable import/prefer-default-export */
// Functions related to the clue objects themselves: converting, getting names, etc

import { getCharacter } from '../data/gameData';
import ClueType from '../types/ClueType';
import { StateClue } from '../types/GameState';
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
