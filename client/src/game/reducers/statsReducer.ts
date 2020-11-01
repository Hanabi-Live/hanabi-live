// Functions for calculating running statistics such as efficiency and pace
// as a result of each action

import produce, { Draft } from "immer";
import { getCharacter, getVariant } from "../data/gameData";
import { cardRules, clueTokensRules, variantRules } from "../rules";
import * as statsRules from "../rules/stats";
import { ActionPlay, GameAction } from "../types/actions";
import CardState from "../types/CardState";
import ClueType from "../types/ClueType";
import EndCondition from "../types/EndCondition";
import GameMetadata from "../types/GameMetadata";
import GameState from "../types/GameState";
import SoundType from "../types/SoundType";
import StatsState from "../types/StatsState";
import { getCharacterIDForPlayer } from "./reducerHelpers";

const statsReducer = produce(statsReducerFunction, {} as StatsState);
export default statsReducer;

function statsReducerFunction(
  stats: Draft<StatsState>,
  action: GameAction,
  originalState: GameState,
  currentState: GameState,
  playing: boolean,
  metadata: GameMetadata,
) {
  const variant = getVariant(metadata.options.variantName);

  switch (action.type) {
    case "clue": {
      // A clue was spent
      stats.potentialCluesLost += 1;

      break;
    }

    case "strike": {
      // TODO: move this check to the play action when we have logic for knowing which cards play
      // A strike is equivalent to losing a clue
      // But don't reveal that a strike has happened to players in an ongoing "Throw It in a Hole"
      // game
      if (!variantRules.isThrowItInAHole(variant) || !playing) {
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    case "play": {
      if (
        !variantRules.isThrowItInAHole(variant) && // We don't get an extra clue in these variants
        currentState.playStacks[action.suitIndex].length === 5 && // Hard code stack length to 5
        originalState.clueTokens === currentState.clueTokens
      ) {
        // If we finished a stack while at max clues, then the extra clue is "wasted",
        // similar to what happens when the team gets a strike
        stats.potentialCluesLost += clueTokensRules.discardValue(variant);
      }

      break;
    }

    default: {
      break;
    }
  }

  // Handle double discard calculation
  if (action.type === "discard") {
    stats.doubleDiscard = statsRules.doubleDiscard(
      action.order,
      currentState,
      variant,
    );
  } else if (action.type === "play" || action.type === "clue") {
    stats.doubleDiscard = false;
  }

  // Handle max score calculation
  if (action.type === "play" || action.type === "discard") {
    stats.maxScorePerStack = statsRules.getMaxScorePerStack(
      currentState.deck,
      currentState.playStackDirections,
      variant,
    );
    stats.maxScore = stats.maxScorePerStack.reduce((a, b) => a + b, 0);
  }

  // Handle pace calculation
  const score =
    variantRules.isThrowItInAHole(variant) && playing
      ? currentState.numAttemptedCardsPlayed
      : currentState.score;
  stats.pace = statsRules.pace(
    score,
    currentState.cardsRemainingInTheDeck,
    stats.maxScore,
    metadata.options.numPlayers,
    // currentPlayerIndex will be null if the game is over
    currentState.turn.currentPlayerIndex === null,
  );
  stats.paceRisk = statsRules.paceRisk(stats.pace, metadata.options.numPlayers);

  // Handle efficiency calculation
  let cardsGotten = statsRules.cardsGotten(
    currentState.deck,
    currentState.playStacks,
    currentState.playStackDirections,
    playing,
    variant,
  );
  if (cardsGotten > stats.maxScore) {
    cardsGotten = stats.maxScore;
  }
  stats.efficiency = cardsGotten / stats.potentialCluesLost;

  if (stats.pace === null) {
    stats.futureEfficiency = null;
  } else {
    const cardsNotGotten = stats.maxScore - cardsGotten;
    const scorePerStack: number[] = Array.from(
      currentState.playStacks,
      (playStack) => playStack.length,
    );
    const cluesUsable = statsRules.maxClues(
      scorePerStack,
      stats.maxScorePerStack,
      stats.pace,
      metadata.options.numPlayers,
      clueTokensRules.discardValue(variant),
      clueTokensRules.suitValue(variant),
      currentState.clueTokens,
    );
    stats.futureEfficiency = cardsNotGotten / totalCluesUsable;
  }

  // Record the last action
  stats.lastAction = action;

  // Find out which sound effect to play (if this is an ongoing game)
  stats.soundTypeForLastAction = getSoundType(
    stats,
    action,
    originalState,
    currentState,
    metadata,
  );
}

function getSoundType(
  stats: Draft<StatsState>,
  originalAction: GameAction,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
) {
  const variant = getVariant(metadata.options.variantName);

  // In some variants, failed plays are treated as normal plays
  let action = originalAction;
  if (
    action.type === "discard" &&
    action.failed &&
    variantRules.isThrowItInAHole(variant)
  ) {
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
        const giverCharacterID = getCharacterIDForPlayer(
          action.giver,
          metadata.characterAssignments,
        );
        let giverCharacterName = "";
        if (giverCharacterID !== null) {
          const giverCharacter = getCharacter(giverCharacterID);
          giverCharacterName = giverCharacter.name;
        }

        if (giverCharacterName === "Quacker") {
          return SoundType.Quack;
        }
      }

      if (variantRules.isCowAndPig(variant)) {
        if (action.clue.type === ClueType.Color) {
          return SoundType.Moo;
        }

        if (action.clue.type === ClueType.Rank) {
          return SoundType.Oink;
        }

        throw new Error("Unknown clue type.");
      }

      if (variantRules.isDuck(variant)) {
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

      if (stats.maxScore < originalState.stats.maxScore) {
        return SoundType.Sad;
      }

      const discardedCard = originalState.deck[action.order];
      const touched = cardRules.isClued(discardedCard);
      if (touched) {
        return SoundType.DiscardClued;
      }

      const { lastAction } = originalState.stats;
      let couldBeLastDiscardedCard = true;
      if (
        lastAction !== null &&
        lastAction.type === "discard" &&
        lastAction.suitIndex !== null &&
        lastAction.rank !== null
      ) {
        couldBeLastDiscardedCard = discardedCard.possibleCardsFromClues.some(
          ([suitIndex, rank]) =>
            suitIndex === lastAction.suitIndex && rank === lastAction.rank,
        );
      }
      if (originalState.stats.doubleDiscard && couldBeLastDiscardedCard) {
        // A player has discarded *in* a double discard situation
        return SoundType.DoubleDiscard;
      }

      if (stats.doubleDiscard) {
        // A player has discarded to *cause* a double discard situation
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
      if (stats.maxScore < originalState.stats.maxScore) {
        return SoundType.Sad;
      }

      const touched = cardRules.isClued(currentState.deck[action.order]);
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

// https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#playing-multiple-1s---play-order-inversion-in-the-starting-hand-part-1
// https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#playing-multiple-1s---the-fresh-1s-rule-part-2
// https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#playing-multiple-1s---the-chop-focus-exception-part-3
// https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-order-chop-move-ocm
function isOrderChopMove(
  action: ActionPlay,
  originalState: GameState,
  currentState: GameState,
  metadata: GameMetadata,
): boolean {
  const variant = getVariant(metadata.options.variantName);

  // Don't bother trying to see if this is an Order Chop Move in an "Up or Down" variant,
  // as the logic for that is more complicated
  if (variantRules.isUpOrDown(variant)) {
    return false;
  }

  const playedCard = originalState.deck[action.order];
  if (!isCandidateOneForOCM(playedCard)) {
    return false;
  }

  // Get the number of 1's left to play on the stacks
  let numOnesLeftToPlay = 0;
  for (let i = 0; i < variant.suits.length; i++) {
    const suit = variant.suits[i];
    if (suit.reversed) {
      continue;
    }
    const playStack = currentState.playStacks[i];
    if (playStack.length === 0) {
      numOnesLeftToPlay += 1;
    }
  }

  // We can't Order Chop Move if all of the 1s are played or there is only one 1 left to be played
  if (numOnesLeftToPlay === 0 || numOnesLeftToPlay === 1) {
    return false;
  }

  // Find out if there are any other candidate 1s in the hand
  const playerHand = originalState.hands[action.playerIndex];
  const candidateCards: CardState[] = [];
  for (const order of playerHand) {
    if (order === action.order) {
      // Skip the card that we already played
      continue;
    }

    const card = originalState.deck[order];
    if (isCandidateOneForOCM(card)) {
      candidateCards.push(card);
    }
  }

  // We can't Order Chop Move if there are no other candidate 1s in the hand
  if (candidateCards.length === 0) {
    return false;
  }

  // Find the card that should have precedence to be played
  candidateCards.push(playedCard);

  // Playing Multiple 1's - The Fresh 1's Rule (Part 2)
  // Find out if there are any "fresh" 1s (e.g. 1s that were not dealt to the starting hand)
  const freshCards = candidateCards.filter((card) => !card.dealtToStartingHand);
  if (freshCards.length > 0) {
    // Find the newest 1
    let newestOneOrder = -1;
    for (const card of freshCards) {
      if (card.order > newestOneOrder) {
        newestOneOrder = card.order;
      }
    }

    // Find out if the clue that touched the newest 1 also touched a 1 that was on chop at the same
    // time
    const newestOne = originalState.deck[newestOneOrder];
    const startingHandCards = candidateCards.filter(
      (card) => card.dealtToStartingHand,
    );
    for (const startingHandCard of startingHandCards) {
      if (
        startingHandCard.segmentFirstClued === newestOne.segmentFirstClued &&
        startingHandCard.firstCluedWhileOnChop === true
      ) {
        // Playing Multiple 1's - The Chop Focus Exception (Part 3)
        // They were clued at the same time and the card in the starting was on chop,
        // so the Chop Focus Exception applies
        return startingHandCard.order !== action.order;
      }
    }

    // The Fresh 1's Rule applies
    return newestOneOrder !== action.order;
  }

  // All of the 1s were dealt to the starting hand, so the oldest 1 has precedence
  let lowestOrder = 999;
  for (const card of candidateCards) {
    if (card.order < lowestOrder) {
      lowestOrder = card.order;
    }
  }
  return lowestOrder !== action.order;
}

const isCandidateOneForOCM = (card: CardState) =>
  // Order Chop Moves are only performed when a player plays a card that they think is a 1
  // (e.g. a card having a positive rank 1 clue on it)
  card.positiveRankClues.includes(1) &&
  // We can't Order Chop Move with cards that are "filled-in" to be pink cards, for example
  card.positiveRankClues.length === 1 &&
  // It is technically possible to perform an Order Chop Move with two 1s that have an equal
  // number of positive color clues on them, but ignore this for simplicity
  card.positiveColorClues.length === 0;
