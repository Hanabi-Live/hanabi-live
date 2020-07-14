import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import { gain } from './clueTokens';

describe('gainClue', () => {
  test.each([...Array(8).keys()])('adds a clue when there are %i clues', (n) => {
    expect(gain(VARIANTS.get(DEFAULT_VARIANT_NAME)!, n)).toBe(n + 1);
  });

  test('does not add clues when maxed out', () => {
    expect(gain(VARIANTS.get(DEFAULT_VARIANT_NAME)!, MAX_CLUE_NUM)).toBe(MAX_CLUE_NUM);
  });

  test.each([...Array(8).keys()])('adds half clue for Clue Starved variants', (n) => {
    expect(gain(VARIANTS.get('Clue Starved (5 Suits)')!, n)).toBeCloseTo(n + 0.5);
  });

  test('does not add a clue when maxed out for Clue Starved variants', () => {
    expect(gain(VARIANTS.get('Clue Starved (5 Suits)')!, MAX_CLUE_NUM)).toBe(MAX_CLUE_NUM);
  });
});
