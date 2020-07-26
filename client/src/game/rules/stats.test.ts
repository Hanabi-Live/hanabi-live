import { getVariant } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import * as hand from './hand';
import {
  startingPace,
  minEfficiency,
  pace,
  paceRisk,
  efficiency,
} from './stats';

const defaultVariant = getVariant(DEFAULT_VARIANT_NAME);
const blackVariant = getVariant('Black (6 Suits)');
const clueStarvedVariant = getVariant('Clue Starved (6 Suits)');
const cardsPerHand2Player = hand.cardsPerHand(2, false, false);
const cardsPerHand4Player = hand.cardsPerHand(4, false, false);
const cardsPerHand2PlayerOneExtra = hand.cardsPerHand(2, true, false);
const cardsPerHand2PlayerOneLess = hand.cardsPerHand(2, false, true);

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

  test('returns 15 for 2-player No Variant with one extra card', () => {
    expect(startingPace(2, cardsPerHand2PlayerOneExtra, defaultVariant)).toBe(15);
  });

  test('returns 19 for 2-player No Variant with one less card', () => {
    expect(startingPace(2, cardsPerHand2PlayerOneLess, defaultVariant)).toBe(19);
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

  test('returns about 1.43 for 2-player Clue Starved (6 Suits)', () => {
    expect(minEfficiency(2, clueStarvedVariant, false, false)).toBeCloseTo(1.43);
  });

  test('returns about 1.58 for 4-player Clue Starved (6 Suits)', () => {
    expect(minEfficiency(4, clueStarvedVariant, false, false)).toBeCloseTo(1.58);
  });
});

describe('pace', () => {
  test('is null when deckSize is 0', () => {
    expect(pace(25, 0, 25, 4, false)).toBeNull();
  });

  test('returns +13 at the beginning of a 4-player No Variant game', () => {
    expect(pace(0, 34, 25, 4, false)).toBe(13);
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
