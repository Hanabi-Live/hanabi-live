// Functions to calculate game stats such as pace and efficiency

import { deckRules, handRules, variantRules } from '../rules';
import CardState from '../types/CardState';
import { MAX_CLUE_NUM, START_CARD_RANK } from '../types/constants';
import { PaceRisk } from '../types/GameState';
import StackDirection from '../types/StackDirection';
import Variant from '../types/Variant';

export function getMaxScore(
  deck: readonly CardState[],
  playStacksDirections: readonly StackDirection[],
  variant: Variant,
): number {
  let maxScore = 0;

  // Getting the maximum score is much more complicated if we are playing a
  // "Reversed" or "Up or Down" variant
  if (variantRules.hasReversedSuits(variant)) {
    return getMaxScoreReversible(deck, playStacksDirections, variant);
  }

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    const suit = variant.suits[suitIndex];
    for (let rank = 1; rank <= 5; rank++) {
      // Search through the deck to see if all the copies of this card are discarded already
      const total = deckRules.numCopiesOfCard(variant, suit, rank);
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

const getMaxScoreReversible = (
  deck: readonly CardState[],
  playStacksDirections: readonly StackDirection[],
  variant: Variant,
): number => {
  let maxScore = 0;

  for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
    const suit = variant.suits[suitIndex];

    // Make a map that shows if all of some particular rank in this suit has been discarded
    const ranks = [1, 2, 3, 4, 5];
    if (variantRules.isUpOrDown(variant)) {
      ranks.push(START_CARD_RANK);
    }

    const allDiscarded = new Map<number, boolean>();
    for (const rank of ranks) {
      const total = deckRules.numCopiesOfCard(variant, suit, rank);
      const discarded = deckRules.discardedCopies(deck, suitIndex, rank);
      allDiscarded.set(rank, total === discarded);
    }

    if (playStacksDirections[suitIndex] === StackDirection.Undecided) {
      const upWalk = reversibleWalkUp(allDiscarded, variant);
      const downWalk = reversibleWalkDown(allDiscarded, variant);
      maxScore += Math.max(upWalk, downWalk);
    } else if (playStacksDirections[suitIndex] === StackDirection.Up) {
      maxScore += reversibleWalkUp(allDiscarded, variant);
    } else if (playStacksDirections[suitIndex] === StackDirection.Down) {
      maxScore += reversibleWalkDown(allDiscarded, variant);
    } else if (playStacksDirections[suitIndex] === StackDirection.Finished) {
      maxScore += 5;
    }
  }

  return maxScore;
};

// A helper function for "getMaxScoreReversible()"
const reversibleWalkUp = (allDiscarded: Map<number, boolean>, variant: Variant) => {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started
  if (variantRules.isUpOrDown(variant)) {
    if (allDiscarded.get(1)! && allDiscarded.get(START_CARD_RANK)!) {
      // In "Up or Down" variants, you can start with 1 or START when going up
      return 0;
    }
  } else if (allDiscarded.get(1)!) {
    // Otherwise, only 1
    return 0;
  }
  cardsThatCanStillBePlayed += 1;

  // Second, walk upwards
  for (let rank = 2; rank <= 5; rank++) {
    if (allDiscarded.get(rank)!) {
      break;
    }
    cardsThatCanStillBePlayed += 1;
  }

  return cardsThatCanStillBePlayed;
};

// A helper function for "getMaxScoreReversible()"
const reversibleWalkDown = (allDiscarded: Map<number, boolean>, variant: Variant) => {
  let cardsThatCanStillBePlayed = 0;

  // First, check to see if the stack can still be started
  if (variantRules.isUpOrDown(variant)) {
    if (allDiscarded.get(5)! && allDiscarded.get(START_CARD_RANK)!) {
      // In "Up or Down" variants, you can start with 5 or START when going down
      return 0;
    }
  } else if (allDiscarded.get(5)!) {
    // Otherwise, only 5
    return 0;
  }
  cardsThatCanStillBePlayed += 1;

  // Second, walk downwards
  for (let rank = 4; rank >= 1; rank--) {
    if (allDiscarded.get(rank)!) {
      break;
    }
    cardsThatCanStillBePlayed += 1;
  }

  return cardsThatCanStillBePlayed;
};

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
export function paceRisk(currentPace: number | null, numPlayers: number): PaceRisk {
  if (currentPace === null) {
    return 'Null';
  }

  if (currentPace <= 0) {
    return 'Zero';
  }

  // Formula derived by Florrat;
  // a strategical estimate of "End-Game" that tries to account for the number of players
  if (currentPace - numPlayers + Math.floor(numPlayers / 2) < 0) {
    return 'HighRisk';
  }

  // Formula derived by Hyphen-ated;
  // a more conservative estimate of "End-Game" that does not account for the number of players
  if (currentPace - numPlayers < 0) {
    return 'MediumRisk';
  }

  return 'LowRisk';
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
  let p = deckRules.totalCards(variant);
  p -= (cardsPerHand - 1) * numPlayers;
  p -= 5 * variant.suits.length;
  return p;
}

export function efficiency(cardsGotten: number, potentialCluesLost: number): number {
  // First, handle the case where no clues have been given yet
  // Infinity is normal and expected in this case (on e.g. the first turn of the game)
  // We must explicitly check for this because while e.g. "1 / 0" in JavaScript is infinity,
  // "0 / 0" in JavaScript is NaN
  if (potentialCluesLost === 0) {
    return Infinity;
  }

  return cardsGotten / potentialCluesLost;
}

// Calculate the minimum amount of efficiency needed in order to win this variant
export function minEfficiency(
  numPlayers: number,
  variant: Variant,
  oneExtraCard: boolean,
  oneLessCard: boolean,
): number {
  // First, calculate the starting pace:
  const cardsPerHand = handRules.cardsPerHand(numPlayers, oneExtraCard, oneLessCard);
  const initialPace = startingPace(numPlayers, cardsPerHand, variant);

  // Second, use the pace to calculate the minimum efficiency required to win the game with the
  // following formula:
  //   (5 * number of suits) /
  //   (8 + floor((starting pace + number of suits - unusable clues) / discards per clue))
  // https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md
  const numSuits = variant.suits.length;
  const minEfficiencyNumerator = 5 * numSuits;
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
  let discardsPerClue = 1;
  if (variantRules.isClueStarved(variant)) {
    discardsPerClue = 2;
  }
  const minEfficiencyDenominator = MAX_CLUE_NUM + Math.floor(
    (initialPace + cluesGainedAfterCompletingSuits - unusableClues) / discardsPerClue,
  );

  return minEfficiencyNumerator / minEfficiencyDenominator;
}
