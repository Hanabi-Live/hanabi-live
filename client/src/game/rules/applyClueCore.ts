import CardIdentity from '../types/CardIdentity';
import CardState from '../types/CardState';
import { ColorClue, RankClue } from '../types/Clue';
import Color from '../types/Color';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

export interface PossibilityToRemove {
  readonly suitIndex: number;
  readonly rank: number;
  readonly all: boolean;
}

export function applyColorClue(
  state: CardState,
  clue: Readonly<ColorClue>,
  positive: boolean,
  calculatePossibilities: boolean,
  variant: Variant,
) {
  const possibleSuits = state.colorClueMemory.possibilities.map((p) => variant.suits[p]);
  const possibleRanks = state.rankClueMemory.possibilities.map((i) => i);
  const getIndex = getIndexHelper(variant);

  let suitsRemoved: number[] = [];
  let ranksRemoved: number[] = [];
  const impossibleCards: CardIdentity[] = [];

  if (variant.colorCluesTouchNothing) {
    // Some variants have color clues touch no cards
    // If this is the case, we cannot remove any suit pips from the card
  } else {
    // The default case (e.g. No Variant)
    // Remove all possibilities that do not include this color
    suitsRemoved = possibleSuits.filter(
      (suit: Suit) => (suit.clueColors.includes(clue.value) || suit.allClueColors) !== positive,
    ).map(getIndex);
  }

  if (
    calculatePossibilities
    && (variant.specialAllClueColors || variant.specialNoClueColors)
  ) {
    // We only need to run this early possibility removal for variants with special ranks
    // touched by all or no color clues
    for (const rank of possibleRanks.filter((r) => r !== variant.specialRank)) {
      // We can remove possibilities for normal ranks
      for (const suitIndex of suitsRemoved) {
        impossibleCards.push({ suitIndex, rank });
      }
    }
  }

  const inconclusivePositive = positive && variant.specialAllClueColors;
  const inconclusiveNegative = !positive && variant.specialNoClueColors;

  if (
    possibleRanks.includes(variant.specialRank)
    && (inconclusivePositive || inconclusiveNegative)
  ) {
    // Some variants have specific ranks touched by all colors
    // If this is the case, we cannot remove any color pips from the card
    // except for special suits touched by no/all colors
    suitsRemoved = filterInPlace(
      possibleSuits,
      (s: Suit) => (positive ? !s.noClueColors : !s.allClueColors),
    ).map(getIndex);
  } else {
    // We can safely remove the suits from possible suits
    filterInPlace(
      possibleSuits,
      (suit: Suit) => !suitsRemoved.includes(getIndex(suit)),
    );
  }

  // Handle special ranks
  if (variant.specialRank !== -1) {
    if (variant.specialAllClueColors) {
      if (positive) {
        if (state.colorClueMemory.positiveClues.length >= 1
          && !possibleSuits.some((suit) => suit.allClueColors)) {
          // Two positive color clues should "fill in" a special rank that is touched by all
          // color clues (that cannot be a multi-color suit)
          ranksRemoved = filterInPlace(
            possibleRanks,
            (rank: number) => rank === variant.specialRank,
          );
        }
      } else if (
        possibleRanks.length === 1
        && state.rank === variant.specialRank
      ) {
        // Negative color to a known special rank means that we can remove all suits
        // other that the ones that are never touched by color clues
        const moreSuitsRemoved = filterInPlace(
          possibleSuits,
          (suit: Suit) => suit.noClueColors,
        ).map(getIndex);
        suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
        suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
      } else if (!possibleSuits.some((suit: Suit) => suit.noClueColors)) {
        // Negative color means that the card cannot be the special rank
        // (as long as the card cannot be a suit that is never touched by color clues)
        ranksRemoved = filterInPlace(
          possibleRanks,
          (rank: number) => rank !== variant.specialRank,
        );
      } else if (calculatePossibilities) {
        // If there is a suit never touched by color clues, we can still remove
        // possibilities for other suits on the special rank
        for (const suit of possibleSuits.filter((theSuit) => !theSuit.noClueColors)) {
          const suitIndex = getIndex(suit);
          impossibleCards.push({ suitIndex, rank: variant.specialRank });
        }
      }
    } else if (variant.specialNoClueColors) {
      if (positive) {
        if (!possibleSuits.some((suit) => suit.allClueColors)) {
          // Positive color means that the card cannot be a special rank
          // (as long as the card cannot be a suit that is always touched by color clues)
          ranksRemoved = filterInPlace(
            possibleRanks,
            (rank: number) => rank !== variant.specialRank,
          );
        } else if (calculatePossibilities) {
          // If there is a suit always touched by color clues, we can still remove
          // possibilities for other suits on the special rank
          for (const suit of possibleSuits.filter((theSuit) => !theSuit.allClueColors)) {
            const suitIndex = getIndex(suit);
            impossibleCards.push({ suitIndex, rank: variant.specialRank });
          }
        }
      } else if (state.colorClueMemory.negativeClues.length === variant.clueColors.length - 1) {
        if (!possibleSuits.some((suit) => suit.noClueColors)) {
          // All negative colors means that the card must be the special rank
          // (as long as it cannot be a suit that is never touched by color clues)
          ranksRemoved = filterInPlace(
            possibleRanks,
            (rank: number) => rank === variant.specialRank,
          );
        }
      }
    }
  }
  return { suitsRemoved, ranksRemoved, impossibleCards };
}

