import type {
  ActionPlay,
  CardState,
  GameAction,
  GameMetadata,
  GameState,
} from "@hanabi-live/game";
import {
  canCardPossiblyBeFromCluesOnly,
  getCharacterNameForPlayer,
  getVariantById,
  isCardClued,
  isHandLocked,
} from "@hanabi-live/game";
import { includes } from "complete-common";
import { isOurSeat } from "../../ourSeat.ts";
import { SoundType } from "../../types/SoundType.ts";

/** The sound for each consecutive blind play, starting from the first. */
const BLIND_PLAY_SOUND_TYPES = [
  SoundType.Blind1,
  SoundType.Blind2,
  SoundType.Blind3,
  SoundType.Blind4,
  SoundType.Blind5,
  SoundType.Blind6,
] as const;

/** The sound for each consecutive misplay, starting from the first. */
const MISPLAY_SOUND_TYPES = [SoundType.Fail1, SoundType.Fail2] as const;

export const SOUND_TYPE_ACTIONS = [
  "clue",
  "discard",
  "gameOver",
  "misplay",
  "play",
] as const;

/**
 * Gets the sound for the latest of `count` consecutive events. Every event after the last one in
 * the list repeats its sound.
 */
function getConsecutiveSoundType(
  soundTypes: readonly SoundType[],
  count: number,
  eventName: string,
): SoundType {
  const soundType = soundTypes[Math.min(count, soundTypes.length) - 1];
  if (soundType === undefined) {
    throw new Error(
      `Failed to get the sound effect for the ${eventName} count of: ${count}`,
    );
  }
  return soundType;
}

