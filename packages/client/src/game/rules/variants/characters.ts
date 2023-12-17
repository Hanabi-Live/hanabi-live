import type { GameMetadata } from "@hanabi/game";
import { getCharacterNameForPlayer } from "@hanabi/game";

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
