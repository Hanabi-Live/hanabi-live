import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import { hasReversedSuits } from './variant';

describe('hasReversedSuits', () => {
  test('returns false for No Variant', () => {
    expect(hasReversedSuits(VARIANTS.get(DEFAULT_VARIANT_NAME)!)).toBe(false);
  });

  test.each([3, 4, 5, 6])('returns true for Reversed (%i Suits)', (n) => {
    expect(hasReversedSuits(VARIANTS.get(`Reversed (${n} Suits)`)!)).toBe(true);
  });

  test.each([3, 4, 5, 6])('returns true for White Reversed (%i Suits)', (n) => {
    expect(hasReversedSuits(VARIANTS.get(`White Reversed (${n} Suits)`)!)).toBe(true);
  });

  test.each([5, 6])('returns true for Up or Down (%i Suits)', (n) => {
    expect(hasReversedSuits(VARIANTS.get(`Up or Down (${n} Suits)`)!)).toBe(true);
  });
});
