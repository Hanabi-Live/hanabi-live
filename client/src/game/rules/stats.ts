// Functions to calculate game stats such as pace and efficiency

import {
  cardRules,
  clueTokensRules,
  deckRules,
  handRules,
  variantRules,
} from "../rules";
import CardState from "../types/CardState";
import { MAX_CLUE_NUM } from "../types/constants";
import GameState, { PaceRisk } from "../types/GameState";
import StackDirection from "../types/StackDirection";
import Variant from "../types/Variant";
import * as reversibleRules from "./variants/reversible";

export function getMaxScore(
  deck: readonly CardState[],
  playStackDirections: readonly StackDirection[],
  variant: Variant,
): number {
  let maxScore = 0;

  // Getting the maximum score is much more complicated if we are playing a
  // "Reversed" or "Up or Down" variant
  if (variantRules.hasReversedSuits(variant)) {
    return reversibleRules.getMaxScore(deck, playStackDirections, variant);
  }

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    const suit = variant.suits[suitIndex];
    for (let rank = 1; rank <= 5; rank++) {
      // Search through the deck to see if all the copies of this card are discarded already
      const total = deckRules.numCopiesOfCard(suit, rank, variant);
      const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
      if (total > discarded) {
        maxScore += 1;
      } else {
        break;
      }
    }
  }

  return maxScore;
}

// Pace is the number of discards that can happen while still getting the maximum score
export function pace(
  score: number,
  deckSize: number,
  maxScore: number,
  numPlayers: number,
  gameOver: boolean,
): number | null {
  if (gameOver) {
    return null;
  }

  if (deckSize <= 0) {
    return null;
  }

  // The formula for pace was derived by Libster
  const adjustedScorePlusDeck = score + deckSize - maxScore;
  return adjustedScorePlusDeck + numPlayers;
}

// A measure of how risky a discard would be right now, using different heuristics
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

  // Formula derived by Florrat;
  // a strategical estimate of "End-Game" that tries to account for the number of players
  if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
    return "HighRisk";
  }

  // Formula derived by Hyphen-ated;
  // a more conservative estimate of "End-Game" that does not account for the number of players
  if (currentPace - numPlayers < 0) {
    return "MediumRisk";
  }

  return "LowRisk";
}

// Calculate the starting pace with the following formula:
//   total cards in the deck -
//   ((number of cards in a player's hand - 1) * number of players) -
//   (5 * number of suits)
// https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
export function startingPace(
  numPlayers: number,
  cardsPerHand: number,
  variant: Variant,
): number {
  const totalCards = deckRules.totalCards(variant);
  const middleTerm = (cardsPerHand - 1) * numPlayers;
  const totalCardsToBePlayed = 5 * variant.suits.length;
  return totalCards - middleTerm - totalCardsToBePlayed;
}

export function cardsGotten(
  deck: readonly CardState[],
  playStacks: ReadonlyArray<readonly number[]>,
  playStackDirections: readonly StackDirection[],
  playing: boolean,
  variant: Variant,
): number {
  let currentCardsGotten = 0;

  // Go through the deck and count the cards that are gotten
  for (const card of deck) {
    if (
      card.location === "playStack" ||
      (card.location === "discard" &&
        card.isMisplayed &&
        variantRules.isThrowItInAHole(variant) &&
        playing)
    ) {
      // A card is considered to be gotten if it is already played
      // (and failed discards count as played for the purposes of "Throw It in a Hole" variants)
      currentCardsGotten += 1;
    } else if (
      typeof card.location === "number" && // This card is in a player's hand
      cardRules.isClued(card) &&
      !cardRules.allPossibilitiesTrash(
        card,
        deck,
        playStacks,
        playStackDirections,
        variant,
      )
    ) {
      // Clued cards in player's hands are considered to be gotten,
      // since they will eventually be played from Good Touch Principle
      // (unless the card is globally known to be trash)
      currentCardsGotten += 1;
    }
  }

  return currentCardsGotten;
}

export function efficiency(cards: number, clues: number): number {
  return cards / clues;
}

