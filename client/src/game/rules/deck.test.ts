import { VARIANTS } from '../data/gameData';
import { DEFAULT_VARIANT_NAME } from '../types/constants';
import { totalCards } from './deck';

test('totalCards for No Variant is 50', () => {
  expect(totalCards(VARIANTS.get(DEFAULT_VARIANT_NAME)!)).toBe(50);
});

test.each`
suits | cards
${3}  | ${30}
${4}  | ${40}
${6}  | ${60}
`('totalCards for $suits suits is $cards', ({ suits, cards }) => {
  expect(totalCards(VARIANTS.get(`${suits} Suits`)!)).toBe(cards);
});

test.each`
suits | cards
${5}  | ${45}
${6}  | ${55}
`('totalCards for Black ($suits suits) is $cards', ({ suits, cards }) => {
  expect(totalCards(VARIANTS.get(`Black (${suits} Suits)`)!)).toBe(cards);
});

test.each`
suits | cards
${5}  | ${45}
${6}  | ${54}
`('totalCards for Up or Down ($suits suits) is $cards', ({ suits, cards }) => {
  expect(totalCards(VARIANTS.get(`Up or Down (${suits} Suits)`)!)).toBe(cards);
});
