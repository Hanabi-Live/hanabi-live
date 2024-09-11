// Functions to calculate game stats such as pace and efficiency.

/* eslint-disable unicorn/no-null */

import type { Tuple } from "complete-common";
import { assertNotNull, newArray, sumArray } from "complete-common";
import { MAX_CLUE_NUM } from "../constants";
import { PaceRisk } from "../enums/PaceRisk";
import type { CardNote } from "../interfaces/CardNote";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import type { Variant } from "../interfaces/Variant";
import type { CardOrder } from "../types/CardOrder";
import type { NumPlayers } from "../types/NumPlayers";
import type { NumSuits } from "../types/NumSuits";
import { isAllCardPossibilitiesTrash, isCardNeededForMaxScore } from "./card";
import { isCardClued, isCardInPlayerHand } from "./cardState";
import {
  getDiscardClueTokenValue,
  getSuitCompleteClueTokenValue,
} from "./clueTokens";
import {
  getNumCopiesOfCard,
  getNumDiscardedCopiesOfCard,
  getTotalCardsInDeck,
} from "./deck";
import { isHandLocked } from "./hand";
import { reversibleGetMaxScorePerStack } from "./variants/reversible";
import { sudokuGetMaxScorePerStack } from "./variants/sudoku";

export function getMaxScorePerStack(
  deck: readonly CardState[],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): Tuple<number, NumSuits> {
  // Sudoku-variants are quite complicated, since we need to solve an assignment problem for these.
  if (variant.sudoku) {
    return sudokuGetMaxScorePerStack(deck, playStackStarts, variant);
  }

  // This handles the maximum scores in Reversed or "Up Or Down" variants.
  return reversibleGetMaxScorePerStack(deck, playStackDirections, variant);
}

function getMaxDiscardsBeforeFinalRound(
  cardsToPlay: number,
  deckSize: number,
  endGameLength: number,
): number {
  if (cardsToPlay <= endGameLength + 1) {
    return deckSize - 1;
  }

  if (cardsToPlay <= endGameLength + deckSize) {
    return endGameLength + deckSize - cardsToPlay;
  }

  return 0;
}

function getMaxPlaysDuringFinalRound(
  cardsToPlay: number,
  endGameLength: number,
): number {
  if (cardsToPlay < endGameLength + 1) {
    return cardsToPlay;
  }

  return endGameLength + 1;
}

function getMaxPlays(
  cardsToPlay: number,
  deckSize: number,
  endGameLength: number,
): number {
  if (cardsToPlay <= endGameLength + deckSize) {
    return cardsToPlay;
  }

  return endGameLength + deckSize;
}

/** @returns The number of discards that can happen while still getting the maximum score. */
export function getPace(
  score: number,
  deckSize: number,
  maxScore: number,
  endGameLength: number,
  gameOver: boolean,
): number | null {
  if (gameOver) {
    return null;
  }

  if (deckSize <= 0) {
    return null;
  }

  // The formula for pace was derived by Libster.
  const adjustedScorePlusDeck = score + deckSize - maxScore;
  return adjustedScorePlusDeck + endGameLength;
}

/** @returns A measure of how risky a discard would be right now, using different heuristics. */
export function getPaceRisk(
  currentPace: number | null,
  numPlayers: NumPlayers,
): PaceRisk {
  if (currentPace === null) {
    return PaceRisk.Low;
  }

  if (currentPace <= 0) {
    return PaceRisk.Zero;
  }

  // Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
  // number of players.
  if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
    return PaceRisk.High;
  }

  // Formula derived by Hyphen-ated; a conservative estimate of "End-Game" that does not account for
  // the number of players.
  if (currentPace - numPlayers < 0) {
    return PaceRisk.Medium;
  }

  return PaceRisk.Low;
}

