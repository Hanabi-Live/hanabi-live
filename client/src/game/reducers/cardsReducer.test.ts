import {
  draw, discard, play, clue,
} from '../../../test/testActions';
import CardState, { cardInitialState } from '../types/CardState';
import ClueType from '../types/ClueType';
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

  describe('numPositiveClues', () => {
    test('is 0 initially', () => {
      const deck: CardState[] = [cardInitialState(0)];
      expect(deck[0].numPositiveClues).toBe(0);
    });

    test('increments by 1 after each positive clue', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const clueToCardZero = clue(ClueType.Rank, 1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, defaultOptions);
      expect(deck[0].numPositiveClues).toBe(1);

      const anotherClueToCardZero = clue(ClueType.Color, 0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, defaultOptions);
      expect(deck[0].numPositiveClues).toBe(2);
    });

    test('does not change after negative clues', () => {
      let deck: CardState[] = [cardInitialState(0), cardInitialState(1)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);
      deck = cardsReducer(deck, draw(0, -1, -1, 1), gameState, defaultOptions);

      const clueToCardOne = clue(ClueType.Rank, 1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameState, defaultOptions);
      expect(deck[0].numPositiveClues).toBe(0);

      const anotherClueToCardOne = clue(ClueType.Color, 0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameState, defaultOptions);
      expect(deck[0].numPositiveClues).toBe(0);
    });
  });

  describe('clue memory', () => {
    test('is empty initially', () => {
      const deck: CardState[] = [cardInitialState(0)];
      expect(deck[0].colorClueMemory.positiveClues.length).toBe(0);
      expect(deck[0].colorClueMemory.negativeClues.length).toBe(0);
      expect(deck[0].rankClueMemory.positiveClues.length).toBe(0);
      expect(deck[0].rankClueMemory.negativeClues.length).toBe(0);
    });
    test('remembers positive clues', () => {
      let deck: CardState[] = [cardInitialState(0)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);

      const clueToCardZero = clue(ClueType.Rank, 1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, defaultOptions);
      expect(deck[0].rankClueMemory.positiveClues.length).toBe(1);
      expect(deck[0].rankClueMemory.positiveClues[0]).toBe(clueToCardZero.clue.value);

      const anotherClueToCardZero = clue(ClueType.Color, 0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, defaultOptions);
      expect(deck[0].colorClueMemory.positiveClues.length).toBe(1);
      expect(deck[0].colorClueMemory.positiveClues[0]).toBe(anotherClueToCardZero.clue.value);
    });
    test('remembers negative clues and positive clues in the right cards', () => {
      let deck: CardState[] = [cardInitialState(0), cardInitialState(1)];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultOptions);
      deck = cardsReducer(deck, draw(0, -1, -1, 1), gameState, defaultOptions);

      // In order to apply negative clues, the hand must be correct
      const gameStateWithCorrectHands = { ...gameState, hands: [[0, 1]] };

      const clueToCardOne = clue(ClueType.Rank, 1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameStateWithCorrectHands, defaultOptions);
      expect(deck[0].rankClueMemory.negativeClues.length).toBe(1);
      expect(deck[0].rankClueMemory.negativeClues[0]).toBe(clueToCardOne.clue.value);
      expect(deck[1].rankClueMemory.positiveClues.length).toBe(1);
      expect(deck[1].rankClueMemory.positiveClues[0]).toBe(clueToCardOne.clue.value);

      const anotherClueToCardOne = clue(ClueType.Color, 0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameStateWithCorrectHands, defaultOptions);
      expect(deck[0].colorClueMemory.negativeClues.length).toBe(1);
      expect(deck[0].colorClueMemory.negativeClues[0]).toBe(anotherClueToCardOne.clue.value);
      expect(deck[1].colorClueMemory.positiveClues.length).toBe(1);
      expect(deck[1].colorClueMemory.positiveClues[0]).toBe(anotherClueToCardOne.clue.value);
    });
  });
});
