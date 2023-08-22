import { getVariant } from "@hanabi/data";
import type { Draft } from "immer";
import * as cardRules from "../rules/card";
import * as handRules from "../rules/hand";
import type { CardState } from "../types/CardState";
import { ClueType } from "../types/ClueType";
import { EndCondition } from "../types/EndCondition";
import type { GameMetadata } from "../types/GameMetadata";
import type { GameState } from "../types/GameState";
import { SoundType } from "../types/SoundType";
import type { StatsState } from "../types/StatsState";
import type { ActionPlay, GameAction } from "../types/actions";
import { getCharacterNameForPlayer } from "./reducerHelpers";

export function getSoundType(
  stats: Draft<StatsState>,
  originalAction: GameAction,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
): SoundType {
  const variant = getVariant(metadata.options.variantName);

  // In some variants, failed plays are treated as normal plays.
  let action = originalAction;
  if (action.type === "discard" && action.failed && variant.throwItInAHole) {
    action = {
      type: "play",
      playerIndex: action.playerIndex,
      order: action.order,
      suitIndex: action.suitIndex,
      rank: action.rank,
    };
  }

  switch (action.type) {
    case "clue": {
      if (metadata.options.detrimentalCharacters) {
        const giverCharacterName = getCharacterNameForPlayer(
          action.giver,
          metadata.characterAssignments,
        );

        if (giverCharacterName === "Quacker") {
          return SoundType.Quack;
        }
      }

      if (variant.cowAndPig) {
        switch (action.clue.type) {
          case ClueType.Color: {
            return SoundType.Moo;
          }

          case ClueType.Rank: {
            return SoundType.Oink;
          }
        }
      }

      if (variant.duck) {
        return SoundType.Quack;
      }

      return SoundType.Standard;
    }

    case "discard": {
      if (action.failed) {
        if (stats.soundTypeForLastAction === SoundType.Fail1) {
          return SoundType.Fail2;
        }

        return SoundType.Fail1;
      }

      if (
        stats.maxScore < originalState.stats.maxScore &&
        !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const discardedCard = originalState.deck[action.order];
      const touched =
        discardedCard !== undefined && cardRules.isClued(discardedCard);
      if (touched) {
        return SoundType.DiscardClued;
      }

      const nextPlayerHand = currentState.hands[action.playerIndex];
      if (
        originalState.stats.doubleDiscard !== null &&
        !metadata.hardVariant &&
        nextPlayerHand !== undefined &&
        !handRules.isLocked(nextPlayerHand, currentState.deck)
      ) {
        const previouslyDiscardedCard =
          originalState.deck[originalState.stats.doubleDiscard];
        if (
          discardedCard !== undefined &&
          previouslyDiscardedCard !== undefined &&
          cardRules.canPossiblyBeFromCluesOnly(
            discardedCard,
            previouslyDiscardedCard.suitIndex,
            previouslyDiscardedCard.rank,
          )
        ) {
          // A player has discarded *in* a double discard situation.
          return SoundType.DoubleDiscard;
        }
      }

      if (stats.doubleDiscard !== null && !metadata.hardVariant) {
        // A player has discarded to *cause* a double discard situation.
        return SoundType.DoubleDiscardCause;
      }

      return SoundType.Standard;
    }

    case "gameOver": {
      if (action.endCondition > EndCondition.Normal) {
        return SoundType.FinishedFail;
      }

      if (currentState.score === variant.maxScore) {
        return SoundType.FinishedPerfect;
      }

      return SoundType.FinishedSuccess;
    }

    case "play": {
      if (
        stats.maxScore < originalState.stats.maxScore &&
        !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const card = currentState.deck[action.order];
      const touched = card !== undefined && cardRules.isClued(card);
      if (!touched) {
        if (stats.soundTypeForLastAction === SoundType.Blind1) {
          return SoundType.Blind2;
        }

        if (stats.soundTypeForLastAction === SoundType.Blind2) {
          return SoundType.Blind3;
        }

        if (stats.soundTypeForLastAction === SoundType.Blind3) {
          return SoundType.Blind4;
        }

        if (stats.soundTypeForLastAction === SoundType.Blind4) {
          return SoundType.Blind5;
        }

        if (stats.soundTypeForLastAction === SoundType.Blind5) {
          return SoundType.Blind6;
        }

        return SoundType.Blind1;
      }

      if (isOrderChopMove(action, originalState, currentState, metadata)) {
        return SoundType.OneOutOfOrder;
      }

      return SoundType.Standard;
    }

    default: {
      // No change
      return stats.soundTypeForLastAction;
    }
  }
}

/**
 * https://hanabi.github.io/docs/level_2/#playing-multiple-1s---play-order-inversion-in-the-starting-hand-part-1
 * https://hanabi.github.io/docs/level_3/#playing-multiple-1s---the-fresh-1s-rule-part-2
 * https://hanabi.github.io/docs/level_3/#playing-multiple-1s---the-chop-focus-exception-part-3
 * https://hanabi.github.io/docs/level_5/#the-order-chop-move-ocm
 */
function isOrderChopMove(
  action: ActionPlay,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
): boolean {
  const variant = getVariant(metadata.options.variantName);

  // Do not bother trying to see if this is an Order Chop Move in certain variants, as the logic
  // could be extremely complicated.
  if (variant.upOrDown || variant.sudoku) {
    return false;
  }

  const playedCard = originalState.deck[action.order];
  if (playedCard === undefined) {
    return false;
  }

  if (!isCandidateOneForOCM(playedCard)) {
    return false;
  }

  // Get the number of 1's left to play on the stacks.
  let numOnesLeftToPlay = 0;
  for (const [i, suit] of variant.suits.entries()) {
    if (suit.reversed) {
      continue;
    }

    const playStack = currentState.playStacks[i];
    if (playStack !== undefined && playStack.length === 0) {
      numOnesLeftToPlay++;
    }
  }

  // We can't Order Chop Move if all of the 1s are played or there is only one 1 left to be played.
  if (numOnesLeftToPlay === 0 || numOnesLeftToPlay === 1) {
    return false;
  }

  // Find out if there are any other candidate 1s in the hand.
  const playerHand = originalState.hands[action.playerIndex];
  if (playerHand === undefined) {
    return false;
  }

  const candidateCards: CardState[] = [];
  for (const order of playerHand) {
    if (order === action.order) {
      // Skip the card that we already played.
      continue;
    }

    const card = originalState.deck[order];
    if (card !== undefined && isCandidateOneForOCM(card)) {
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
  if (freshCards.length > 0) {
    // Find the newest 1.
    let newestOneOrder = -1;
    for (const card of freshCards) {
      if (card.order > newestOneOrder) {
        newestOneOrder = card.order;
      }
    }

    // Find out if the clue that touched the newest 1 also touched a 1 that was on chop at the same
    // time.
    const newestOne = originalState.deck[newestOneOrder];
    if (newestOne === undefined) {
      return false;
    }

    const startingHandCards = candidateCards.filter(
      (card) => card.dealtToStartingHand,
    );
    for (const startingHandCard of startingHandCards) {
      if (
        startingHandCard.segmentFirstClued === newestOne.segmentFirstClued &&
        startingHandCard.firstCluedWhileOnChop === true
      ) {
        // Playing Multiple 1's - The Chop Focus Exception (Part 3). They were clued at the same
        // time and the card in the starting was on chop, so the Chop Focus Exception applies.
        return startingHandCard.order !== action.order;
      }
    }

    // The Fresh 1's Rule applies.
    return newestOneOrder !== action.order;
  }

  // All of the 1s were dealt to the starting hand, so the oldest 1 has precedence.
  const candidateOrders = candidateCards.map((card) => card.order);
  const minCandidateOrder = Math.min(...candidateOrders);
  return minCandidateOrder !== action.order;
}

function isCandidateOneForOCM(card: CardState): boolean {
  return (
    // Order Chop Moves are only performed when a player plays a card that they think is a 1
    // (e.g. a card having a positive rank 1 clue on it)
    card.positiveRankClues.includes(1) &&
    // We can't Order Chop Move with cards that are "filled-in" to be pink cards, for example.
    card.positiveRankClues.length === 1 &&
    // It is technically possible to perform an Order Chop Move with two 1s that have an equal
    // number of positive color clues on them, but ignore this for simplicity.
    card.positiveColorClues.length === 0
  );
}