export function getStartingDeckSize(
  numPlayers: NumPlayers,
  cardsPerHand: number,
  variant: Variant,
): number {
  const totalCardsInDeck = getTotalCardsInDeck(variant);
  const initialCardsDrawn = cardsPerHand * numPlayers;
  return totalCardsInDeck - initialCardsDrawn;
}

/**
 * Calculate the starting pace with the following formula:
 *
 *  ```text
 *  total cards in the deck
 *  + number of turns in the final round
 *  - (number of cards in a player's hand * number of players)
 *  - (stackSize * number of suits)
 *  ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
export function getStartingPace(
  deckSize: number,
  maxScore: number,
  endGameLength: number,
): number {
  return endGameLength + deckSize - maxScore;
}

export function getCardsGotten(
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  playing: boolean,
  shadowing: boolean,
  maxScore: number,
  variant: Variant,
): number {
  let currentCardsGotten = 0;

  // Go through the deck and count the cards that are gotten.
  for (const cardState of deck) {
    if (
      cardState.location === "playStack" ||
      (cardState.location === "discard" &&
        cardState.isMisplayed &&
        variant.throwItInAHole &&
        (playing || shadowing))
    ) {
      // A card is considered to be gotten if it is already played (and failed discards count as
      // played for the purposes of "Throw It in a Hole" variants).
      currentCardsGotten++;
    } else if (
      isCardInPlayerHand(cardState) &&
      isCardClued(cardState) &&
      !isAllCardPossibilitiesTrash(
        cardState,
        deck,
        playStacks,
        playStackDirections,
        playStackStarts,
        variant,
        false,
      )
    ) {
      // Clued cards in player's hands are considered to be gotten, since they will eventually be
      // played from Good Touch Principle (unless the card is globally known to be trash).
      currentCardsGotten++;
    }
  }

  if (currentCardsGotten > maxScore) {
    currentCardsGotten = maxScore;
  }

  return currentCardsGotten;
}

/** @returns The number of cards that are only gotten by notes and are not gotten by real clues. */
export function getCardsGottenByNotes(
  deck: readonly CardState[],
  playStacks: GameState["playStacks"],
  playStackDirections: GameState["playStackDirections"],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
  notes: readonly CardNote[],
): number {
  let numCardsGottenByNotes = 0;

  for (const [i, cardState] of deck.entries()) {
    const order = i as CardOrder;

    if (
      isCardInPlayerHand(cardState) &&
      !isAllCardPossibilitiesTrash(
        cardState,
        deck,
        playStacks,
        playStackDirections,
        playStackStarts,
        variant,
        false,
      )
    ) {
      const adjustmentFromThisCard = getCardsGottenByNotesAdjustment(
        notes,
        order,
        cardState,
      );
      numCardsGottenByNotes += adjustmentFromThisCard;
    }
  }

  return numCardsGottenByNotes;
}

function getCardsGottenByNotesAdjustment(
  notes: readonly CardNote[],
  order: CardOrder,
  cardState: CardState,
): number {
  const note = notes[order];
  if (!note) {
    return 0;
  }

  const isCluedForReal = isCardClued(cardState);
  if (isCluedForReal && (note.unclued || note.knownTrash)) {
    return -1;
  }

  if (isCluedForReal) {
    return 0;
  }

  const isCluedByNotes =
    (note.clued || note.finessed) && !note.unclued && !note.knownTrash;
  if (isCluedByNotes) {
    return 1;
  }

  return 0;
}

/** @returns The minimum amount of efficiency needed in order to win this variant. */
export function getMinEfficiency(
  numPlayers: NumPlayers,
  endGameLength: number,
  variant: Variant,
  cardsPerHand: number,
): number {
  // First, calculate the starting pace:
  const deckSize = getStartingDeckSize(numPlayers, cardsPerHand, variant);

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:

  // `max score / maximum number of clues that can be given before the game ends`
  const { maxScore } = variant;
  const totalClues = getStartingCluesUsable(endGameLength, deckSize, variant);

  return maxScore / totalClues;
}

