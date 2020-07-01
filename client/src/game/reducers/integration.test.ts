// Integration tests, involving loading a full game and checking state at different points

import loadGameJSON from '../../../test/loadGameJSON';
import pinkRainbowOnesGame from '../../../test_data/pink_rainbow_ones.json';
import upOrDownGame from '../../../test_data/up_or_down.json';
import upOrDownFinalCards from '../../../test_data/up_or_down_final_cards.json';
import State from '../types/State';

let testState: State;

function getFinalState(state: State) {
  return state.replay.states[state.replay.states.length - 1];
}

describe('integration', () => {
  describe('up_or_down test game', () => {
    beforeAll(() => {
      // Load the game and get the final state
      testState = loadGameJSON(upOrDownGame);
    });
    describe('final state', () => {
      test('has the correct cards on each player\'s hands', () => {
        const finalState = getFinalState(testState);
        expect(finalState.hands).toEqual([
          [27, 32, 35],
          [22, 30, 43],
          [36, 41, 44],
          [13, 23, 39]]);
      });
      test('has the correct stats', () => {
        const finalState = getFinalState(testState);
        expect(finalState.turn).toBe(51);
        expect(finalState.currentPlayerIndex).toBe(-1);
        expect(finalState.score).toBe(24);
        expect(finalState.clueTokens).toBe(3);
        expect(finalState.stats.pace).toBeNull();
        expect(finalState.stats.efficiency).toBeCloseTo(1.39);
        expect(finalState.stats.cardsGotten).toBe(25);
        expect(finalState.stats.potentialCluesLost).toBe(18);

        /* TODO: stack directions on the test loader
        expect(finalState.playStacksDirections).toEqual([
          StackDirection.Finished,
          StackDirection.Finished,
          StackDirection.Finished,
          StackDirection.Down,
          StackDirection.Finished,
        ]);
        */
      });
      test.skip('has the correct pips and possibilities', () => {
        const finalState = getFinalState(testState);
        for (const hand of finalState.hands) {
          for (const order of hand) {
            const card = finalState.deck[order];
            const expected = upOrDownFinalCards[order];
            expect(card.possibleCards)
              .toEqual(expected.possibleCards);
            expect(card.rankClueMemory.negativeClues)
              .toEqual(expected.rankClueMemory.negativeClues);
            expect(card.rankClueMemory.positiveClues)
              .toEqual(expected.rankClueMemory.positiveClues);
            expect(card.rankClueMemory.possibilities)
              .toEqual(expected.rankClueMemory.possibilities);
            expect(card.rankClueMemory.pipStates)
              .toEqual(expected.rankClueMemory.pipStates);
            expect(card.colorClueMemory.negativeClues)
              .toEqual(expected.colorClueMemory.negativeClues);
            expect(card.colorClueMemory.positiveClues)
              .toEqual(expected.colorClueMemory.positiveClues);
            expect(card.colorClueMemory.possibilities)
              .toEqual(expected.colorClueMemory.possibilities);
            expect(card.colorClueMemory.pipStates)
              .toEqual(expected.colorClueMemory.pipStates);
          }
        }
      });
    });
    describe('pink_rainbow_ones test game', () => {
      beforeAll(() => {
        // Load the game and get the final state
        testState = loadGameJSON(pinkRainbowOnesGame);
      });
      describe('final state', () => {
        test('has the correct cards on each player\'s hands', () => {
          const finalState = getFinalState(testState);
          expect(finalState.hands).toEqual([
            [34, 37, 39, 43],
            [38, 40, 44, 47],
            [28, 31, 33, 42],
          ]);
        });
        test('has the correct stats', () => {
          const finalState = getFinalState(testState);
          expect(finalState.turn).toBe(53);
          expect(finalState.currentPlayerIndex).toBe(-1);
          expect(finalState.score).toBe(25);
          expect(finalState.clueTokens).toBe(8);
          expect(finalState.stats.pace).toBeNull();
          expect(finalState.stats.efficiency).toBeCloseTo(1.67);
          expect(finalState.stats.cardsGotten).toBe(30);
          expect(finalState.stats.potentialCluesLost).toBe(18);
        });
      });
    });
  });
});
