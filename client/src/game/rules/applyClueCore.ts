import produce, { Draft, original, castDraft } from 'immer';
import CardState from '../types/CardState';
import Clue, { ColorClue, RankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import Color from '../types/Color';
import SimpleCard from '../types/SimpleCard';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

export interface PossibilityToRemove {
  readonly suitIndex: number;
  readonly rank: number;
  readonly all: boolean;
}

export function applyClueCore(
  state: CardState,
  clue: Readonly<Clue>,
  positive: boolean,
  calculatePossibilities: boolean,
  variant: Variant,
) {
  // Helpers to convert from suit/color to index and vice-versa
  const getIndex = getIndexHelper(variant);

  // suits/ranksRemoved keep track of suits/ranks removed for normal ranks/suits
  // This allows for proper checking of possibilities to cross out rank/suit pips
  // We handle special ranks/suits later
  const {
    suitsRemoved,
    ranksRemoved,
    impossibleCards,
  } = clue.type === ClueType.Color
    ? applyColorClue(state, clue, positive, calculatePossibilities, variant)
    : applyRankClue(state, clue, positive, calculatePossibilities, variant);

  // Reapply rank clues if we removed a special suit
  const shouldReapplyRankClues = calculatePossibilities
    && suitsRemoved
      .map((i) => variant.suits[i])
      .some((s) => s.allClueRanks || s.noClueRanks);

  // Reapply suit clues if we removed the special rank
  const shouldReapplyColorClues = calculatePossibilities
    && (variant.specialAllClueColors || variant.specialNoClueColors)
    && ranksRemoved.some((r) => r === variant.specialRank);

  let suitsPossible: boolean[] | null = null;
  let ranksPossible: boolean[] | null = null;
  let possibleCards = state.possibleCards;

  if (calculatePossibilities) {
    // Now that this card has been given a clue and we have more information,
    // eliminate card possibilities that are now impossible
    for (const suitRemoved of suitsRemoved) {
      for (const rank of variant.ranks) {
        impossibleCards.push({ suit: suitRemoved, rank });
      }
    }
    for (const rankRemoved of ranksRemoved) {
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        impossibleCards.push({ suit: suitIndex, rank: rankRemoved });
      }
    }

    // Remove all the possibilities we found
    const possibilitiesToRemove = impossibleCards.map((c) => ({
      suitIndex: c.suit,
      rank: c.rank,
      all: true,
    }));
    possibleCards = removePossibilities(possibleCards, possibilitiesToRemove);

    const pipPossibilities = checkAllPipPossibilities(possibleCards, variant);
    suitsPossible = pipPossibilities.suitsPossible;
    ranksPossible = pipPossibilities.ranksPossible;
  }

  // TODO: We produce a copy of the state until this becomes a proper reducer
  const newState = produce(state, (s) => {
    // Record unique clues that touch the card
    if (clue.type === ClueType.Color) {
      const colorId = getIndex(clue.value);
      if (positive && !s.colorClueMemory.positiveClues.includes(colorId)) {
        s.colorClueMemory.positiveClues.push(colorId);
      } else if (!positive && !s.colorClueMemory.negativeClues.includes(colorId)) {
        s.colorClueMemory.negativeClues.push(colorId);
      }
    } else if (clue.type === ClueType.Rank) {
      if (positive && !s.rankClueMemory.positiveClues.includes(clue.value)) {
        s.rankClueMemory.positiveClues.push(clue.value);
      } else if (!positive && !s.rankClueMemory.negativeClues.includes(clue.value)) {
        s.rankClueMemory.negativeClues.push(clue.value);
      }
    }

    // Bring the result back to the state as indexes
    s.rankClueMemory.possibilities = original(s.rankClueMemory.possibilities)!
      .filter((r) => !ranksRemoved.includes(r));

    s.colorClueMemory.possibilities = original(s.colorClueMemory.possibilities)!
      .filter((r) => !suitsRemoved.includes(r));

    // Remove suit pips, if any
    for (const suitRemoved of suitsRemoved) {
      // Hide the suit pips
      s.colorClueMemory.pipStates[suitRemoved] = 'Hidden';
    }

    // Remove rank pips, if any
    for (const rankRemoved of ranksRemoved) {
      // Hide the rank pips
      s.rankClueMemory.pipStates[rankRemoved] = 'Hidden';
    }

    if (calculatePossibilities) {
      s.colorClueMemory.pipStates = s.colorClueMemory.pipStates.map(
        (pipState, suitIndex) => (!suitsPossible![suitIndex] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
      );

      s.rankClueMemory.pipStates = s.rankClueMemory.pipStates.map(
        (pipState, rank) => (!ranksPossible![rank] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
      );

      s.possibleCards = castDraft(possibleCards);
    }

    if (s.colorClueMemory.possibilities.length === 1) {
      // We have discovered the true suit of the card
      [s.suitIndex] = s.colorClueMemory.possibilities;
    }

    if (s.rankClueMemory.possibilities.length === 1) {
      // We have discovered the true rank of the card
      [s.rank] = s.rankClueMemory.possibilities;
    }

    if (
      s.colorClueMemory.possibilities.length === 1
      && s.rankClueMemory.possibilities.length === 1
    ) {
      s.identityDetermined = true;
    }
  });

  return { state: newState, shouldReapplyRankClues, shouldReapplyColorClues };
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
  const impossibleCards: SimpleCard[] = [];

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
        impossibleCards.push({ suit: suitIndex, rank });
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
          impossibleCards.push({ suit: suitIndex, rank: variant.specialRank });
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
            impossibleCards.push({ suit: suitIndex, rank: variant.specialRank });
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
  const impossibleCards: SimpleCard[] = [];

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
        impossibleCards.push({ suit: getIndex(suit), rank });
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
  const possibleCardsCopy: number[][] = possibleCards.map((arr) => arr.map((n) => n));
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

// This function is temporary because eventually all state changes will be performed inside of a
// proper reducer function (using Redux)
export const removePossibilityTemp = produce((
  state: Draft<CardState>,
  suitIndex: number,
  rank: number,
  all: boolean,
  variant: Variant,
) => {
  const cardsLeft = removePossibility(original(state.possibleCards)!, suitIndex, rank, all);
  state.possibleCards[suitIndex][rank] = cardsLeft;

  const {
    suitPossible,
    rankPossible,
  } = checkPipPossibilities(state.possibleCards, suitIndex, rank, variant);

  if (!suitPossible && original(state.colorClueMemory.pipStates)![suitIndex] !== 'Hidden') {
    state.colorClueMemory.pipStates[suitIndex] = 'Eliminated';
  }
  if (!rankPossible && original(state.rankClueMemory.pipStates)![rank] !== 'Hidden') {
    state.rankClueMemory.pipStates[rank] = 'Eliminated';
  }
}, {} as CardState);

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

// Check to see if we can put an X over this suit pip or this rank pip
function checkPipPossibilities(
  possibleCards: number[][],
  suit: number,
  rank: number,
  variant: Variant,
) {
  const suitPossible = variant.ranks.some((r) => possibleCards[suit][r] > 0);
  const rankPossible = variant.suits.some((_, i) => possibleCards[i][rank] > 0);
  return { suitPossible, rankPossible };
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
