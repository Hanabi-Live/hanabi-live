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
