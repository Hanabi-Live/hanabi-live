import { discard } from '../../../test/testActions';
import { getVariant } from '../data/gameData';
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from '../types/constants';
import { gain } from './clueTokens';

const defaultVariant = getVariant(DEFAULT_VARIANT_NAME);
const clueStarvedVariant = getVariant('Clue Starved (5 Suits)');
const discardAction = discard(0, 0, 0, 1, false);

describe('gain', () => {
  test.each([...Array(8).keys()])('adds a clue when there are %i clues', (n) => {
    const clueTokens = gain(discardAction, n, defaultVariant);
    expect(clueTokens).toBe(n + 1);
  });

  test('does not add clues when maxed out', () => {
    const clueTokens = gain(discardAction, MAX_CLUE_NUM, defaultVariant);
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });

  test.each([...Array(8).keys()])('adds half clue for Clue Starved variants', (n) => {
    const clueTokens = gain(discardAction, n, clueStarvedVariant);
    expect(clueTokens).toBeCloseTo(n + 0.5);
  });

  test('does not add a clue when maxed out for Clue Starved variants', () => {
    const clueTokens = gain(discardAction, MAX_CLUE_NUM, clueStarvedVariant);
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });
});
