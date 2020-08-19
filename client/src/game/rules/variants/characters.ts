/* eslint-disable import/prefer-default-export */

import { getCharacter } from '../../data/gameData';
import { getCharacterIDForPlayer } from '../../reducers/reducerHelpers';
import GameMetadata from '../../types/GameMetadata';

export const shouldSeeSlot2CardIdentity = (metadata: GameMetadata) => {
  if (!metadata.options.detrimentalCharacters) {
    return false;
  }
  const ourCharacterID = getCharacterIDForPlayer(
    metadata.ourPlayerIndex,
    metadata.characterAssignments,
  );
  if (ourCharacterID === null) {
    return false;
  }
  const ourCharacter = getCharacter(ourCharacterID);
  return ourCharacter.name === 'Slow-Witted';
};
