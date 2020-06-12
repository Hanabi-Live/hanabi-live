import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import { gainClue } from './clues';

test('gainClue adds a clue', () => {
  expect(gainClue(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 5)).toBe(6);
});

test('gainClue adds a clue when there are no clues', () => {
  expect(gainClue(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 0)).toBe(1);
});

test('gainClue does not add clues when maxed out', () => {
  expect(gainClue(VARIANTS.get(DEFAULT_VARIANT_NAME)!, MAX_CLUE_NUM)).toBe(MAX_CLUE_NUM);
});

test('gainClue adds half clue for Clue Starved variants', () => {
  expect(gainClue(VARIANTS.get('Clue Starved (5 Suits)')!, 0)).toBe(0.5);
});

test('gainClue does not add a clue when maxed out for Clue Starved variants', () => {
  expect(gainClue(VARIANTS.get('Clue Starved (5 Suits)')!, MAX_CLUE_NUM)).toBe(MAX_CLUE_NUM);
});
