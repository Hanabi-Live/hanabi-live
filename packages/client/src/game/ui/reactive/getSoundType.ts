import { getVariant } from "@hanabi/data";
import type { CardState, GameState } from "@hanabi/game";
import { ClueType, EndCondition } from "@hanabi/game";
import { includes } from "@hanabi/utils";
import { getCharacterNameForPlayer } from "../../reducers/reducerHelpers";
import * as cardRules from "../../rules/card";
import * as handRules from "../../rules/hand";
import type { GameMetadata } from "../../types/GameMetadata";
import { SoundType } from "../../types/SoundType";
import type {
  ActionClue,
  ActionDiscard,
  ActionGameOver,
  ActionPlay,
  GameAction,
} from "../../types/actions";
import { globals } from "../UIGlobals";

export const SOUND_TYPE_ACTIONS = [
  "clue",
  "discard",
  "gameOver",
  "play",
] as const;

export function getSoundType(
  previousGameState: GameState | undefined,
  gameState: GameState,
  originalAction: GameAction | undefined,
  metadata: GameMetadata,
): SoundType {
  if (previousGameState === undefined || originalAction === undefined) {
    return SoundType.Standard;
  }

  const variant = getVariant(globals.metadata.options.variantName);

  // In some variants, failed plays are treated as normal plays.
  const action: GameAction =
    originalAction.type === "discard" &&
    originalAction.failed &&
    variant.throwItInAHole
      ? {
          ...originalAction,
          type: "play",
        }
      : originalAction;

  if (!includes(SOUND_TYPE_ACTIONS, action.type)) {
    return SoundType.Standard;
  }

  const actionType = action.type as (typeof SOUND_TYPE_ACTIONS)[number];

  switch (actionType) {
    case "clue": {
      const actionClue = action as ActionClue;

      if (metadata.options.detrimentalCharacters) {
        const giverCharacterName = getCharacterNameForPlayer(
          actionClue.giver,
          metadata.characterAssignments,
        );

        if (giverCharacterName === "Quacker") {
          return SoundType.Quack;
        }
      }

      if (variant.cowAndPig) {
        switch (actionClue.clue.type) {
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
      const actionDiscard = action as ActionDiscard;

      if (actionDiscard.failed) {
        return gameState.stats.numSubsequentMisplays === 2
          ? SoundType.Fail2
          : SoundType.Fail1;
      }

      if (
        gameState.stats.maxScore < previousGameState.stats.maxScore &&
        !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const discardedCard = previousGameState.deck[actionDiscard.order];
      const touched =
        discardedCard !== undefined && cardRules.isCardClued(discardedCard);
      if (touched) {
        return SoundType.DiscardClued;
      }

      const nextPlayerHand = gameState.hands[actionDiscard.playerIndex];
      if (
        nextPlayerHand !== undefined &&
        !handRules.isLocked(nextPlayerHand, gameState.deck) &&
        previousGameState.stats.doubleDiscard !== null &&
        !metadata.hardVariant
      ) {
        const previouslyDiscardedCard =
          previousGameState.deck[previousGameState.stats.doubleDiscard];
        if (
          discardedCard !== undefined &&
          previouslyDiscardedCard !== undefined &&
          cardRules.canCardPossiblyBeFromCluesOnly(
            discardedCard,
            previouslyDiscardedCard.suitIndex,
            previouslyDiscardedCard.rank,
          )
        ) {
          // A player has discarded *in* a double discard situation.
          return SoundType.DoubleDiscard;
        }
      }

      if (gameState.stats.doubleDiscard !== null && !metadata.hardVariant) {
        // A player has discarded to *cause* a double discard situation.
        return SoundType.DoubleDiscardCause;
      }

      return SoundType.Standard;
    }

    case "gameOver": {
      const actionGameOver = action as ActionGameOver;

      if (actionGameOver.endCondition > EndCondition.Normal) {
        return SoundType.FinishedFail;
      }

      if (gameState.score === variant.maxScore) {
        return SoundType.FinishedPerfect;
      }

      return SoundType.FinishedSuccess;
    }

    case "play": {
      const actionPlay = action as ActionPlay;

      if (
        gameState.stats.maxScore < previousGameState.stats.maxScore &&
        !variant.throwItInAHole
      ) {
        return SoundType.Sad;
      }

      const card = gameState.deck[actionPlay.order];
      const touched = card !== undefined && cardRules.isCardClued(card);
      if (!touched) {
        switch (gameState.stats.numSubsequentBlindPlays) {
          case 1: {
            return SoundType.Blind1;
          }

          case 2: {
            return SoundType.Blind2;
          }

          case 3: {
            return SoundType.Blind3;
          }

          case 4: {
            return SoundType.Blind4;
          }

          case 5: {
            return SoundType.Blind5;
          }

          case 6: {
            return SoundType.Blind6;
          }

          default: {
            if (gameState.stats.numSubsequentBlindPlays > 6) {
              return SoundType.Blind6;
            }

            throw new Error(
              `Failed to get the sound effect for the blind play count of: ${gameState.stats.numSubsequentBlindPlays}`,
            );
          }
        }
      }

      if (isOrderChopMove(previousGameState, gameState, actionPlay, metadata)) {
        return SoundType.OrderChopMove;
      }

      return SoundType.Standard;
    }
  }
}

/**
 * https://hanabi.github.io/level_2/#playing-multiple-1s---play-order-inversion-in-the-starting-hand-part-1
 * https://hanabi.github.io/level_3/#playing-multiple-1s---the-fresh-1s-rule-part-2
 * https://hanabi.github.io/level_3/#playing-multiple-1s---the-chop-focus-exception-part-3
 * https://hanabi.github.io/level_5/#the-order-chop-move-ocm
 */
function isOrderChopMove(
  previousGameState: GameState,
  gameState: GameState,
  action: ActionPlay,
  metadata: GameMetadata,
): boolean {
  const variant = getVariant(metadata.options.variantName);

  // Do not bother trying to see if this is an Order Chop Move in certain variants, as the logic
  // could be extremely complicated.
  if (variant.upOrDown || variant.sudoku) {
    return false;
  }

  const playedCard = previousGameState.deck[action.order];
  if (playedCard === undefined) {
    return false;
  }

  if (!isCandidateOneForOCM(playedCard)) {
    return false;
  }

  // Get the number of 1's left to play on the stacks.
  let numOnesLeftToPlay = 0;
  for (const [suitIndex, suit] of variant.suits.entries()) {
    if (suit.reversed) {
      continue;
    }

    const playStack = gameState.playStacks[suitIndex];
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
    const newestOne = previousGameState.deck[newestOneOrder];
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