/**
 * @returns The max number of clues that can be spent while getting the max possible score from a
 *          given game state onward (not accounting for the locations of playable cards).
 */
export function getCluesStillUsableNotRounded(
  score: number,
  scorePerStack: readonly number[],
  maxScorePerStack: readonly number[],
  stackSize: number,
  deckSize: number,
  endGameLength: number,
  discardClueTokenValue: number,
  suitCompleteClueTokenValue: number,
  currentClues: number,
): number | null {
  if (scorePerStack.length !== maxScorePerStack.length) {
    throw new Error(
      "Failed to calculate efficiency: scorePerStack must have the same length as maxScorePerStack.",
    );
  }

  // We want to discard as many times as possible while still getting a max score as long as
  // discardClueTokenValue >= suitCompleteClueTokenValue (which is currently true for all variants).
  if (discardClueTokenValue < suitCompleteClueTokenValue) {
    throw new Error(
      "Cannot calculate efficiency in variants where discarding gives fewer clues than completing suits.",
    );
  }

  if (deckSize <= 0) {
    return null;
  }

  const maxScore = sumArray(maxScorePerStack);
  const missingScore = maxScore - score;

  const maxDiscardsBeforeFinalRound = getMaxDiscardsBeforeFinalRound(
    missingScore,
    deckSize,
    endGameLength,
  );

  const cluesFromDiscards = maxDiscardsBeforeFinalRound * discardClueTokenValue;

  let cluesFromSuits = 0;
  if (suitCompleteClueTokenValue > 0) {
    // Compute how many suits we can complete before the final round.
    const playsDuringFinalRound = getMaxPlaysDuringFinalRound(
      missingScore,
      endGameLength,
    );
    const minPlaysBeforeFinalRound =
      getMaxPlays(missingScore, deckSize, endGameLength) -
      playsDuringFinalRound;
    const missingCardsPerCompletableSuit: number[] = [];

    for (const [suitIndex, stackScore] of scorePerStack.entries()) {
      const stackMaxScore = maxScorePerStack[suitIndex];
      if (stackMaxScore === stackSize && stackScore < stackSize) {
        missingCardsPerCompletableSuit.push(stackMaxScore - stackScore);
      }
    }

    missingCardsPerCompletableSuit.sort((a, b) => a - b);

    let cardsPlayed = 0;
    let suitsCompletedBeforeFinalRound = 0;

    for (const missingCardsInSuit of missingCardsPerCompletableSuit) {
      if (cardsPlayed + missingCardsInSuit > minPlaysBeforeFinalRound) {
        break;
      }

      cardsPlayed += missingCardsInSuit;
      suitsCompletedBeforeFinalRound++;
    }

    cluesFromSuits =
      suitsCompletedBeforeFinalRound * suitCompleteClueTokenValue;
  }

  return cluesFromDiscards + cluesFromSuits + currentClues;
}

export function getCluesStillUsable(
  score: number,
  scorePerStack: readonly number[],
  maxScorePerStack: readonly number[],
  stackSize: number,
  deckSize: number,
  endGameLength: number,
  discardClueTokenValue: number,
  suitCompleteClueTokenValue: number,
  currentClues: number,
): number | null {
  const result = getCluesStillUsableNotRounded(
    score,
    scorePerStack,
    maxScorePerStack,
    stackSize,
    deckSize,
    endGameLength,
    discardClueTokenValue,
    suitCompleteClueTokenValue,
    currentClues,
  );

  // Since we can't use up a fractional clue, we round it down for most purposes. This only matters
  // in Clue Starved variants.
  return result === null ? null : Math.floor(result);
}

