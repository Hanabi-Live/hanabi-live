// Integration tests, involving loading a full game and checking state at different points

import loadGameJSON from '../../../test/loadGameJSON';
import pinkRainbowOnesGame from '../../../test_data/pink_rainbow_ones.json';
import upOrDownGame from '../../../test_data/up_or_down.json';
import upOrDownFinalCards from '../../../test_data/up_or_down_final_cards.json';
import upOrDownTurn5Cards from '../../../test_data/up_or_down_turn5.json';
import CardState from '../types/CardState';
import State from '../types/State';

let testState: State;

function getStateAtTurn(state: State, turn: number) {
  return state.replay.states[turn];
}

function getFinalState(state: State) {
  return state.replay.states[state.replay.states.length - 1];
}

describe('integration', () => {
  describe('up_or_down test game', () => {
    beforeAll(() => {
      // Load the game and get the final state
      testState = loadGameJSON(upOrDownGame);
    });
    describe('at turn 5', () => {
      test('has the correct cards on each player\'s hands', () => {
        const turn5State = getStateAtTurn(testState, 4);
        expect(turn5State.hands).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 11, 16],
          [12, 13, 15, 17]]);
      });
      test('has the correct stats', () => {
        const turn5State = getStateAtTurn(testState, 4);
        expect(turn5State.turn).toBe(4);
        expect(turn5State.currentPlayerIndex).toBe(0);
        expect(turn5State.score).toBe(2);
        expect(turn5State.clueTokens).toBe(6);
        expect(turn5State.stats.pace).toBe(8);
        expect(turn5State.stats.efficiency).toBeCloseTo(1.50);
        expect(turn5State.stats.cardsGotten).toBe(3);
        expect(turn5State.stats.potentialCluesLost).toBe(2);

        /* TODO: stack directions on the test loader
        expect(turn5State.playStacksDirections).toEqual([
          StackDirection.Undecided,
          StackDirection.Down,
          StackDirection.Undecided,
          StackDirection.Down,
          StackDirection.Undecided,
        ]);
        */
      });
      test.each([...Array(18).keys()])(
        'card %i has the correct pips and possibilities', (order) => {
          const turn5State = getStateAtTurn(testState, 4);
          const card = turn5State.deck[order];
          const expected = upOrDownTurn5Cards[order] as CardState;
          checkCluesAreRemembered(card, expected);
          checkPossibilitiesEliminatedByClues(card, expected);
          // checkPossibilitiesEliminatedByObservation(card, expected);
        },
      );
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
      test.each([...Array(45).keys()])(
        'card %i has the correct pips and possibilities', (order) => {
          const finalState = getFinalState(testState);
          const card = finalState.deck[order];
          const expected = upOrDownFinalCards[order] as CardState;
          checkCluesAreRemembered(card, expected);
          checkPossibilitiesEliminatedByClues(card, expected);
          // checkPossibilitiesEliminatedByObservation(card, expected);
        },
      );
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

function checkCluesAreRemembered(card: CardState, expected: CardState) {
  expect(card.rankClueMemory.negativeClues)
    .toEqual(expected.rankClueMemory.negativeClues);
  expect(card.rankClueMemory.positiveClues)
    .toEqual(expected.rankClueMemory.positiveClues);
  expect(card.colorClueMemory.negativeClues)
    .toEqual(expected.colorClueMemory.negativeClues);
  expect(card.colorClueMemory.positiveClues)
    .toEqual(expected.colorClueMemory.positiveClues);
}

function checkPossibilitiesEliminatedByClues(card: CardState, expected: CardState) {
  expect(card.rankClueMemory.possibilities)
    .toEqual(expected.rankClueMemory.possibilities);
  expect(card.colorClueMemory.possibilities)
    .toEqual(expected.colorClueMemory.possibilities);
}

/*
function checkPossibilitiesEliminatedByObservation(card: CardState, expected: CardState) {
  expect(card.rankClueMemory.pipStates.slice(1, 5))
    .toEqual(expected.rankClueMemory.pipStates.slice(1, 5));
  expect(card.colorClueMemory.pipStates)
    .toEqual(expected.colorClueMemory.pipStates);
  expect(card.possibleCards.map((arr) => arr.slice(1, 5)))
    .toEqual(expected.possibleCards.map((arr) => arr.slice(1, 5)));
}
*/
