import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import { startingPace, minEfficiency } from './stats';

describe('startingPace', () => {
  test('returns 13 for No Variant, 4 player', () => {
    expect(startingPace(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 4)).toBe(13);
  });
  test('returns 17 for No Variant, 2 player', () => {
    expect(startingPace(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 2)).toBe(17);
  });

  test('returns 13 for Black (6 Suits), 4 player', () => {
    expect(startingPace(VARIANTS.get('Black (6 Suits)')!, 4)).toBe(13);
  });
  test('returns 17 for Black (6 Suits), 2 player', () => {
    expect(startingPace(VARIANTS.get('Black (6 Suits)')!, 2)).toBe(17);
  });
});

describe('minEfficiency', () => {
  test('returns about 1 for No Variant, 4 player', () => {
    expect(minEfficiency(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 4)).toBeCloseTo(1);
  });
  test('returns about 0.86 for No Variant, 2 player', () => {
    expect(minEfficiency(VARIANTS.get(DEFAULT_VARIANT_NAME)!, 2)).toBeCloseTo(0.86);
  });

  test('returns about 1.15 for Black (6 Suits), 4 player', () => {
    expect(minEfficiency(VARIANTS.get('Black (6 Suits)')!, 4)).toBeCloseTo(1.15);
  });
  test('returns about 1 for Black (6 Suits), 2 player', () => {
    expect(minEfficiency(VARIANTS.get('Black (6 Suits)')!, 2)).toBeCloseTo(1);
  });
});
