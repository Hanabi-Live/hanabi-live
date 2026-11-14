import { getVariantById } from "../gameData.ts";
import { MAX_STRIKES } from "../generated/protocol.ts";
import type { CardState } from "../interfaces/CardState.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import { isCardPotentiallyPlayable } from "./card.ts";
import { getClueCost } from "./clueTokens.ts";
import { getNextPlayerIndex } from "./turn.ts";

/**
 * Whether the game ends in this state, mirroring `check_end` in the server engine. (Terminations
 * and character-specific endings are decided by the server alone.) By default, a card in a hand
 * could be played when any of its possible identities is playable; `isPlayable` can decide this
 * instead.
 */
export function isGameOver(
  gameState: GameState,
  metadata: GameMetadata,
  isPlayable: (card: CardState) => boolean = (card) =>
    isCardPotentiallyPlayable(
      card,
      gameState.deck,
      gameState.playStacks,
      gameState.playStackDirections,
      gameState.playStackStarts,
      getVariantById(metadata.options.variantId),
    ),
): boolean {
  const { options } = metadata;
  const variant = getVariantById(options.variantId);
  const { turnNum, currentPlayerIndex, playOrderInverted, endTurnNum } =
    gameState.turn;
  if (currentPlayerIndex === undefined) {
    return true;
  }

  if (
    gameState.strikes.length >= MAX_STRIKES
    || ((options.speedrun || options.allOrNothing)
      && gameState.stats.maxScore < variant.maxScore)
    || (options.allOrNothing
      && gameState.hands[currentPlayerIndex]?.length === 0
      && gameState.clueTokens < getClueCost(variant))
    || gameState.score >= gameState.stats.maxScore
  ) {
    return true;
  }

  // Everyone gets one more turn after the final card is drawn. The game also ends early when none
  // of the players left to take their final turn can play a card.
  if (options.allOrNothing || endTurnNum === undefined) {
    return false;
  }

  let playerIndex: typeof currentPlayerIndex | undefined = currentPlayerIndex;
  for (
    let turn = turnNum;
    turn < endTurnNum && playerIndex !== undefined;
    turn++
  ) {
    const hand = gameState.hands[playerIndex] ?? [];
    const canPlay = hand.some((order) => {
      const card = gameState.deck[order];
      return card !== undefined && isPlayable(card);
    });
    if (canPlay) {
      return false;
    }

    playerIndex = getNextPlayerIndex(
      playerIndex,
      options.numPlayers,
      playOrderInverted,
    );
  }

  return true;
}
