import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import { gain } from './clueTokens';

describe('gain', () => {
  test.each([...Array(8).keys()])('adds a clue when there are %i clues', (n) => {
    const clueTokens = gain(VARIANTS.get(DEFAULT_VARIANT_NAME)!, n);
    expect(clueTokens).toBe(n + 1);
  });

  test('does not add clues when maxed out', () => {
    const clueTokens = gain(VARIANTS.get(DEFAULT_VARIANT_NAME)!, MAX_CLUE_NUM);
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });

  test.each([...Array(8).keys()])('adds half clue for Clue Starved variants', (n) => {
    const clueTokens = gain(VARIANTS.get('Clue Starved (5 Suits)')!, n);
    expect(clueTokens).toBeCloseTo(n + 0.5);
  });

  test('does not add a clue when maxed out for Clue Starved variants', () => {
    const clueTokens = gain(VARIANTS.get('Clue Starved (5 Suits)')!, MAX_CLUE_NUM);
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });
});
