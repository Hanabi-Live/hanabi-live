// Miscellaneous helpers used by several reducers.

import type { PlayerIndex } from "@hanabi/data";
import { getCharacter } from "@hanabi/data";
import type { GameState } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";
import * as statsRules from "../rules/stats";

export function getEfficiency(gameState: GameState): number {
  return statsRules.getEfficiency(
    gameState.stats.cardsGotten,
    gameState.stats.potentialCluesLost,
  );
}

export function getFutureEfficiency(gameState: GameState): number | null {
  return statsRules.getFutureEfficiency(gameState);
}

export function getCharacterNameForPlayer(
  playerIndex: PlayerIndex | null,
  characterAssignments: Readonly<Array<number | null>>,
): string {
  const characterID = getCharacterIDForPlayer(
    playerIndex,
    characterAssignments,
  );

  return characterID === null ? "" : getCharacter(characterID).name;
}

function getCharacterIDForPlayer(
  playerIndex: PlayerIndex | null,
  characterAssignments: Readonly<Array<number | null>>,
) {
  if (playerIndex === null) {
    return null;
  }

  const characterID = characterAssignments[playerIndex];
  assertDefined(
    characterID,
    `The character ID for player ${playerIndex} was undefined.`,
  );

  return characterID;
}
