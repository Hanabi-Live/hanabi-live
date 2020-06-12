import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import { totalCards } from './deck';

describe('totalCards', () => {
  test('returns 50 for No Variant', () => {
    expect(totalCards(VARIANTS.get(DEFAULT_VARIANT_NAME)!)).toBe(50);
  });

  test.each`
  suits | cards
  ${3}  | ${30}
  ${4}  | ${40}
  ${6}  | ${60}
  `('returns $cards for $suits suits', ({ suits, cards }) => {
    expect(totalCards(VARIANTS.get(`${suits} Suits`)!)).toBe(cards);
  });

  test.each`
  suits | cards
  ${5}  | ${45}
  ${6}  | ${55}
  `('returns $cards for Black ($suits suits)', ({ suits, cards }) => {
    expect(totalCards(VARIANTS.get(`Black (${suits} Suits)`)!)).toBe(cards);
  });

  test.each`
  suits | cards
  ${5}  | ${45}
  ${6}  | ${54}
  `('returns $cards for Up or Down ($suits suits)', ({ suits, cards }) => {
    expect(totalCards(VARIANTS.get(`Up or Down (${suits} Suits)`)!)).toBe(cards);
  });
});