export function getSoundType(
  previousGameState: GameState | undefined,
  gameState: GameState,
  originalAction: GameAction | undefined,
  metadata: GameMetadata,
): SoundType {
  const ourTurn = isOurSeat(gameState.turn.currentPlayerIndex, metadata);
  const standardSoundType = getStandardSoundType(ourTurn);

  if (previousGameState === undefined || originalAction === undefined) {
    return standardSoundType;
  }

  const variant = getVariantById(metadata.options.variantId);

  // In some variants, failed plays are treated as normal plays.
  const action: GameAction =
    originalAction.type === "misplay" && variant.throwItInAHole
      ? {
          ...originalAction,
          type: "play",
        }
      : originalAction;

  if (!includes(SOUND_TYPE_ACTIONS, action.type)) {
    return standardSoundType;
  }

  switch (action.type) {
    case "clue": {
      if (action.clue.type === undefined) {
        return SoundType.Quack;
      }
      if (metadata.options.detrimentalCharacters) {
        const giverCharacterName = getCharacterNameForPlayer(
          action.playerIndex,
          metadata.characterAssignments,
        );

        if (giverCharacterName === "Quacker") {
          return SoundType.Quack;
        }
      }

      if (variant.cowAndPig) {
        switch (action.clue.type) {
          case "color": {
            return SoundType.Moo;
          }

          case "rank": {
            return SoundType.Oink;
          }
        }
      }

      if (variant.duck) {
        return SoundType.Quack;
      }

      return standardSoundType;
    }

    case "misplay": {
      return getConsecutiveSoundType(
        MISPLAY_SOUND_TYPES,
        gameState.stats.numSubsequentMisplays,
        "misplay",
      );
    }

    case "discard": {
      if (
        gameState.stats.maxScore < previousGameState.stats.maxScore
        && !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const previousCardState = previousGameState.deck[action.order];
      const touchedBeforeDiscarding =
        previousCardState !== undefined && isCardClued(previousCardState);
      if (touchedBeforeDiscarding) {
        return SoundType.DiscardClued;
      }

      const nextPlayerHand = gameState.hands[action.playerIndex];
      if (
        nextPlayerHand !== undefined
        && !isHandLocked(nextPlayerHand, gameState.deck)
        && previousGameState.stats.doubleDiscardCard !== undefined
        && !metadata.hardVariant
      ) {
        const previouslyDiscardedCard =
          previousGameState.deck[previousGameState.stats.doubleDiscardCard];
        if (
          previousCardState !== undefined
          && previouslyDiscardedCard !== undefined
          && canCardPossiblyBeFromCluesOnly(
            previousCardState,
            previouslyDiscardedCard.suitIndex,
            previouslyDiscardedCard.rank,
          )
        ) {
          // A player has discarded *in* a double discard situation.
          return SoundType.DoubleDiscard;
        }
      }

      if (
        gameState.stats.doubleDiscardCard !== undefined
        && !metadata.hardVariant
      ) {
        // A player has discarded to *cause* a double discard situation.
        return SoundType.DoubleDiscardCause;
      }

      return standardSoundType;
    }

    case "gameOver": {
      if (action.endCondition !== "normal") {
        return SoundType.FinishedFail;
      }

      if (gameState.score === variant.maxScore) {
        return SoundType.FinishedPerfect;
      }

      return SoundType.FinishedSuccess;
    }

    case "play": {
      if (
        gameState.stats.maxScore < previousGameState.stats.maxScore
        && !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const cardState = gameState.deck[action.order];
      const touched = cardState !== undefined && isCardClued(cardState);
      if (!touched) {
        return getConsecutiveSoundType(
          BLIND_PLAY_SOUND_TYPES,
          gameState.stats.numSubsequentBlindPlays,
          "blind play",
        );
      }

      if (isOrderChopMove(previousGameState, action, metadata)) {
        return SoundType.OrderChopMove;
      }

      return getStandardSoundType(ourTurn);
    }
  }
}

export function getStandardSoundType(ourTurn: boolean): SoundType {
  return ourTurn ? SoundType.Us : SoundType.Other;
}

/**
 * - https://hanabi.github.io/level-3#part-1---play-order-inversion-in-the-starting-hand
 * - https://hanabi.github.io/level-3#part-2---the-fresh-1s-rule
 * - https://hanabi.github.io/level-3#part-3---the-chop-focus-exception
 * - https://hanabi.github.io/level-4/#the-order-chop-move-ocm
 */
function isOrderChopMove(
  previousGameState: GameState,
  action: ActionPlay,
  metadata: GameMetadata,
): boolean {
  const variant = getVariantById(metadata.options.variantId);

  // Do not bother trying to see if this is an Order Chop Move in certain variants, as the logic
  // could be extremely complicated.
  if (variant.upOrDown || variant.sudoku) {
    return false;
  }

  const playedCard = previousGameState.deck[action.order];
  if (playedCard === undefined || !isCandidateOneForOcm(playedCard)) {
    return false;
  }

  // Count open 1 stacks before the play. The played card might only be clued as a 1
  // (e.g. a Dark Omni 3), so adding 1 to the post-play count leaks its actual rank.
  let numOnesLeftToPlay = 0;
  for (const [suitIndex, suit] of variant.suits.entries()) {
    if (suit.reversed) {
      continue;
    }

    const playStack = previousGameState.playStacks[suitIndex];
    if (playStack !== undefined && playStack.length === 0) {
      numOnesLeftToPlay++;
    }
  }

  // We can't Order Chop Move if all of the 1s are played or there is only one 1 left to be played.
  if (numOnesLeftToPlay === 0 || numOnesLeftToPlay === 1) {
    return false;
  }

  // Find out if there are any other candidate 1s in the hand.
  const playerHand = previousGameState.hands[action.playerIndex];
  if (playerHand === undefined) {
    return false;
  }

  const candidateCards: CardState[] = [];
  for (const order of playerHand) {
    if (order === action.order) {
      // Skip the card that we already played.
      continue;
    }

    const card = previousGameState.deck[order];
    if (card !== undefined && isCandidateOneForOcm(card)) {
      candidateCards.push(card);
    }
  }

  // We can't Order Chop Move if there are no other candidate 1s in the hand.
  if (candidateCards.length === 0) {
    return false;
  }

  // Find the card that should have precedence to be played.
  candidateCards.push(playedCard);

  // Playing Multiple 1's - The Fresh 1's Rule (Part 2). Find out if there are any "fresh" 1s (e.g.
  // 1s that were not dealt to the starting hand).
  const freshCards = candidateCards.filter((card) => !card.dealtToStartingHand);
  const [firstFreshCard, ...otherFreshCards] = freshCards;
  if (firstFreshCard !== undefined) {
    // Find the newest 1.
    let newestOne = firstFreshCard;
    for (const card of otherFreshCards) {
      if (card.order > newestOne.order) {
        newestOne = card;
      }
    }
    const newestOneOrder = newestOne.order;

    // Find out if the clue that touched the newest 1 also touched a 1 that was on chop at the same
    // time.

    // Chop-Focus overrides the Fresh 1's Rule whenever both cards first received the 1 clue
    // together. The chop card itself may also be fresh, not just from the starting hand.
    const chopFocusedCard = candidateCards.find(
      (card) =>
        card.order !== newestOneOrder
        && card.firstCluedWhileOnChop === true
        && card.segmentFirstClued !== undefined
        && card.segmentFirstClued === newestOne.segmentFirstClued,
    );
    if (chopFocusedCard !== undefined) {
      return chopFocusedCard.order !== action.order;
    }

    // The Fresh 1's Rule applies.
    return newestOneOrder !== action.order;
  }

  // All of the 1s were dealt to the starting hand, so the oldest 1 has precedence.
  const candidateOrders = candidateCards.map((card) => card.order);
  const minCandidateOrder = Math.min(...candidateOrders);
  return minCandidateOrder !== action.order;
}

function isCandidateOneForOcm(card: CardState): boolean {
  return (
    // Order Chop Moves are only performed when a player plays a card that they think is a 1
    // (e.g. a card having a positive rank 1 clue on it)
    card.positiveRankClues.includes(1)
    // We can't Order Chop Move with cards that are "filled-in" to be pink cards, for example.
    && card.positiveRankClues.length === 1
    // It is technically possible to perform an Order Chop Move with two 1s that have an equal
    // number of positive color clues on them, but ignore this for simplicity.
    && card.positiveColorClues.length === 0
  );
}
