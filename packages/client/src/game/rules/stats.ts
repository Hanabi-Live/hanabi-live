// Functions to calculate game stats such as pace and efficiency.

import type { Variant } from "@hanabi/data";
import { MAX_CLUE_NUM } from "@hanabi/data";
import type { CardNote } from "../types/CardNote";
import type { CardState } from "../types/CardState";
import type { GameState, PaceRisk } from "../types/GameState";
import type { StackDirection } from "../types/StackDirection";
import * as cardRules from "./card";
import * as clueTokensRules from "./clueTokens";
import * as deckRules from "./deck";
import * as reversibleRules from "./variants/reversible";
import * as sudokuRules from "./variants/sudoku";

export function getMaxScorePerStack(
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  playStackStarts: readonly number[],
  variant: Variant,
): number[] {
  // Sudoku-variants are quite complicated, since we need to solve an assignment problem for these.
  if (variant.sudoku) {
    return sudokuRules.getMaxScorePerStack(deck, playStackStarts, variant);
  }

  // This handles the maximum scores in Reversed or "Up Or Down" variants.
  return reversibleRules.getMaxScorePerStack(
    deck,
    playStackDirections,
    variant,
  );
}

function discardsBeforeFinalRound(
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

function maxPlaysDuringFinalRound(
  cardsToPlay: number,
  endGameLength: number,
): number {
  if (cardsToPlay < endGameLength + 1) {
    return cardsToPlay;
  }
  return endGameLength + 1;
}

function maxPlays(
  cardsToPlay: number,
  deckSize: number,
  endGameLength: number,
): number {
  if (cardsToPlay <= endGameLength + deckSize) {
    return cardsToPlay;
  }
  return endGameLength + deckSize;
}

// Pace is the number of discards that can happen while still getting the maximum score.
export function pace(
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

// A measure of how risky a discard would be right now, using different heuristics.
export function paceRisk(
  currentPace: number | null,
  numPlayers: number,
): PaceRisk {
  if (currentPace === null) {
    return "Null";
  }

  if (currentPace <= 0) {
    return "Zero";
  }

  // Formula derived by Florrat; a strategical estimate of "End-Game" that tries to account for the
  // number of players.
  if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
    return "HighRisk";
  }

  // Formula derived by Hyphen-ated; a more conservative estimate of "End-Game" that does not
  // account for the number of players.
  if (currentPace - numPlayers < 0) {
    return "MediumRisk";
  }

  return "LowRisk";
}

export function startingDeckSize(
  numPlayers: number,
  cardsPerHand: number,
  variant: Variant,
): number {
  const totalCards = deckRules.totalCards(variant);
  const initialCardsDrawn = cardsPerHand * numPlayers;
  return totalCards - initialCardsDrawn;
}

// Calculate the starting pace with the following formula:

// ```
//   total cards in the deck
//   + number of turns in the final round
//   - (number of cards in a player's hand * number of players)
//   - (5 * number of suits)
// ```

// See: https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
export function startingPace(
  deckSize: number,
  maxScore: number,
  endGameLength: number,
): number {
  return endGameLength + deckSize - maxScore;
}

export function cardsGotten(
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: readonly number[],
  playing: boolean,
  shadowing: boolean,
  maxScore: number,
  variant: Variant,
): number {
  let currentCardsGotten = 0;

  // Go through the deck and count the cards that are gotten.
  for (const card of deck) {
    if (
      card.location === "playStack" ||
      (card.location === "discard" &&
        card.isMisplayed &&
        variant.throwItInAHole &&
        (playing || shadowing))
    ) {
      // A card is considered to be gotten if it is already played (and failed discards count as
      // played for the purposes of "Throw It in a Hole" variants).
      currentCardsGotten++;
    } else if (
      cardRules.isInPlayerHand(card) &&
      cardRules.isClued(card) &&
      !cardRules.allPossibilitiesTrash(
        card,
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
export function cardsGottenByNotes(
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  playStackStarts: readonly number[],
  variant: Variant,
  notes: CardNote[],
): number {
  let numCardsGottenByNotes = 0;

  for (const [order, card] of deck.entries()) {
    if (
      cardRules.isInPlayerHand(card) &&
      !cardRules.allPossibilitiesTrash(
        card,
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
        card,
      );
      numCardsGottenByNotes += adjustmentFromThisCard;
    }
  }

  return numCardsGottenByNotes;
}

function getCardsGottenByNotesAdjustment(
  notes: CardNote[],
  order: number,
  card: CardState,
): number {
  const note = notes[order];
  if (!note) {
    return 0;
  }

  const isCluedForReal = cardRules.isClued(card);
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

// Calculate the minimum amount of efficiency needed in order to win this variant.
export function minEfficiency(
  numPlayers: number,
  endGameLength: number,
  variant: Variant,
  cardsPerHand: number,
): number {
  // First, calculate the starting pace:
  const deckSize = startingDeckSize(numPlayers, cardsPerHand, variant);

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:

  // `max score / maximum number of clues that can be given before the game ends`
  const { maxScore } = variant;
  const totalClues = startingCluesUsable(endGameLength, deckSize, variant);

  return maxScore / totalClues;
}

// Returns the max number of clues that can be spent while getting the max possible score from a
// given game state onward (not accounting for the locations of playable cards).
export function cluesStillUsableNotRounded(
  score: number,
  scorePerStack: readonly number[],
  maxScorePerStack: readonly number[],
  deckSize: number,
  endGameLength: number,
  discardValue: number,
  suitValue: number,
  currentClues: number,
): number | null {
  if (scorePerStack.length !== maxScorePerStack.length) {
    throw new Error(
      "Failed to calculate efficiency: scorePerStack must have the same length as maxScorePerStack.",
    );
  }
  // We want to discard as many times as possible while still getting a max score as long as
  // discardValue >= suitValue (which is currently true for all variants).
  if (discardValue < suitValue) {
    throw new Error(
      "Cannot calculate efficiency in variants where discarding gives fewer clues than completing suits.",
    );
  }
  if (deckSize <= 0) {
    return null;
  }

  const maxScore = maxScorePerStack.reduce((a, b) => a + b, 0);

  const missingScore = maxScore - score;

  const maxDiscardsBeforeFinalRound = discardsBeforeFinalRound(
    missingScore,
    deckSize,
    endGameLength,
  );

  const cluesFromDiscards = maxDiscardsBeforeFinalRound * discardValue;

  let cluesFromSuits = 0;
  if (suitValue > 0) {
    // Compute how many suits we can complete before the final round.
    const playsDuringFinalRound = maxPlaysDuringFinalRound(
      missingScore,
      endGameLength,
    );
    const minPlaysBeforeFinalRound =
      maxPlays(missingScore, deckSize, endGameLength) - playsDuringFinalRound;
    const missingCardsPerCompletableSuit: number[] = [];
    for (const [suitIndex, stackScore] of scorePerStack.entries()) {
      if (maxScorePerStack[suitIndex] === 5 && stackScore < 5) {
        missingCardsPerCompletableSuit.push(
          maxScorePerStack[suitIndex]! - stackScore,
        );
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
    cluesFromSuits = suitsCompletedBeforeFinalRound * suitValue;
  }
  return cluesFromDiscards + cluesFromSuits + currentClues;
}
export function cluesStillUsable(
  score: number,
  scorePerStack: readonly number[],
  maxScorePerStack: readonly number[],
  deckSize: number,
  endGameLength: number,
  discardValue: number,
  suitValue: number,
  currentClues: number,
): number | null {
  const result = cluesStillUsableNotRounded(
    score,
    scorePerStack,
    maxScorePerStack,
    deckSize,
    endGameLength,
    discardValue,
    suitValue,
    currentClues,
  );
  // Since we can't use up a fractional clue, we round it down for most purposes. This only matters
  // in clue starved variants.
  return result === null ? null : Math.floor(result);
}

// This is used as the denominator of an efficiency calculation:

// ```
// (8 + floor((starting pace + number of suits - unusable clues) * clues per discard))
// ```

// See: https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
export function startingCluesUsable(
  endGameLength: number,
  deckSize: number,
  variant: Variant,
): number {
  const score = 0;
  // eslint-disable-next-line isaacscript/no-object-any
  const scorePerStack = new Array(variant.suits.length).fill(0);
  // eslint-disable-next-line isaacscript/no-object-any
  const maxScorePerStack = new Array(variant.suits.length).fill(5);
  const discardValue = clueTokensRules.discardValue(variant);
  const suitValue = clueTokensRules.suitValue(variant);
  const startingClues = cluesStillUsable(
    score,
    scorePerStack,
    maxScorePerStack,
    deckSize,
    endGameLength,
    discardValue,
    suitValue,
    MAX_CLUE_NUM,
  );
  if (startingClues === null) {
    throw new Error("The starting clues usable was null.");
  }
  return startingClues;
}

export function efficiency(
  numCardsGotten: number,
  potentialCluesLost: number,
): number {
  return numCardsGotten / potentialCluesLost;
}

export function futureEfficiency(state: GameState): number | null {
  if (state.stats.cluesStillUsable === null) {
    return null;
  }

  const cardsNotGotten = state.stats.maxScore - state.stats.cardsGotten;
  return cardsNotGotten / state.stats.cluesStillUsable;
}

// After a discard, it is a "double discard" situation if there is only one other copy of this card
// and it needs to be played.
export function doubleDiscard(
  orderOfDiscardedCard: number,
  state: GameState,
  variant: Variant,
): number | null {
  // It is never a double discard situation if the game is over.
  if (state.turn.currentPlayerIndex === null) {
    return null;
  }

  // It is never a double discard situation if the next player has one or more positive clues on
  // every card in their hand.
  const hand =
    state.hands[(state.turn.currentPlayerIndex + 1) % state.hands.length]!;
  let allClued = true;
  for (const orderOfCardInHand of hand) {
    const cardInHand = state.deck[orderOfCardInHand]!;
    if (!cardRules.isClued(cardInHand)) {
      allClued = false;
      break;
    }
  }
  if (allClued) {
    return null;
  }

  // It is never a double discard situation if we do not know the identity of the discarded card
  // (which can happen in certain variants).
  const cardDiscarded = state.deck[orderOfDiscardedCard]!;
  if (cardDiscarded.suitIndex === null || cardDiscarded.rank === null) {
    return null;
  }

  // It is never a double discard situation if the discarded card does not need to be played.
  const needsToBePlayed = cardRules.needsToBePlayed(
    cardDiscarded.suitIndex,
    cardDiscarded.rank,
    state.deck,
    state.playStacks,
    state.playStackDirections,
    state.playStackStarts,
    variant,
  );
  if (!needsToBePlayed) {
    return null;
  }

  // It is never a double discard situation if another player has a copy of the card in their hand
  // that happens to be fully "fill-in" from clues.
  for (const cardInDeck of state.deck) {
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
  const suit = variant.suits[cardDiscarded.suitIndex]!;
  const numCopiesTotal = deckRules.numCopiesOfCard(
    suit,
    cardDiscarded.rank,
    variant,
  );
  const numDiscarded = deckRules.discardedCopies(
    state.deck,
    cardDiscarded.suitIndex,
    cardDiscarded.rank,
  );
  return numCopiesTotal === numDiscarded + 1 ? orderOfDiscardedCard : null;
}
