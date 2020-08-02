import {
  colorClue,
  draw,
  discard,
  play,
  rankClue,
} from '../../../test/testActions';
import testMetadata from '../../../test/testMetadata';
import { getVariant } from '../data/gameData';
import CardState from '../types/CardState';
import cardsReducer from './cardsReducer';
import initialCardState from './initialStates/initialCardState';
import initialGameState from './initialStates/initialGameState';

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);
const gameState = initialGameState(defaultMetadata);
const variant = getVariant(defaultMetadata.options.variantName);
const defaultCard = initialCardState(0, variant);
const secondCard = initialCardState(1, variant);

describe('cardsReducer', () => {
  describe('location', () => {
    test('is equal to the player index when drawn', () => {
      const deck: CardState[] = [defaultCard, secondCard];
      expect(deck[0].location).toBe('deck');

      let newDeck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      expect(newDeck[0].location).toBe(0);

      const gameStateNextTurn = { ...gameState, currentPlayerIndex: 1 };

      newDeck = cardsReducer(deck, draw(1, 0), gameStateNextTurn, true, defaultMetadata);
      expect(newDeck[0].location).toBe(1);
    });

    test('is discard when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, true, defaultMetadata);
      expect(newDeck[0].location).toBe('discard');
    });

    test('is playStack when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, true, defaultMetadata);
      expect(newDeck[0].location).toBe('playStack');
    });
  });

  describe('segmentDiscarded', () => {
    test('is null while on the deck', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].segmentDiscarded).toBe(null);
    });

    test('is correct when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, true, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(gameState.turn.segment);
    });

    test('is null when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, true, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(null);
    });

    test('is correct when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with "failed = true"
      const newDeck = cardsReducer(deck, misplay, gameState, true, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(gameState.turn.segment);
    });
  });

  describe('isMisplayed', () => {
    test('is false while on the deck', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].isMisplayed).toBe(false);
    });

    test('is false when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, true, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is false when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, true, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is true when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with failed = true
      const newDeck = cardsReducer(deck, misplay, gameState, true, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(true);
    });
  });

  describe('numPositiveClues', () => {
    test('is 0 initially', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].numPositiveClues).toBe(0);
    });

    test('increments by 1 after each positive clue', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);

      const clueToCardZero = rankClue(1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, true, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(1);

      const anotherClueToCardZero = colorClue(0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, true, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(2);
    });

    test('does not change after negative clues', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      deck = cardsReducer(deck, draw(0, 1), gameState, true, defaultMetadata);

      const clueToCardOne = rankClue(1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameState, true, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);

      const anotherClueToCardOne = colorClue(0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameState, true, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);
    });
  });

  describe('discard', () => {
    test('eliminates a possibility on other cards', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      deck = cardsReducer(deck, draw(0, 1), gameState, true, defaultMetadata);

      // In order to apply negative clues, the hand must be correct
      const gameStateWithCorrectHands = { ...gameState, hands: [[0, 1]] };

      // Discard a red 1
      const discardCardOne = discard(0, 1, 0, 1, false);
      deck = cardsReducer(deck, discardCardOne, gameStateWithCorrectHands, true, defaultMetadata);

      // Expect the remaining card to remove a possibility for a red 1
      // So there are 2 red ones remaining in the deck
      expect(deck[0].possibleCardsFromObservation[0][1]).toBe(2);
    });
    describe('draw', () => {
      test('eliminates a possibility on other players\' cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0), gameStateDrawP0, true, defaultMetadata);

        // P1 draws a red 5
        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawP1, true, defaultMetadata);

        // Expect the remaining card to remove a possibility for a red 5
        expect(deck[0].possibleCardsFromObservation[0][5]).toBe(0);
      });
      test('eliminates possibilities from previously drawn cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        // P0 draws a red 5
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0, 0, 5), gameStateDrawP0, true, defaultMetadata);

        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 1, 0, 1), gameStateDrawP1, true, defaultMetadata);

        // Expect the newly drawn card to remove a possibility for a red 5
        expect(deck[1].possibleCardsFromObservation[0][5]).toBe(0);
      });
    });
  });
});
