/* eslint-disable import/prefer-default-export */
import produce, { Draft, castDraft, original } from 'immer';
import CardState from '../types/CardState';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import Color from '../types/Color';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

export function applyClueCore(
  state: CardState,
  variant: Variant,
  calculatePossibilities: boolean,
  clue: Readonly<Clue>,
  positive: boolean,
) {
  // Helpers to convert from suit/color to index and vice-versa
  const suitIndexes: Map<string, number> = new Map<string, number>();
  const colorIndexes: Map<Color, number> = new Map<Color, number>();
  variant.suits.forEach((suit, index) => suitIndexes.set(suit.name, index));
  variant.clueColors.forEach((color, index) => colorIndexes.set(color, index));

  const getIndex = (suit: Suit) => suitIndexes.get(suit.name)!;

  let shouldReapplyRankClues = false;
  let shouldReapplyColorClues = false;

  // Temporarily use a suit array so we don't have to keep converting back and forth
  const possibleSuits = state.colorClueMemory.possibilities.map((p) => variant.suits[p]);
  const possibleRanks = state.rankClueMemory.possibilities.map((i) => i);

  const possibilitiesToRemove: Array<{suitIndex: number; rank: number; all: boolean}> = [];

  // Make a copy here for quick modification
  const possibleCards: number[][] = state.possibleCards.map((arr) => arr.map((n) => n));

  // Find out if we can remove some rank pips or suit pips from this clue
  let ranksRemoved: number[] = [];
  let suitsRemoved: number[] = [];
  if (clue.type === ClueType.Color) {
    const clueColor = clue.value as Color;
    // suitsRemoved keeps track of suits removed for normal ranks
    // This allows for proper checking of possibilities to cross out rank pips
    // We handle special ranks later
    if (variant.colorCluesTouchNothing) {
      // Some variants have color clues touch no cards
      // If this is the case, we cannot remove any suit pips from the card
    } else {
      // The default case (e.g. No Variant)
      // Remove all possibilities that do not include this color
      suitsRemoved = possibleSuits.filter(
        (suit: Suit) => (suit.clueColors.includes(clueColor) || suit.allClueColors) !== positive,
      ).map(getIndex);
    }

    if (calculatePossibilities
      && (variant.specialAllClueColors || variant.specialNoClueColors)) {
      // We only need to run this early possibility removal for variants with special ranks
      // touched by all or no color clues
      for (const rank of possibleRanks) {
        // We can remove possibilities for normal ranks
        if (rank !== variant.specialRank) {
          for (const suitIndex of suitsRemoved) {
            possibilitiesToRemove.push({ suitIndex, rank, all: true });
          }
        }
      }
    }

    if (positive
      && possibleRanks.includes(variant.specialRank)
      && variant.specialAllClueColors) {
      // Some variants have specific ranks touched by all colors
      // If this is the case, and this is a positive color clue,
      // we cannot remove any color pips from the card
      // An exception to this is special suits touched by no colors
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.noClueColors,
      ).map(getIndex);
    } else if (!positive
      && possibleRanks.includes(variant.specialRank)
      && variant.specialNoClueColors) {
      // Some variants have specific ranks touched by no colors
      // If this is the case, and this is a negative color clue,
      // we cannot remove any color pips from the card
      // An exception to this is special suits touched by all colors
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.allClueColors,
      ).map(getIndex);
    } else {
      // We can safely remove the suits from possible suits
      filterInPlace(
        possibleSuits,
        (suit: Suit) => suitsRemoved.indexOf(suitIndexes.get(suit.name)!) === -1,
      );
    }

    // Handle special ranks
    if (variant.specialRank !== -1) {
      if (variant.specialAllClueColors) {
        if (positive) {
          if (state.colorClueMemory.positiveClues.length >= 1
            && possibleSuits
              .filter((suit) => suit.allClueColors)
              .length === 0) {
            // Two positive color clues should "fill in" a special rank that is touched by all
            // color clues (that cannot be a multi-color suit)
            ranksRemoved = filterInPlace(
              possibleRanks,
              (rank: number) => rank === variant.specialRank,
            );
          }
        } else if (possibleRanks.length === 1
          && state.rank === variant.specialRank) {
          // Negative color to a known special rank means that we can remove all suits
          // other that the ones that are never touched by color clues
          const moreSuitsRemoved = filterInPlace(
            possibleSuits,
            (suit: Suit) => suit.noClueColors,
          ).map(getIndex);
          suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
          suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
        } else if (possibleSuits
          .filter((suit: Suit) => suit.noClueColors).length === 0) {
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
            const suitIndex = suitIndexes.get(suit.name)!;
            possibilitiesToRemove.push({ suitIndex, rank: variant.specialRank, all: true });
          }
        }
      } else if (variant.specialNoClueColors) {
        if (positive) {
          if (possibleSuits
            .filter((suit) => suit.allClueColors).length === 0) {
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
              const suitIndex = suitIndexes.get(suit.name)!;
              possibilitiesToRemove.push({ suitIndex, rank: variant.specialRank, all: true });
            }
          }
        } else if (state.colorClueMemory.negativeClues.length === variant.clueColors.length) {
          if (possibleSuits
            .filter((suit) => suit.noClueColors).length === 0) {
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
  } else if (clue.type === ClueType.Rank) {
    const clueRank = clue.value as number;
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
      ).map((suit) => suitIndexes.get(suit.name)!);
    } else {
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.allClueRanks,
      ).map((suit) => suitIndexes.get(suit.name)!);
    }

    // Handle the special case where two positive rank clues should "fill in" a card of a
    // multi-rank suit
    if (positive
      && state.rankClueMemory.positiveClues.length >= 1
      && !(
        possibleRanks.includes(variant.specialRank)
        && variant.specialAllClueRanks
      )) {
      const moreSuitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => suit.allClueRanks,
      ).map((suit) => suitIndexes.get(suit.name)!);
      suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
      suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
    }

    // Handle the special case where all negative rank clues should "fill in" a card of a
    // rank-less suit
    if (!positive
      && !variant.rankCluesTouchNothing
      && state.rankClueMemory.negativeClues.length === variant.ranks.length
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
      for (const suit of possibleSuits) {
        // We can remove possibilities for normal suits touched by their own rank
        if (!suit.allClueRanks && !suit.noClueRanks) {
          for (const rank of ranksRemoved) {
            possibilitiesToRemove.push({ suitIndex: suitIndexes.get(suit.name)!, rank, all: true });
          }
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
    } else {
      // We can safely remove the ranks from possible ranks
      filterInPlace(possibleRanks,
        (rank: number) => ranksRemoved.indexOf(rank) === -1);
    }
  }

  // TODO: We produce a copy of the state until this becomes a proper reducer
  const newState = produce(state, (s) => {
    // Record unique clues that touch the card
    if (clue.type === ClueType.Color) {
      const colorId = colorIndexes.get(clue.value as Color)!;
      if (positive && !s.colorClueMemory.positiveClues.includes(colorId)) {
        s.colorClueMemory.positiveClues.push(colorId);
      } else if (!positive && !s.colorClueMemory.negativeClues.includes(colorId)) {
        s.colorClueMemory.negativeClues.push(colorId);
      }
    } else if (clue.type === ClueType.Rank) {
      if (positive && !s.rankClueMemory.positiveClues.includes(clue.value as number)) {
        s.rankClueMemory.positiveClues.push(clue.value as number);
      } else if (!positive && !s.rankClueMemory.negativeClues.includes(clue.value as number)) {
        s.rankClueMemory.negativeClues.push(clue.value as number);
      }

      // If the rank of the card is not known yet,
      // change the rank pip that corresponds with this number to signify a positive clue
      if (positive) {
        if (s.rankClueMemory.pipStates[clue.value as number] === 'Visible') {
          s.rankClueMemory.pipStates[clue.value as number] = 'PositiveClue';
        }
      }
    }

    // Bring the result back to the state as indexes
    s.rankClueMemory.possibilities = castDraft(possibleRanks);
    s.colorClueMemory.possibilities = possibleSuits.map(getIndex);

    // Remove suit pips, if any
    for (const suitRemoved of suitsRemoved) {
      // Hide the suit pips
      s.colorClueMemory.pipStates[suitRemoved] = 'Hidden';

      // Remove any card possibilities for this suit
      if (calculatePossibilities) {
        for (const rank of variant.ranks) {
          possibilitiesToRemove.push({ suitIndex: suitRemoved, rank, all: true });
        }
      }

      const suitObject = variant.suits[suitRemoved];
      if (suitObject.allClueRanks || suitObject.noClueRanks) {
        // Mark to retroactively apply rank clues when we return from this function
        shouldReapplyRankClues = true;
      }
    }

    // Remove rank pips, if any
    for (const rankRemoved of ranksRemoved) {
      // Hide the rank pips
      s.rankClueMemory.pipStates[rankRemoved] = 'Hidden';

      // Remove any card possibilities for this rank
      if (calculatePossibilities) {
        for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
          possibilitiesToRemove.push({ suitIndex, rank: rankRemoved, all: true });
        }
      }

      if (rankRemoved === variant.specialRank
      && (variant.specialAllClueColors || variant.specialNoClueColors)) {
      // Mark to retroactively apply color clues when we return from this function
        shouldReapplyColorClues = true;
      }
    }

    if (calculatePossibilities) {
      // Remove all the possibilities we found
      for (const { suitIndex, rank, all } of possibilitiesToRemove) {
        const {
          cardsLeft,
          suitEliminated,
          rankEliminated,
        } = removePossibility(possibleCards, suitIndex, rank, all, variant);
        possibleCards[suitIndex][rank] = cardsLeft;
        if (suitEliminated) {
          s.colorClueMemory.pipStates[suitIndex] = 'Eliminated';
        }
        if (rankEliminated) {
          s.rankClueMemory.pipStates[rank] = 'Eliminated';
        }
      }
      s.possibleCards = possibleCards;
    }

    if (possibleSuits.length === 1) {
    // We have discovered the true suit of the card
      [s.suitIndex] = s.colorClueMemory.possibilities;
    }

    if (possibleRanks.length === 1) {
    // We have discovered the true rank of the card
      [s.rank] = possibleRanks;
    }

    if (possibleSuits.length === 1
    && possibleRanks.length === 1) {
      s.identityDetermined = true;
    }
  });

  return { state: newState, shouldReapplyRankClues, shouldReapplyColorClues };
}

