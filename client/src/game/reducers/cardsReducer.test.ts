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
const thirdCard = initialCardState(2, variant);
const fourthCard = initialCardState(3, variant);
const fifthCard = initialCardState(4, variant);

describe('cardsReducer', () => {
  describe('location', () => {
    test('is equal to the player index when drawn', () => {
      const deck: CardState[] = [defaultCard, secondCard];
      expect(deck[0].location).toBe('deck');

      let newDeck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);
      expect(newDeck[0].location).toBe(0);

      const gameStateNextTurn = { ...gameState, currentPlayerIndex: 1 };

      newDeck = cardsReducer(deck, draw(1, 0), gameStateNextTurn, defaultMetadata);
      expect(newDeck[0].location).toBe(1);
    });

    test('is discard when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, defaultMetadata);
      expect(newDeck[0].location).toBe('discard');
    });

    test('is playStack when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, defaultMetadata);
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
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(gameState.turn.segment);
    });

    test('is null when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(null);
    });

    test('is correct when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with "failed = true"
      const newDeck = cardsReducer(deck, misplay, gameState, defaultMetadata);
      expect(newDeck[0].segmentDiscarded).toBe(gameState.turn.segment);
    });
  });

  describe('segmentFirstClued', () => {
    test('remembers the segment when the first clue happened', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);
      expect(deck[0].segmentFirstClued).toBeNull();

      const clue1Segment = 999;
      const gameStateFirstTurn = {
        ...gameState,
        turn: { ...gameState.turn, segment: clue1Segment },
      };

      const testClue1 = rankClue(5, 1, [0], 0, gameStateFirstTurn.turn.turnNum);
      deck = cardsReducer(deck, testClue1, gameStateFirstTurn, defaultMetadata);
      expect(deck[0].segmentFirstClued).toEqual(clue1Segment);

      const clue2Segment = clue1Segment + 1;
      const gameStateNextTurn = {
        ...gameStateFirstTurn,
        turn: { ...gameStateFirstTurn.turn, segment: clue2Segment },
      };

      const testClue2 = colorClue(2, 2, [0], 0, gameStateNextTurn.turn.turnNum);
      deck = cardsReducer(deck, testClue2, gameStateNextTurn, defaultMetadata);
      expect(deck[0].segmentFirstClued).toEqual(clue1Segment);
    });
  });

  describe('isMisplayed', () => {
    test('is false while on the deck', () => {
      const deck: CardState[] = [defaultCard];
      expect(deck[0].isMisplayed).toBe(false);
    });

    test('is false when discarded', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(deck, discardAction, gameState, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is false when played', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(deck, playAction, gameState, defaultMetadata);
      expect(newDeck[0].isMisplayed).toBe(false);
    });

    test('is true when misplayed', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with failed = true
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
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);

      const clueToCardZero = rankClue(1, 2, [0], 0, 0);
      deck = cardsReducer(deck, clueToCardZero, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(1);

      const anotherClueToCardZero = colorClue(0, 1, [0], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardZero, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(2);
    });

    test('does not change after negative clues', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);
      deck = cardsReducer(deck, draw(0, 1), gameState, defaultMetadata);

      const clueToCardOne = rankClue(1, 2, [1], 0, 0);
      deck = cardsReducer(deck, clueToCardOne, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);

      const anotherClueToCardOne = colorClue(0, 1, [1], 0, 0);
      deck = cardsReducer(deck, anotherClueToCardOne, gameState, defaultMetadata);
      expect(deck[0].numPositiveClues).toBe(0);
    });
  });

  describe('clue', () => {
    test('removes inferred negative possibilities on clued cards in other hand', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard];
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 2, 0, 5), nextGameState, defaultMetadata);

      // Load up the negative clues so we can make inferences
      const redClue = colorClue(0, 1, [], 0, 0);
      const yellowClue = colorClue(1, 1, [], 0, 0);
      const greenClue = colorClue(2, 1, [], 0, 0);
      deck = cardsReducer(deck, redClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, yellowClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, greenClue, nextGameState, defaultMetadata);

      const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, fivesClue, nextGameState, defaultMetadata);

      // The two fives in our hand must be blue/purple in some order.  The other person will know
      // their card is not one of those fives.
      expect(deducedPossible(deck[2], 3, 5)).toBe(false);
      expect(deducedPossible(deck[2], 4, 5)).toBe(false);
    });
    test('can remove just one copy of a card from inference to other hand, if necessary', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, defaultMetadata);

      // Load up the negative clues so we can make inferences
      const greenClue = colorClue(2, 1, [], 0, 0);
      const blueClue = colorClue(3, 1, [], 0, 0);
      const purpleClue = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, blueClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, purpleClue, nextGameState, defaultMetadata);

      const foursClue = rankClue(4, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, foursClue, nextGameState, defaultMetadata);

      // The two fours in our hand must be red/yellow in some order.  The other person will know
      // their cards are not one of those fours, but they obviously don't rule out both copies
      // of each four.
      expect(deducedPossible(deck[2], 0, 4)).toBe(true);
      expect(deducedPossible(deck[2], 1, 4)).toBe(true);
      expect(deducedPossible(deck[3], 0, 4)).toBe(true);
      expect(deducedPossible(deck[3], 1, 4)).toBe(true);
    });
    test('inferences within other hands stay within those hands (we know their cards)', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard, fifthCard];
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, defaultMetadata);

      // Load up the negative clues so inferences can be made
      const greenClueToOther = colorClue(2, 0, [], 1, 0);
      const blueClueToOther = colorClue(3, 0, [], 1, 0);
      const purpleClueToOther = colorClue(4, 0, [], 1, 0);
      const greenClueToUs = colorClue(2, 1, [], 0, 0);
      const blueClueToUs = colorClue(3, 1, [], 0, 0);
      const purpleClueToUs = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClueToOther, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, blueClueToOther, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, purpleClueToOther, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, greenClueToUs, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, blueClueToUs, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, purpleClueToUs, nextGameState, defaultMetadata);

      nextGameState = { ...gameState, hands: [[0, 1], [2, 3, 4]] };
      deck = cardsReducer(deck, draw(1, 4, 2, 4), nextGameState, defaultMetadata);

      const foursClueToUs = rankClue(4, 2, [0, 1], 0, 0);
      const foursClueToOther = rankClue(4, 2, [2, 3, 4], 1, 1);
      deck = cardsReducer(deck, foursClueToUs, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, foursClueToOther, nextGameState, defaultMetadata);

      // The other player has inferred their first two fours are red/yellow in some order.
      // Therefore they know their other four is not red/yellow
      expect(deducedPossible(deck[4], 0, 4)).toBe(false);
      expect(deducedPossible(deck[4], 1, 4)).toBe(false);

      // We already know that the two fours in our hand are the other red/yellow fours.
      // We don't want the projected inference in the other hand to cause us to remove
      // the remaining copy/possibility of red/yellow on our fours.
      expect(deducedPossible(deck[0], 0, 4)).toBe(true);
      expect(deducedPossible(deck[0], 1, 4)).toBe(true);
      expect(deducedPossible(deck[1], 0, 4)).toBe(true);
      expect(deducedPossible(deck[1], 1, 4)).toBe(true);
    });
  });

  describe('discard', () => {
    test('eliminates a possibility on other cards', () => {
      let deck: CardState[] = [defaultCard, secondCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);
      deck = cardsReducer(deck, draw(0, 1), gameState, defaultMetadata);

      const gameStateWithCorrectHands = { ...gameState, hands: [[0, 1]] };

      // Discard a red 1
      const discardCardOne = discard(0, 1, 0, 1, false);
      deck = cardsReducer(deck, discardCardOne, gameStateWithCorrectHands, defaultMetadata);

      // Expect the remaining card to remove a possibility for a red 1
      // So there are 2 red ones remaining in the deck
      expect(deducedPossible(deck[0], 0, 1)).toBe(true);
    });
    test('only eliminates possibility on card inferred with it', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, defaultMetadata);
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };

      // Load up the negative clues so inferences can be made
      const greenClue = colorClue(2, 1, [], 0, 0);
      const blueClue = colorClue(3, 1, [], 0, 0);
      const purpleClue = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, blueClue, nextGameState, defaultMetadata);
      deck = cardsReducer(deck, purpleClue, nextGameState, defaultMetadata);

      const foursClue = rankClue(4, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, foursClue, nextGameState, defaultMetadata);

      // Discards red 4
      const discardCardOne = discard(0, 0, 0, 4, false);
      nextGameState = { ...gameState, hands: [[1], [2, 3]] };
      deck = cardsReducer(deck, discardCardOne, nextGameState, defaultMetadata);

      // The other red/yellow 4 in the inferred pair from our hand is now known to not be red
      expect(deducedPossible(deck[1], 0, 4)).toBe(false);

      // We already removed red 4 when we inferred our two fours.
      // We shouldn't remove it a second time.
      expect(deducedPossible(deck[2], 0, 4)).toBe(true);
      expect(deducedPossible(deck[3], 0, 4)).toBe(true);
    });
    describe('draw', () => {
      test('eliminates a possibility on other players\' cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0), gameStateDrawP0, defaultMetadata);

        // P1 draws a red 5
        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawP1, defaultMetadata);

        // Expect the remaining card to remove a possibility for a red 5
        expect(deducedPossible(deck[0], 0, 5)).toBe(false);
      });
      test('eliminates possibilities from previously drawn cards', () => {
        let deck: CardState[] = [defaultCard, secondCard];
        // P0 draws a red 5
        const gameStateDrawP0 = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0, 0, 5), gameStateDrawP0, defaultMetadata);

        const gameStateDrawP1 = { ...gameState, hands: [[0], [1]] };
        deck = cardsReducer(deck, draw(1, 1, 0, 1), gameStateDrawP1, defaultMetadata);

        // Expect the newly drawn card to remove a possibility for a red 5
        expect(deducedPossible(deck[1], 0, 5)).toBe(false);
      });
      test('removes inferred negative possibilities on newly drawn card in own hand', () => {
        let deck: CardState[] = [defaultCard, secondCard, thirdCard];
        let nextGameState = { ...gameState, hands: [[0]] };
        deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1]] };
        deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);

        const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, defaultMetadata);

        // Load up the negative clues so we can make inferences
        const redClue = colorClue(0, 1, [], 0, 0);
        const yellowClue = colorClue(1, 1, [], 0, 0);
        const greenClue = colorClue(2, 1, [], 0, 0);
        deck = cardsReducer(deck, redClue, nextGameState, defaultMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, defaultMetadata);
        deck = cardsReducer(deck, greenClue, nextGameState, defaultMetadata);

        // The two fives must be blue/purple in some order.  The newly drawn card can't be
        // one of those fives.
        nextGameState = { ...gameState, hands: [[0, 1, 2]] };
        deck = cardsReducer(deck, draw(0, 2), nextGameState, defaultMetadata);

        expect(deducedPossible(deck[2], 3, 5)).toBe(false);
        expect(deducedPossible(deck[2], 4, 5)).toBe(false);
      });
      test('removes inferred negative possibilities on newly drawn card in other hand', () => {
        let deck: CardState[] = [defaultCard, secondCard, thirdCard];
        let nextGameState = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1], []] };
        deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);

        const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, defaultMetadata);

        // Load up the negative clues so we can make inferences
        const redClue = colorClue(0, 1, [], 0, 0);
        const yellowClue = colorClue(1, 1, [], 0, 0);
        const greenClue = colorClue(2, 1, [], 0, 0);
        deck = cardsReducer(deck, redClue, nextGameState, defaultMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, defaultMetadata);
        deck = cardsReducer(deck, greenClue, nextGameState, defaultMetadata);

        // The two fives must be blue/purple in some order.  The newly drawn card can't be
        // one of those fives.
        nextGameState = { ...gameState, hands: [[0, 1], [2]] };
        deck = cardsReducer(deck, draw(1, 2), nextGameState, defaultMetadata);

        expect(deducedPossible(deck[2], 3, 5)).toBe(false);
        expect(deducedPossible(deck[2], 4, 5)).toBe(false);
      });
      describe('from other hand allows new inferences in own hand', () => {
        test('as Alice', () => {
          let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
          let nextGameState = { ...gameState, hands: [[0], []] };
          deck = cardsReducer(deck, draw(0, 0), nextGameState, defaultMetadata);
          nextGameState = { ...gameState, hands: [[0, 1], []] };
          deck = cardsReducer(deck, draw(0, 1), nextGameState, defaultMetadata);
          nextGameState = { ...gameState, hands: [[0, 1, 2], []] };
          deck = cardsReducer(deck, draw(0, 2), nextGameState, defaultMetadata);

          const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
          deck = cardsReducer(deck, fivesClue, nextGameState, defaultMetadata);

          // Load up the negative clues so we can make inferences
          const redClue = colorClue(0, 1, [], 0, 0);
          const yellowClue = colorClue(1, 1, [], 0, 0);
          deck = cardsReducer(deck, redClue, nextGameState, defaultMetadata);
          deck = cardsReducer(deck, yellowClue, nextGameState, defaultMetadata);

          // Bob draws green 5.
          nextGameState = { ...gameState, hands: [[0, 1, 2], [3]] };
          deck = cardsReducer(deck, draw(1, 3, 2, 5), nextGameState, defaultMetadata);

          // Now the two fives in our hand must be blue/purple in some order.
          // The other card in our hand can't be one of those fives.
          expect(deducedPossible(deck[2], 3, 5)).toBe(false);
          expect(deducedPossible(deck[2], 4, 5)).toBe(false);

          // In addition, we know that Bob knows that his newly drawn card can't
          // be one of those fives either.
          expect(deducedPossible(deck[3], 3, 5)).toBe(false);
          expect(deducedPossible(deck[3], 4, 5)).toBe(false);
        });
        test('as Bob', () => {
          const bobMetadata = {
            ...defaultMetadata,
            ourUsername: 'Bob',
            ourPlayerIndex: 1,
          };
          let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
          let nextGameState = { ...gameState, hands: [[], [0]] };
          deck = cardsReducer(deck, draw(1, 0), nextGameState, bobMetadata);
          nextGameState = { ...gameState, hands: [[], [0, 1]] };
          deck = cardsReducer(deck, draw(1, 1), nextGameState, bobMetadata);
          nextGameState = { ...gameState, hands: [[], [0, 1, 2]] };
          deck = cardsReducer(deck, draw(1, 2), nextGameState, bobMetadata);

          const fivesClue = rankClue(5, 0, [0, 1], 1, 0);
          deck = cardsReducer(deck, fivesClue, nextGameState, bobMetadata);

          // Load up the negative clues so we can make inferences
          const redClue = colorClue(0, 0, [], 1, 0);
          const yellowClue = colorClue(1, 0, [], 1, 0);
          deck = cardsReducer(deck, redClue, nextGameState, bobMetadata);
          deck = cardsReducer(deck, yellowClue, nextGameState, bobMetadata);

          // Alice draws green 5.
          nextGameState = { ...gameState, hands: [[3], [0, 1, 2]] };
          deck = cardsReducer(deck, draw(0, 3, 2, 5), nextGameState, bobMetadata);

          // Now the two fives in our hand must be blue/purple in some order.
          // The other card in our hand can't be one of those fives.
          expect(deducedPossible(deck[2], 3, 5)).toBe(false);
          expect(deducedPossible(deck[2], 4, 5)).toBe(false);

          // In addition, we know that Alice knows that her newly drawn card can't
          // be one of those fives either.
          expect(deducedPossible(deck[3], 3, 5)).toBe(false);
          expect(deducedPossible(deck[3], 4, 5)).toBe(false);
        });
      });
    });
  });
});

const deducedPossible = (
  card: CardState,
  suit: number,
  rank: number,
) => card.possibleCardsFromDeduction.some(([s, r]) => s === suit && r === rank);