export function applyRankClue(
  state: CardState,
  clue: Readonly<RankClue>,
  positive: boolean,
  calculatePossibilities: boolean,
  variant: Variant,
) {
  const possibleSuits = state.colorClueMemory.possibilities.map((p) => variant.suits[p]);
  const possibleRanks = state.rankClueMemory.possibilities.map((i) => i);
  const getIndex = getIndexHelper(variant);

  let suitsRemoved: number[] = [];
  let ranksRemoved: number[] = [];
  const impossibleCards: CardIdentity[] = [];

  const clueRank = clue.value;
  // ranksRemoved keeps track of ranks removed for normal suits touched by their own rank
  // This allows for proper checking of possibilities to cross out suit pips
  // We handle suits with special ranks later
  if (variant.rankCluesTouchNothing) {
    // Some variants have rank clues touch no cards
    // If this is the case, we cannot remove any rank pips from the card
  } else if (possibleRanks.includes(variant.specialRank)
    && variant.specialAllClueRanks) {
    // Some variants have specific ranks touched by all rank clues
    ranksRemoved = possibleRanks.filter(
      (rank: number) => (rank === clueRank || rank === variant.specialRank) !== positive,
    );
  } else if (possibleRanks.includes(variant.specialRank)
    && variant.specialNoClueRanks) {
    // Some variants have specific ranks touched by no rank clues
    ranksRemoved = possibleRanks.filter(
      (rank: number) => (rank === clueRank && rank !== variant.specialRank) !== positive,
    );
  } else {
    // The default case (e.g. No Variant)
    // Remove all possibilities that do not include this rank
    ranksRemoved = possibleRanks.filter(
      (rank: number) => (rank === clueRank) !== positive,
    );
  }

  // Some suits are touched by all rank clues
  // Some suits are not touched by any rank clues
  // So we may be able to remove a suit pip
  if (positive) {
    suitsRemoved = filterInPlace(
      possibleSuits,
      (suit: Suit) => !suit.noClueRanks,
    ).map(getIndex);
  } else {
    suitsRemoved = filterInPlace(
      possibleSuits,
      (suit: Suit) => !suit.allClueRanks,
    ).map(getIndex);
  }

  // Handle the special case where two positive rank clues should "fill in" a card of a
  // multi-rank suit
  if (
    positive
    && state.rankClueMemory.positiveClues.length >= 1
    && !(
      possibleRanks.includes(variant.specialRank)
      && variant.specialAllClueRanks
    )
  ) {
    const moreSuitsRemoved = filterInPlace(
      possibleSuits,
      (suit: Suit) => suit.allClueRanks,
    ).map(getIndex);
    suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
    suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
  }

  // Handle the special case where all negative rank clues should "fill in" a card of a
  // rank-less suit
  const allNegatives = state.rankClueMemory.negativeClues.length === variant.ranks.length - 1;

  if (
    !positive
    && !variant.rankCluesTouchNothing
    && allNegatives
    // We know that any special rank can be given as a rank clue
    // so there is no need to have a separate check for special variants
  ) {
    const moreSuitsRemoved = filterInPlace(
      possibleSuits,
      (suit: Suit) => suit.noClueRanks,
    ).map(getIndex);
    suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
    suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
  }

  if (calculatePossibilities) {
    for (const suit of possibleSuits.filter((s) => !s.allClueRanks && !s.noClueRanks)) {
      // We can remove possibilities for normal suits touched by their own rank
      for (const rank of ranksRemoved) {
        impossibleCards.push({ suitIndex: getIndex(suit), rank });
      }
    }
  }

  if (possibleSuits.some((suit) => suit.allClueRanks) && positive) {
    // Some cards are touched by all ranks,
    // so if this is a positive rank clue, we cannot remove any rank pips from the card
    ranksRemoved = [];
  } else if (possibleSuits.some((suit) => suit.noClueRanks) && !positive) {
    // Some suits are not touched by any ranks,
    // so if this is a negative rank clue, we cannot remove any rank pips from the card
    ranksRemoved = [];
  }

  return { suitsRemoved, ranksRemoved, impossibleCards };
}

