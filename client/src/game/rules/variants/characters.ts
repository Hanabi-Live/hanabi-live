/* eslint-disable import/prefer-default-export */

import { getCharacterNameForPlayer } from "../../reducers/reducerHelpers";
import GameMetadata from "../../types/GameMetadata";

export function shouldSeeSlot2CardIdentity(metadata: GameMetadata): boolean {
  if (!metadata.options.detrimentalCharacters) {
    return false;
  }
  const characterName = getCharacterNameForPlayer(
    metadata.ourPlayerIndex,
    metadata.characterAssignments,
  );
  return characterName === "Slow-Witted";
}
