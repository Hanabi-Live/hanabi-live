import { draw, discard, play } from '../../../test/testActions';
import CardState, { cardInitialState } from '../types/CardState';
import Options from '../types/Options';
import cardsReducer from './cardsReducer';
import initialGameState from './initialGameState';

const defaultOptions = {
  ...(new Options()),
  numPlayers: 3,
};
const gameState = initialGameState(defaultOptions);

describe('cardsReducer', () => {
  describe('holder', () => {
    test('is correct when drawn', () => {
      const deck: CardState[] = [cardInitialState(0), cardInitialState(1)];
      expect(deck[0].holder).toBeNull();

      let newDeck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);
      expect(newDeck[0].holder).toBe(0);

      newDeck = cardsReducer(deck, draw(1, -1, -1, 0), gameState, defaultOptions);
      expect(newDeck[0].holder).toBe(1);
    });

    test('is null when discarded', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const newDeck = cardsReducer(deck, discard(false, 0, 1, 2, 0), gameState, defaultOptions);
      expect(newDeck[0].holder).toBeNull();
    });

    test('is null when played', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const newDeck = cardsReducer(deck, play(0, 1, 2, 0), gameState, defaultOptions);
      expect(newDeck[0].holder).toBeNull();
    });
  });

  describe('isDiscarded', () => {
    test('is false while on the deck', () => {
      const deck: CardState[] = [cardInitialState(0)];
      expect(deck[0].isDiscarded).toBe(false);
    });

    test('is true when discarded', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const newDeck = cardsReducer(deck, discard(false, 0, 1, 2, 0), gameState, defaultOptions);
      expect(newDeck[0].isDiscarded).toBe(true);
    });

    test('is false when played', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const newDeck = cardsReducer(deck, play(0, 1, 2, 0), gameState, defaultOptions);
      expect(newDeck[0].isDiscarded).toBe(false);
    });

    test('is true when misplayed', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);
      const misplay = discard(true, 0, 1, 2, 0); // A misplay is a discard with failed = true

      const newDeck = cardsReducer(deck, misplay, gameState, defaultOptions);
      expect(newDeck[0].isDiscarded).toBe(true);
    });
  });
});
