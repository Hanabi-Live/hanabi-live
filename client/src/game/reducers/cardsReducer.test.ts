import {
  colorClue,
  draw,
  discard,
  play,
  rankClue,
} from '../../../test/testActions';
import { getVariant } from '../data/gameData';
import CardState from '../types/CardState';
import GameMetadata from '../types/GameMetadata';
import Options from '../types/Options';
import cardsReducer from './cardsReducer';
import initialCardState from './initialStates/initialCardState';
import initialGameState from './initialStates/initialGameState';

const defaultMetadata: GameMetadata = {
  options: {
    ...(new Options()),
    numPlayers: 3,
  },
  playerSeat: null,
  characterAssignments: [],
  characterMetadata: [],
};
const gameState = initialGameState(defaultMetadata);
const variant = getVariant(defaultMetadata.options.variantName);
const defaultCard = initialCardState(0, variant);
const secondCard = initialCardState(1, variant);

describe('cardsReducer', () => {
  describe('holder', () => {
    test('is equal to the player index when drawn', () => {
      const deck: CardState[] = [defaultCard, secondCard];
      expect(deck[0].holder).toBeNull();

      let newDeck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);
      expect(newDeck[0].holder).toBe(0);

      const gameStateNextTurn = { ...gameState, currentPlayerIndex: 1 };

      newDeck = cardsReducer(deck, draw(1, -1, -1, 0), gameStateNextTurn, defaultMetadata);
      expect(newDeck[0].holder).toBe(1);
    });

    test('is null when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, discard(false, 0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].holder).toBeNull();
    });

    test('is null when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, play(0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].holder).toBeNull();
    });
  });

  describe('isDiscarded', () => {
    test('is false while on the deck', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].isDiscarded).toBe(false);
    });

    test('is true when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, discard(false, 0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].isDiscarded).toBe(true);
      expect(newDeck[0].turnDiscarded).toBe(gameState.turn);
    });

    test('is false when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, play(0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].isDiscarded).toBe(false);
    });

    test('is true when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const misplay = discard(true, 0, 1, 2, 0); // A misplay is a discard with failed = true
      const newDeck = cardsReducer(deck, misplay, gameState, defaultMetadata);
      expect(newDeck[0].isDiscarded).toBe(true);
      expect(newDeck[0].turnDiscarded).toBe(gameState.turn);
    });
  });

  describe('isMisplayed', () => {
    test('is false while on the deck', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].isMisplayed).toBe(false);
    });

    test('is false when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, discard(false, 0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is false when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const newDeck = cardsReducer(deck, play(0, 1, 2, 0), gameState, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is true when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const misplay = discard(true, 0, 1, 2, 0); // A misplay is a discard with failed = true
      const newDeck = cardsReducer(deck, misplay, gameState, defaultMetadata);
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
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const clueToCardZero = rankClue(1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(1);

      const anotherClueToCardZero = colorClue(0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(2);
    });

    test('does not change after negative clues', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);
      deck = cardsReducer(deck, draw(0, -1, -1, 1), gameState, defaultMetadata);

      const clueToCardOne = rankClue(1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);

      const anotherClueToCardOne = colorClue(0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);
    });
  });

  describe('clue memory', () => {
    test('is empty initially', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].colorClueMemory.positiveClues.length).toBe(0);
      expect(deck[0].colorClueMemory.negativeClues.length).toBe(0);
      expect(deck[0].rankClueMemory.positiveClues.length).toBe(0);
      expect(deck[0].rankClueMemory.negativeClues.length).toBe(0);
    });
    test('remembers positive clues', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);

      const clueToCardZero = rankClue(1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, defaultMetadata);
      expect(deck[0].rankClueMemory.positiveClues.length).toBe(1);
      expect(deck[0].rankClueMemory.positiveClues[0]).toBe(clueToCardZero.clue.value);

      const anotherClueToCardZero = colorClue(0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, defaultMetadata);
      expect(deck[0].colorClueMemory.positiveClues.length).toBe(1);
      expect(deck[0].colorClueMemory.positiveClues[0]).toBe(anotherClueToCardZero.clue.value);
    });
    test('remembers negative clues and positive clues in the right cards', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);
      deck = cardsReducer(deck, draw(0, -1, -1, 1), gameState, defaultMetadata);

      // In order to apply negative clues, the hand must be correct
      const gameStateWithCorrectHands = { ...gameState, hands: [[0, 1]] };

      const clueToCardOne = rankClue(1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameStateWithCorrectHands, defaultMetadata);
      expect(deck[0].rankClueMemory.negativeClues.length).toBe(1);
      expect(deck[0].rankClueMemory.negativeClues[0]).toBe(clueToCardOne.clue.value);
      expect(deck[1].rankClueMemory.positiveClues.length).toBe(1);
      expect(deck[1].rankClueMemory.positiveClues[0]).toBe(clueToCardOne.clue.value);

      const anotherClueToCardOne = colorClue(0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameStateWithCorrectHands, defaultMetadata);
      expect(deck[0].colorClueMemory.negativeClues.length).toBe(1);
      expect(deck[0].colorClueMemory.negativeClues[0]).toBe(anotherClueToCardOne.clue.value);
      expect(deck[1].colorClueMemory.positiveClues.length).toBe(1);
      expect(deck[1].colorClueMemory.positiveClues[0]).toBe(anotherClueToCardOne.clue.value);
    });
  });
  describe('discard', () => {
    test('eliminates a possibility on other cards', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, -1, -1, 0), gameState, defaultMetadata);
      deck = cardsReducer(deck, draw(0, -1, -1, 1), gameState, defaultMetadata);

      // In order to apply negative clues, the hand must be correct
      const gameStateWithCorrectHands = { ...gameState, hands: [[0, 1]] };

      // Discard a red 1
      const discardCardOne = discard(false, 0, 0, 1, 1);
      deck = cardsReducer(deck, discardCardOne, gameStateWithCorrectHands, defaultMetadata);

      // Expect the remaining card to remove a possibility for a red 1
      // So there are 2 red ones remaining in the deck
      expect(deck[0].possibleCards[0][1]).toBe(2);
    });
    describe('draw', () => {
      test('eliminates a possibility on other players\' cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, -1, -1, 0), gameStateDrawP0, defaultMetadata);

        // P1 draws a red 5
        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 0, 5, 1), gameStateDrawP1, defaultMetadata);

        // Expect the remaining card to remove a possibility for a red 5
        expect(deck[0].possibleCards[0][5]).toBe(0);
      });
      test('eliminates possibilities from previously drawn cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        // P0 draws a red 5
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0, 5, 0), gameStateDrawP0, defaultMetadata);

        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 0, 1, 1), gameStateDrawP1, defaultMetadata);

        // Expect the newly drawn card to remove a possibility for a red 5
        expect(deck[1].possibleCards[0][5]).toBe(0);
      });
    });
  });
});
