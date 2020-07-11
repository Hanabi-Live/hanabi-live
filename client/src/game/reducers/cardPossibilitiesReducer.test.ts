import { getVariant } from '../data/gameData';
import { colorClue, rankClue } from '../types/Clue';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';
import initialMetadata from './initialStates/initialMetadata';

const numPlayers = 3;
const defaultMetadata = initialMetadata(numPlayers);
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

  test.skip('removes possibilities based on previous rank and color clues', () => {
    const metadata = initialMetadata(numPlayers, 'Rainbow-Ones & Brown (6 Suits)');
    const rainbowOnesAndBrown = getVariant(metadata.options.variantName);

    const redClue = colorClue(variant.clueColors[0]);
    const oneClue = rankClue(variant.clueRanks[0]);

    let card = initialCardState(0, rainbowOnesAndBrown);
    card = cardPossibilitiesReducer(card, redClue, true, metadata);
    card = cardPossibilitiesReducer(card, oneClue, false, metadata);

    // A card with positive red and negative one cannot be yellow
    expect(card.colorClueMemory.possibilities.includes(1)).toBe(false);
  });
});