// Calculate the minimum amount of efficiency needed in order to win this variant
export function minEfficiency(
  numPlayers: number,
  variant: Variant,
  oneExtraCard: boolean,
  oneLessCard: boolean,
): number {
  // First, calculate the starting pace:
  const cardsPerHand = handRules.cardsPerHand(
    numPlayers,
    oneExtraCard,
    oneLessCard,
  );
  const initialPace = startingPace(numPlayers, cardsPerHand, variant);

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:
  //   (5 * number of suits) /
  //   maximum number of clues that can be given before the game ends
  // https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
  const numSuits = variant.suits.length;
  const minEfficiencyNumerator = 5 * numSuits;
  const minEfficiencyDenominator = maxNumberOfCluesThatCouldBeGiven(
    numPlayers,
    numSuits,
    initialPace,
    variant,
  );

  return minEfficiencyNumerator / minEfficiencyDenominator;
}

// This is used as the denominator of an efficiency calculation:
// (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
export function maxNumberOfCluesThatCouldBeGiven(
  numPlayers: number,
  numSuits: number,
  initialPace: number,
  variant: Variant,
): number {
  let cluesGainedAfterCompletingSuits = numSuits;
  if (variantRules.isThrowItInAHole(variant)) {
    // Players do not gain a clue after playing a 5 in this variant
    cluesGainedAfterCompletingSuits = 0;
  }

  let unusableClues = 1;
  if (numPlayers >= 5) {
    unusableClues = 2;
  }
  if (variantRules.isThrowItInAHole(variant)) {
    // Players do not gain a clue after playing a 5 in this variant
    unusableClues = 0;
  }

  return (
    MAX_CLUE_NUM +
    Math.floor(
      (initialPace + cluesGainedAfterCompletingSuits - unusableClues) *
        clueTokensRules.discardValue(variant),
    )
  );
}

// After a discard, it is a "double discard" situation if there is only one other copy of this card
// and it needs to be played
export function doubleDiscard(
  orderOfDiscardedCard: number,
  state: GameState,
  variant: Variant,
): boolean {
  // It is never a double discard situation if the game is over
  if (state.turn.currentPlayerIndex === null) {
    return false;
  }

  // It is never a double discard situation if the next player has one or more positive clues on
  // every card in their hand
  const hand =
    state.hands[(state.turn.currentPlayerIndex + 1) % state.hands.length];
  let allClued = true;
  for (const orderOfCardInHand of hand) {
    const cardInHand = state.deck[orderOfCardInHand];
    if (!cardRules.isClued(cardInHand)) {
      allClued = false;
      break;
    }
  }
  if (allClued) {
    return false;
  }

  // It is never a double discard situation if we do not know the identity of the discarded card
  // (which can happen in certain variants)
  const cardDiscarded = state.deck[orderOfDiscardedCard];
  if (cardDiscarded.suitIndex === null || cardDiscarded.rank === null) {
    return false;
  }

  // It is never a double discard situation if the discarded card does not need to be played
  const needsToBePlayed = cardRules.needsToBePlayed(
    cardDiscarded.suitIndex,
    cardDiscarded.rank,
    state.deck,
    state.playStacks,
    state.playStackDirections,
    variant,
  );
  if (!needsToBePlayed) {
    return false;
  }

  // It is never a double discard situation if another player has a copy of the card in their hand
  // that happens to be fully "fill-in" from clues
  for (const cardInDeck of state.deck) {
    if (
      cardInDeck.order !== cardDiscarded.order &&
      cardInDeck.suitIndex === cardDiscarded.suitIndex &&
      cardInDeck.rank === cardDiscarded.rank &&
      typeof cardInDeck.location === "number" && // The card is in a player's hand
      cardInDeck.possibleCardsFromClues.length === 1 // The card is fully "filled-in"
    ) {
      return false;
    }
  }

  // Otherwise, it is a double discard situation if there is only one copy of the card left
  const suit = variant.suits[cardDiscarded.suitIndex];
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
  return numCopiesTotal === numDiscarded + 1;
}