export function removePossibilities(
  possibleCards: ReadonlyArray<readonly number[]>,
  possibilitiesToRemove: PossibilityToRemove[],
) {
  // Make a copy here for quick modification
  const possibleCardsCopy: number[][] = Array.from(possibleCards, (arr) => Array.from(arr));
  for (const { suitIndex, rank, all } of possibilitiesToRemove) {
    possibleCardsCopy[suitIndex][rank] = removePossibility(possibleCardsCopy, suitIndex, rank, all);
  }
  return possibleCardsCopy;
}

function removePossibility(
  possibleCards: number[][],
  suitIndex: number,
  rank: number,
  all: boolean,
) {
  // Every card has a possibility map that maps card identities to count
  let cardsLeft = possibleCards[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "possibleCards" map for card.`);
  }
  if (cardsLeft > 0) {
    // Remove one or all possibilities for this card,
    // (depending on whether the card was clued
    // or if we saw someone draw a copy of this card)
    cardsLeft = all ? 0 : cardsLeft - 1;
  }
  return cardsLeft;
}

// Check to see if we can put an X over all suits pip and rank pips
export function checkAllPipPossibilities(
  possibleCards: ReadonlyArray<readonly number[]>,
  variant: Variant,
) {
  const suitsPossible = variant.suits.map(
    (_, suitIndex) => variant.ranks.some((rank) => possibleCards[suitIndex][rank] > 0),
  );
  const ranksPossible: boolean[] = [];
  variant.ranks.forEach((rank) => {
    ranksPossible[rank] = variant.suits.some((_, suitIndex) => possibleCards[suitIndex][rank] > 0);
  });
  return { suitsPossible, ranksPossible };
}

// ---------------
// Misc. functions
// ---------------

// Remove everything from the array that does not match the condition in the function
function filterInPlace<T>(values: T[], predicate: (value: T) => boolean): T[] {
  const removed = [];
  let i = values.length - 1;
  while (i >= 0) {
    if (!predicate(values[i])) {
      removed.unshift(values.splice(i, 1)[0]);
    }
    i -= 1;
  }
  return removed;
}

// From: https://medium.com/dailyjs/how-to-remove-array-duplicates-in-es6-5daa8789641c
function removeDuplicatesFromArray<T>(array: T[]) {
  return array.filter((item, index) => array.indexOf(item) === index);
}

function getIndexHelper(variant: Variant) {
  const suitIndexes: Map<string, number> = new Map<string, number>();
  const colorIndexes: Map<Color, number> = new Map<Color, number>();
  variant.suits.forEach((suit, index) => suitIndexes.set(suit.name, index));
  variant.clueColors.forEach((color, index) => colorIndexes.set(color, index));

  function getIndex<T extends Suit | Color>(value: T): number {
    // HACK: test a member of the interface that is exclusive to Suit
    if ((value as Suit).reversed !== undefined) {
      return suitIndexes.get(value.name)!;
    }
    return colorIndexes.get(value)!;
  }

  return getIndex;
}
