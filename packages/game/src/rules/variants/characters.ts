import type { GameMetadata } from "../../interfaces/GameMetadata";
import { getCharacterNameForPlayer } from "../../reducers/reducerHelpers";

/**
 * In games with "Detrimental Characters", not all players may necessarily see the cards of other
 * players.
 */
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