/**
 * This is used as the denominator of an efficiency calculation:
 *
 * ```text
 * (8 + floor((starting pace + number of suits - unusable clues) * clues per discard))
 * ```
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
export function getStartingCluesUsable(
  endGameLength: number,
  deckSize: number,
  variant: Variant,
): number {
  const score = 0;
  const scorePerStack = newArray(variant.suits.length, 0);
  const maxScorePerStack = newArray(variant.suits.length, variant.stackSize);
  const discardClueTokenValue = getDiscardClueTokenValue(variant);
  const suitCompleteClueTokenValue = getSuitCompleteClueTokenValue(variant);

  const startingClues = getCluesStillUsable(
    score,
    scorePerStack,
    maxScorePerStack,
    variant.stackSize,
    deckSize,
    endGameLength,
    discardClueTokenValue,
    suitCompleteClueTokenValue,
    MAX_CLUE_NUM,
  );
  assertNotNull(startingClues, "The starting clues usable was null.");

  return startingClues;
}

export function getEfficiency(
  numCardsGotten: number,
  potentialCluesLost: number,
): number {
  return numCardsGotten / potentialCluesLost;
}

export function getFutureEfficiency(gameState: GameState): number | null {
  if (gameState.stats.cluesStillUsable === null) {
    return null;
  }

  const cardsNotGotten = gameState.stats.maxScore - gameState.stats.cardsGotten;
  return cardsNotGotten / gameState.stats.cluesStillUsable;
}

/**
 * After a discard, it is a "double discard" situation if there is only one other copy of this card
 * and it needs to be played.
 */
export function getDoubleDiscardCard(
  orderOfDiscardedCard: CardOrder,
  gameState: GameState,
  variant: Variant,
): CardOrder | null {
  const cardDiscarded = gameState.deck[orderOfDiscardedCard];
  if (cardDiscarded === undefined) {
    return null;
  }

  // It is never a double discard situation if the game is over.
  if (gameState.turn.currentPlayerIndex === null) {
    return null;
  }

  // It is never a double discard situation if the next player has one or more positive clues on
  // every card in their hand.
  const nextPlayerIndex =
    (gameState.turn.currentPlayerIndex + 1) % gameState.hands.length;
  const hand = gameState.hands[nextPlayerIndex];
  if (hand !== undefined) {
    const nextPlayerLocked = isHandLocked(hand, gameState.deck);
    if (nextPlayerLocked) {
      return null;
    }
  }

  // It is never a double discard situation if we do not know the identity of the discarded card
  // (which can happen in certain variants).
  if (cardDiscarded.suitIndex === null || cardDiscarded.rank === null) {
    return null;
  }

  // It is never a double discard situation if the discarded card does not need to be played.
  const neededForMaxScore = isCardNeededForMaxScore(
    cardDiscarded.suitIndex,
    cardDiscarded.rank,
    gameState.deck,
    gameState.playStacks,
    gameState.playStackDirections,
    gameState.playStackStarts,
    variant,
  );
  if (!neededForMaxScore) {
    return null;
  }

  // It is never a double discard situation if another player has a copy of the card in their hand
  // that happens to be fully "fill-in" from clues.
  for (const cardInDeck of gameState.deck) {
    if (
      cardInDeck.order !== cardDiscarded.order &&
      cardInDeck.suitIndex === cardDiscarded.suitIndex &&
      cardInDeck.rank === cardDiscarded.rank &&
      typeof cardInDeck.location === "number" && // The card is in a player's hand
      cardInDeck.possibleCardsFromClues.length === 1 // The card is fully "filled-in"
    ) {
      return null;
    }
  }

  // Otherwise, it is a double discard situation if there is only one copy of the card left.
  const suit = variant.suits[cardDiscarded.suitIndex];
  if (suit === undefined) {
    return null;
  }
  const numCopiesTotal = getNumCopiesOfCard(suit, cardDiscarded.rank, variant);
  const numDiscarded = getNumDiscardedCopiesOfCard(
    gameState.deck,
    cardDiscarded.suitIndex,
    cardDiscarded.rank,
  );

  return numCopiesTotal === numDiscarded + 1 ? orderOfDiscardedCard : null;
}
