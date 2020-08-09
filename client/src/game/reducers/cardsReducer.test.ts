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

  describe('segmentFirstClued', () => {
    test('remembers the segment when the first clue happened', () => {
      let deck: CardState[] = [defaultCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      expect(deck[0].segmentFirstClued).toBeNull();

      const clue1Segment = 999;
      const gameStateFirstTurn = {
        ...gameState,
        turn: { ...gameState.turn, segment: clue1Segment },
      };

      const testClue1 = rankClue(5, 1, [0], 0, gameStateFirstTurn.turn.turnNum);
      deck = cardsReducer(deck, testClue1, gameStateFirstTurn, true, defaultMetadata);
      expect(deck[0].segmentFirstClued).toEqual(clue1Segment);

      const clue2Segment = clue1Segment + 1;
      const gameStateNextTurn = {
        ...gameStateFirstTurn,
        turn: { ...gameStateFirstTurn.turn, segment: clue2Segment },
      };

      const testClue2 = colorClue(2, 2, [0], 0, gameStateNextTurn.turn.turnNum);
      deck = cardsReducer(deck, testClue2, gameStateNextTurn, true, defaultMetadata);
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

  describe('clue', () => {
    test('removes inferred negative possibilities on clued cards in other hand', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(1, 2, 0, 5), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };

      // Load up the negative clues so we can make inferences
      const redClue = colorClue(0, 1, [], 0, 0);
      const yellowClue = colorClue(1, 1, [], 0, 0);
      const greenClue = colorClue(2, 1, [], 0, 0);
      deck = cardsReducer(deck, redClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, yellowClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, greenClue, nextGameState, true, defaultMetadata);

      const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, fivesClue, nextGameState, true, defaultMetadata);

      // The two fives in our hand must be blue/purple in some order.  The other person will know
      // their card is not one of those fives.
      expectPossibility(deck[2], 3, 5, false);
      expectPossibility(deck[2], 4, 5, false);
    });
    test('can remove just one copy of a card from inference to other hand, if necessary', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };

      // Load up the negative clues so we can make inferences
      const greenClue = colorClue(2, 1, [], 0, 0);
      const blueClue = colorClue(3, 1, [], 0, 0);
      const purpleClue = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, blueClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, purpleClue, nextGameState, true, defaultMetadata);

      const foursClue = rankClue(4, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, foursClue, nextGameState, true, defaultMetadata);

      // The two fours in our hand must be red/yellow in some order.  The other person will know
      // their cards are not one of those fours, but they obviously don't rule out both copies
      // of each four.
      expectPossibility(deck[2], 0, 4, true);
      expectPossibility(deck[2], 1, 4, true);
      expectPossibility(deck[3], 0, 4, true);
      expectPossibility(deck[3], 1, 4, true);
    });
    test('inferences within other hands stay within those hands (we know their cards)', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard, fifthCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };

      // Load up the negative clues so inferences can be made
      const greenClueToOther = colorClue(2, 0, [], 1, 0);
      const blueClueToOther = colorClue(3, 0, [], 1, 0);
      const purpleClueToOther = colorClue(4, 0, [], 1, 0);
      const greenClueToUs = colorClue(2, 1, [], 0, 0);
      const blueClueToUs = colorClue(3, 1, [], 0, 0);
      const purpleClueToUs = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClueToOther, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, blueClueToOther, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, purpleClueToOther, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, greenClueToUs, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, blueClueToUs, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, purpleClueToUs, nextGameState, true, defaultMetadata);

      deck = cardsReducer(deck, draw(1, 4, 2, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3, 4]] };

      const foursClueToUs = rankClue(4, 2, [0, 1], 0, 0);
      const foursClueToOther = rankClue(4, 2, [2, 3, 4], 1, 1);
      deck = cardsReducer(deck, foursClueToUs, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, foursClueToOther, nextGameState, true, defaultMetadata);

      // The other player has inferred their first two fours are red/yellow in some order.
      // Therefore they know their other four is not red/yellow
      expectPossibility(deck[4], 0, 4, false);
      expectPossibility(deck[4], 1, 4, false);

      // We already know that the two fours in our hand are the other red/yellow fours.
      // We don't want the projected inference in the other hand to cause us to remove
      // the remaining copy/possibility of red/yellow on our fours.
      expectPossibility(deck[0], 0, 4, true);
      expectPossibility(deck[0], 1, 4, true);
      expectPossibility(deck[1], 0, 4, true);
      expectPossibility(deck[1], 1, 4, true);
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
    test('only eliminates possibility on card inferred with it', () => {
      let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
      deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
      let nextGameState = { ...gameState, hands: [[0], []] };
      deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], []] };
      deck = cardsReducer(deck, draw(1, 2, 0, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2]] };
      deck = cardsReducer(deck, draw(1, 3, 1, 4), nextGameState, true, defaultMetadata);
      nextGameState = { ...gameState, hands: [[0, 1], [2, 3]] };

      // Load up the negative clues so inferences can be made
      const greenClue = colorClue(2, 1, [], 0, 0);
      const blueClue = colorClue(3, 1, [], 0, 0);
      const purpleClue = colorClue(4, 1, [], 0, 0);
      deck = cardsReducer(deck, greenClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, blueClue, nextGameState, true, defaultMetadata);
      deck = cardsReducer(deck, purpleClue, nextGameState, true, defaultMetadata);

      const foursClue = rankClue(4, 2, [0, 1], 0, 0);
      deck = cardsReducer(deck, foursClue, nextGameState, true, defaultMetadata);

      // Discards red 4
      const discardCardOne = discard(0, 0, 0, 4, false);
      deck = cardsReducer(deck, discardCardOne, nextGameState, true, defaultMetadata);

      // The other red/yellow 4 in the inferred pair from our hand is now known to not be red
      expectPossibility(deck[1], 0, 4, false);

      // We already removed red 4 when we inferred our two fours.
      // We shouldn't remove it a second time.
      expectPossibility(deck[2], 0, 4, true);
      expectPossibility(deck[3], 0, 4, true);
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
      test('removes inferred negative possibilities on newly drawn card in own hand', () => {
        let deck: CardState[] = [defaultCard, secondCard, thirdCard];
        deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
        let nextGameState = { ...gameState, hands: [[0]] };
        deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1]] };

        const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, true, defaultMetadata);

        // Load up the negative clues so we can make inferences
        const redClue = colorClue(0, 1, [], 0, 0);
        const yellowClue = colorClue(1, 1, [], 0, 0);
        const greenClue = colorClue(2, 1, [], 0, 0);
        deck = cardsReducer(deck, redClue, nextGameState, true, defaultMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, true, defaultMetadata);
        deck = cardsReducer(deck, greenClue, nextGameState, true, defaultMetadata);

        // The two fives must be blue/purple in some order.  The newly drawn card can't be
        // one of those fives.
        deck = cardsReducer(deck, draw(0, 2), nextGameState, true, defaultMetadata);

        expectPossibility(deck[2], 3, 5, false);
        expectPossibility(deck[2], 4, 5, false);
      });
      test('removes inferred negative possibilities on newly drawn card in other hand', () => {
        let deck: CardState[] = [defaultCard, secondCard, thirdCard];
        deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
        let nextGameState = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1], []] };

        const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, true, defaultMetadata);

        // Load up the negative clues so we can make inferences
        const redClue = colorClue(0, 1, [], 0, 0);
        const yellowClue = colorClue(1, 1, [], 0, 0);
        const greenClue = colorClue(2, 1, [], 0, 0);
        deck = cardsReducer(deck, redClue, nextGameState, true, defaultMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, true, defaultMetadata);
        deck = cardsReducer(deck, greenClue, nextGameState, true, defaultMetadata);

        // The two fives must be blue/purple in some order.  The newly drawn card can't be
        // one of those fives.
        deck = cardsReducer(deck, draw(1, 2), nextGameState, true, defaultMetadata);

        expectPossibility(deck[2], 3, 5, false);
        expectPossibility(deck[2], 4, 5, false);
      });
      test('from other hand allows new inferences in own hand', () => {
        let deck: CardState[] = [defaultCard, secondCard, thirdCard, fourthCard];
        deck = cardsReducer(deck, draw(0, 0), gameState, true, defaultMetadata);
        let nextGameState = { ...gameState, hands: [[0], []] };
        deck = cardsReducer(deck, draw(0, 1), nextGameState, true, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1], []] };
        deck = cardsReducer(deck, draw(0, 2), nextGameState, true, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1, 2], []] };

        const fivesClue = rankClue(5, 2, [0, 1], 0, 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, true, defaultMetadata);

        // Load up the negative clues so we can make inferences
        const redClue = colorClue(0, 1, [], 0, 0);
        const yellowClue = colorClue(1, 1, [], 0, 0);
        deck = cardsReducer(deck, redClue, nextGameState, true, defaultMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, true, defaultMetadata);

        // Bob draws green 5.
        deck = cardsReducer(deck, draw(1, 3, 2, 5), nextGameState, true, defaultMetadata);
        nextGameState = { ...gameState, hands: [[0, 1, 2], [3]] };

        // Now the two fives in our hand must be blue/purple in some order.
        // The other card in our hand can't be one of those fives.
        expectPossibility(deck[2], 3, 5, false);
        expectPossibility(deck[2], 4, 5, false);

        // In addition, we know that Bob knows that his newly drawn card can't
        // be one of those fives either.
        expectPossibility(deck[3], 3, 5, false);
        expectPossibility(deck[3], 4, 5, false);
      });
    });
  });
});

const expectPossibility = (
  card: CardState,
  suit: number,
  rank: number,
  expected: boolean,
) => {
  expect(card.possibleCardsFromInference2.some(
    (possibility) => possibility[0] === suit && possibility[1] === rank,
  )).toBe(expected);
  /*
  if (expected) {
    expect(card.possibleCardsFromInference[suit][rank]).toBeGreaterThan(0);
  } else {
    expect(card.possibleCardsFromInference[suit][rank]).toBe(0);
  }
  */
};
