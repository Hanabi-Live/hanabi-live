import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import { totalCards } from './deck';

test('totalCards for 5 suits is 50', () => {
  expect(totalCards(VARIANTS.get(DEFAULT_VARIANT_NAME)!)).toBe(50);
});

test('totalCards for 6 suits is 60', () => {
  expect(totalCards(VARIANTS.get('6 Suits')!)).toBe(60);
});

test('totalCards for Black (5 Suits) is 45', () => {
  expect(totalCards(VARIANTS.get('Black (5 Suits)')!)).toBe(45);
});

test('totalCards for Black (6 Suits) is 55', () => {
  expect(totalCards(VARIANTS.get('Black (6 Suits)')!)).toBe(55);
});

test('totalCards for Up or Down (5 Suits) is 45', () => {
  expect(totalCards(VARIANTS.get('Up or Down (5 Suits)')!)).toBe(45);
});

test('totalCards for Up or Down (6 Suits) is 54', () => {
  expect(totalCards(VARIANTS.get('Up or Down (6 Suits)')!)).toBe(54);
});
