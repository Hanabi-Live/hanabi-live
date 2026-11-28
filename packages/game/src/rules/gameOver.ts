import { getVariantById } from "../gameData.ts";
import { MAX_STRIKES } from "../generated/protocol.ts";
import type { CardState } from "../interfaces/CardState.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { GameState } from "../interfaces/GameState.ts";
import type { Clue } from "../types/Clue.ts";
import { newColorClue, newRankClue } from "../types/Clue.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type { SuitRankTuple } from "../types/SuitRankTuple.ts";
import { isCardPotentiallyNextOnPlayStack } from "./card.ts";
import { getClueCost } from "./clueTokens.ts";
import { isCardTouchedByClue } from "./clues.ts";
import { getNextPlayerIndex } from "./turn.ts";

/**
 * Whether the game ends in this state, mirroring `check_end` in the server engine. (Terminations
 * and character-specific endings are decided by the server alone.) By default, a card in a hand
 * could be played when any of its possible identities is the next card of its play stack;
 * `isPlayable` can decide this instead.
 */
export function isGameOver(
  gameState: GameState,
  metadata: GameMetadata,
  isPlayable: (card: CardState) => boolean = (card) =>
    isCardPotentiallyNextOnPlayStack(
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
      && !hasLegalClue(gameState, metadata, currentPlayerIndex))
    || gameState.score >= gameState.stats.maxScore
  ) {
    return true;
  }

  // Everyone gets one more turn after the final card is drawn. The game also ends early when none
  // of the players left to take their final turn can play a card.
  if (endTurnNum === undefined || options.allOrNothing) {
    return false;
  }

  let playerIndex: typeof currentPlayerIndex | undefined = currentPlayerIndex;
  for (
    let turn = turnNum;
    playerIndex !== undefined && turn < endTurnNum;
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

/**
 * Whether the player can give a clue, mirroring the clue checks of `validate_action` in the server
 * engine. A card that the state does not know could be any of its possible identities.
 */
function hasLegalClue(
  gameState: GameState,
  metadata: GameMetadata,
  giverIndex: PlayerIndex,
): boolean {
  const { options } = metadata;
  const variant = getVariantById(options.variantId);
  if (gameState.clueTokens < getClueCost(variant)) {
    return false;
  }

  const lastClueType = gameState.clues.at(-1)?.type;
  const clues: readonly Clue[] = [
    ...variant.clueColors.map((color) => newColorClue(color)),
    ...variant.clueRanks.map((rank) => newRankClue(rank)),
  ];

  return clues.some((clue) => {
    if (variant.alternatingClues && clue.type === lastClueType) {
      return false;
    }

    const touchesNothing =
      clue.type === "color"
        ? variant.colorCluesTouchNothing
        : variant.rankCluesTouchNothing;
    if (touchesNothing || options.emptyClues) {
      return true;
    }

    return gameState.hands.some(
      (hand, playerIndex) =>
        playerIndex !== giverIndex
        && hand.some((order) => {
          const card = gameState.deck[order];
          if (card === undefined) {
            return false;
          }

          const identities: readonly SuitRankTuple[] =
            card.suitIndex === undefined || card.rank === undefined
              ? card.possibleCards
              : [[card.suitIndex, card.rank]];
          return identities.some(([suitIndex, rank]) =>
            isCardTouchedByClue(variant, clue, suitIndex, rank),
          );
        }),
    );
  });
}
