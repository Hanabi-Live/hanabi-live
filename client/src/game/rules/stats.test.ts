import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import {
  startingPace, minEfficiency, pace, paceRisk, efficiency,
} from './stats';

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

describe('pace', () => {
  test('is null when deckSize is 0', () => {
    expect(pace(25, 0, 25, 4)).toBeNull();
  });
  test('returns +13 at the beginning of a No Variant, 4 player game', () => {
    expect(pace(0, 34, 25, 4)).toBe(13);
  });
});

describe('paceRisk', () => {
  test('is Zero when pace is 0', () => {
    expect(paceRisk(0, 4)).toBe('Zero');
  });
  test('is Null when pace is null', () => {
    expect(paceRisk(null, 4)).toBe('Null');
  });
});

describe('efficiency', () => {
  test('returns Infinity when potentialCluesLost is 0', () => {
    expect(efficiency(20, 0)).toBe(Infinity);
  });
});
