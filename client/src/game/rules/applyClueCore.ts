import CardState from '../types/CardState';
import { ColorClue, RankClue } from '../types/Clue';
import Variant from '../types/Variant';

export interface PossibilityToRemove {
  readonly suitIndex: number;
  readonly rank: number;
  readonly all: boolean;
}

function filterPossibilities(
  possibilites: ReadonlyArray<readonly [number, number]>,
  clueTouch: ReadonlyArray<readonly boolean[]>,
  positive: boolean,
) : ReadonlyArray<readonly [number, number]> {
  return possibilites.filter(([x, y]) => clueTouch[x][y] === positive);
}

export function applyColorClue(
  state: CardState,
  clue: Readonly<ColorClue>,
  positive: boolean,
  variant: Variant,
) {
  const clueTouch = variant.touchColors[variant.clueColors.indexOf(clue.value)];
  return filterPossibilities(state.possibleCardsByClues, clueTouch, positive);
}

export function applyRankClue(
  state: CardState,
  clue: Readonly<RankClue>,
  positive: boolean,
  variant: Variant,
) {
  const clueTouch = variant.touchRanks[variant.clueRanks.indexOf(clue.value)];
  return filterPossibilities(state.possibleCardsByClues, clueTouch, positive);
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
/*
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
*/
