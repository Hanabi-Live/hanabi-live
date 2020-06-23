import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import * as hand from './hand';
import {
  startingPace,
  minEfficiency,
  pace,
  paceRisk,
  efficiency,
} from './stats';

const defaultVariant = VARIANTS.get(DEFAULT_VARIANT_NAME);
if (defaultVariant === undefined) {
  throw new Error('Unable to find the default variant in the "VARIANTS" map.');
}
const blackVariantName = 'Black (6 Suits)';
const blackVariant = VARIANTS.get(blackVariantName);
if (blackVariant === undefined) {
  throw new Error(`Unable to find the "${blackVariantName}" variant in the "VARIANTS" map.`);
}
const cardsPerHand2Player = hand.cardsPerHand(2, false, false);
const cardsPerHand4Player = hand.cardsPerHand(4, false, false);

describe('startingPace', () => {
  test('returns 17 for 2-player No Variant', () => {
    expect(startingPace(2, cardsPerHand2Player, defaultVariant)).toBe(17);
  });
  test('returns 13 for 4-player No Variant', () => {
    expect(startingPace(4, cardsPerHand4Player, defaultVariant)).toBe(13);
  });

  test('returns 17 for 2-player Black (6 Suits)', () => {
    expect(startingPace(2, cardsPerHand2Player, blackVariant)).toBe(17);
  });
  test('returns 13 for 4-player Black (6 Suits)', () => {
    expect(startingPace(4, cardsPerHand4Player, blackVariant)).toBe(13);
  });
});

describe('minEfficiency', () => {
  test('returns about 0.86 for 2-player No Variant', () => {
    expect(minEfficiency(2, defaultVariant, false, false)).toBeCloseTo(0.86);
  });
  test('returns about 1 for 4-player No Variant', () => {
    expect(minEfficiency(4, defaultVariant, false, false)).toBeCloseTo(1);
  });

  test('returns about 1 for 2-player Black (6 Suits)', () => {
    expect(minEfficiency(2, blackVariant, false, false)).toBeCloseTo(1);
  });
  test('returns about 1.15 for 4-player Black (6 Suits)', () => {
    expect(minEfficiency(4, blackVariant, false, false)).toBeCloseTo(1.15);
  });
});

describe('pace', () => {
  test('is null when deckSize is 0', () => {
    expect(pace(25, 0, 25, 4)).toBeNull();
  });
  test('returns +13 at the beginning of a 4-player No Variant game', () => {
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
