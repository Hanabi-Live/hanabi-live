import testMetadata from '../../../test/testMetadata';
import { getVariant } from '../data/gameData';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);
const variant = getVariant(defaultMetadata.options.variantName);
const defaultCard = initialCardState(0, variant);

// Count possible cards, respecting both clues and observations.
function countPossibleCards(state: CardState) {
  return state.possibleCardsFromClues.filter(
    ([suitIndex, rank]) => state.possibleCardsFromObservation[suitIndex][rank] > 0,
  ).length;
}

function possibilities(possibleCardsFromClues: ReadonlyArray<readonly [number, number]>) {
  const possibleSuits : Set<number> = new Set();
  const possibleRanks : Set<number> = new Set();
  for (const [suit, rank] of possibleCardsFromClues) {
    possibleSuits.add(suit);
    possibleRanks.add(rank);
  }
  return { possibleSuits, possibleRanks };
}

describe('cardPossibilitiesReducer', () => {
  test('applies a simple positive clue', () => {
    const red = colorClue(variant.clueColors[0]);

    const newCard = cardPossibilitiesReducer(defaultCard, red, true, defaultMetadata);

    const { possibleSuits, possibleRanks } = possibilities(newCard.possibleCardsFromClues);
    expect(possibleSuits.has(0)).toBe(true);
    expect(possibleSuits.size).toBe(1);

    expect(possibleRanks.size).toBe(5);

    // This card can only be red
    expect(countPossibleCards(newCard)).toBe(5);
  });

  test('applies a simple negative clue', () => {
    const red = colorClue(variant.clueColors[0]);

    const newCard = cardPossibilitiesReducer(defaultCard, red, false, defaultMetadata);

    const { possibleSuits, possibleRanks } = possibilities(newCard.possibleCardsFromClues);
    expect(possibleSuits.has(0)).toBe(false);
    expect(possibleSuits.size).toBe(4);

    expect(possibleRanks.size).toBe(5);

    // This card can be any color except red
    expect(countPossibleCards(newCard)).toBe(20);
  });

  test('removes possibilities based on previous rank and color clues', () => {
    const metadata = testMetadata(numPlayers, 'Rainbow-Ones & Brown (6 Suits)');
    const rainbowOnesAndBrown = getVariant(metadata.options.variantName);

    const redClue = colorClue(variant.clueColors[0]);
    const oneClue = rankClue(variant.clueRanks[0]);

    let card = initialCardState(0, rainbowOnesAndBrown);
    card = cardPossibilitiesReducer(card, redClue, true, metadata);
    card = cardPossibilitiesReducer(card, oneClue, false, metadata);

    const { possibleSuits } = possibilities(card.possibleCardsFromClues);
    // A card with positive red and negative one cannot be yellow
    expect(possibleSuits.has(1)).toBe(false);
  });
});