export const removePossibilityTemp = produce((
  state: Draft<CardState>,
  suitIndex: number,
  rank: number,
  all: boolean,
  variant: Variant,
) => {
  const {
    cardsLeft,
    suitEliminated,
    rankEliminated,
  } = removePossibility(original(state.possibleCards)!, suitIndex, rank, all, variant);
  state.possibleCards[suitIndex][rank] = cardsLeft;
  if (suitEliminated) {
    state.colorClueMemory.pipStates[suitIndex] = 'Eliminated';
  }
  if (rankEliminated) {
    state.rankClueMemory.pipStates[rank] = 'Eliminated';
  }
});

function removePossibility(
  possibleCards: number[][],
  suitIndex: number,
  rank: number,
  all: boolean,
  variant: Variant,
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
    const {
      suitEliminated,
      rankEliminated,
    } = checkPipPossibilities(cardsLeft, possibleCards, suitIndex, rank, variant);
    return { cardsLeft, suitEliminated, rankEliminated };
  }
  return { cardsLeft, suitEliminated: false, rankEliminated: false };
}

// Check to see if we can put an X over this suit pip or this rank pip
function checkPipPossibilities(
  cardsLeft: number,
  possibleCards: number[][],
  suit: number,
  rank: number,
  variant: Variant,
) {
  let suitPossible = false;
  let rankPossible = false;
  // Optimization: check to see if it makes sense to check this at all
  // First, check to see if there are any possibilities remaining for this suit
  for (const rank2 of variant.ranks) {
    const count = rank2 === rank ? cardsLeft : possibleCards[suit][rank2];
    if (count === undefined) {
      throw new Error(`Failed to get an entry for Suit: ${suit} and Rank: ${rank2} from the "possibleCards" map for card.`);
    }
    if (count > 0) {
      suitPossible = true;
      break;
    }
  }

  // There is no rank pip for "START" cards
  if (
    rank >= 1 && rank <= 5) {
    // Second, check to see if there are any possibilities remaining for this rank
    for (let suit2 = 0; suit2 < variant.suits.length; suit2++) {
      const count = suit === suit2 ? cardsLeft : possibleCards[suit2][rank];
      if (count === undefined) {
        throw new Error(`Failed to get an entry for Suit: ${suit2} and Rank: ${rank}from the "possibleCards" map for card.`);
      }
      if (count > 0) {
        rankPossible = true;
        break;
      }
    }
  }
  return { suitEliminated: !suitPossible, rankEliminated: !rankPossible };
}

// ---------------
// Misc. functions
// ---------------

// Remove everything from the array that does not match the condition in the function
function filterInPlace<T>(values: T[], predicate: (value: T) => boolean) : T[] {
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
