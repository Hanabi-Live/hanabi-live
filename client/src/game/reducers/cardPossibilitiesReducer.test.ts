import { initArray } from '../../misc';
import { getVariant } from '../data/gameData';
import { colorClue, rankClue } from '../types/Clue';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const numPlayers = 3;
const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers,
  },
  playerSeat: null,
  characterAssignments: initArray(numPlayers, null),
  characterMetadata: [],
};
const variant = getVariant(defaultMetadata.options.variantName);
const defaultCard = initialCardState(0, variant);

// Can be used to count possible cards in a possibleCards array using a reduce function
function countPossibleCards(count: number, arr: readonly number[]) {
  return count + arr.filter((c) => c > 0).length;
}

describe('cardPossibilitiesReducer', () => {
  test('applies a simple positive clue', () => {
    const red = colorClue(variant.clueColors[0]);

    const newCard = cardPossibilitiesReducer(defaultCard, red, true, defaultMetadata);

    expect(newCard.colorClueMemory.possibilities.includes(0)).toBe(true);
    expect(newCard.colorClueMemory.possibilities.length).toBe(1);

    expect(newCard.rankClueMemory.possibilities.length).toBe(5);

    // This card can only be red
    expect(newCard.possibleCards.reduce(countPossibleCards, 0)).toBe(5);
  });

  test('applies a simple negative clue', () => {
    const red = colorClue(variant.clueColors[0]);

    const newCard = cardPossibilitiesReducer(defaultCard, red, false, defaultMetadata);

    expect(newCard.colorClueMemory.possibilities.includes(0)).toBe(false);
    expect(newCard.colorClueMemory.possibilities.length).toBe(4);

    expect(newCard.rankClueMemory.possibilities.length).toBe(5);

    // This card can be any color except red
    expect(newCard.possibleCards.reduce(countPossibleCards, 0)).toBe(20);
  });

  test('a nontrivial example', () => {
    let myVariant = getVariant('Rainbow-Ones & Brown (6 Suits)');
    
    const red = colorClue(variant.clueColors[0]);
    const one = rankClue(variant.clueRanks[0]);
    
    let card = initialCardState(0, myVariant);
    card = cardPossibilitiesReducer(card, red, true, defaultMetadata);
    card = cardPossibilitiesReducer(card, one, false, defaultMetadata);

    // a card with positive red and negative one can't be yellow
    expect(card.colorClueMemory.possibilities.includes(1)).toBe(false);
  });
});
