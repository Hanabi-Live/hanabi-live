// Integration tests, involving loading a full game and checking state at different points

import loadGameJSON from "../../../test/loadGameJSON";
import rainbowOnesAndPinkGame from "../../../test_data/rainbow-ones_and_pink.json";
import upOrDownGame from "../../../test_data/up_or_down.json";
import upOrDownFinalCards from "../../../test_data/up_or_down_final_cards.json";
import upOrDownTurn5Cards from "../../../test_data/up_or_down_turn5.json";
import CardState from "../types/CardState";
import StackDirection from "../types/StackDirection";
import State from "../types/State";
import { getEfficiency, getFutureEfficiency } from "./reducerHelpers";

let testState: State;

const getStateAtTurn = (state: State, turn: number) =>
  state.replay.states[turn];
const getFinalState = (state: State) =>
  state.replay.states[state.replay.states.length - 1];

describe("integration", () => {
  describe("Up or Down test game", () => {
    beforeAll(() => {
      // Load the game and get the final state
      testState = loadGameJSON(upOrDownGame);
    });

    describe("at turn 5", () => {
      test("has the correct cards on each player's hands", () => {
        const turn5State = getStateAtTurn(testState, 4);
        expect(turn5State.hands).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 11, 16],
          [12, 13, 15, 17],
        ]);
      });

      test("has the correct stats", () => {
        const turn5State = getStateAtTurn(testState, 4);
        expect(turn5State.turn.turnNum).toBe(4);
        expect(turn5State.turn.currentPlayerIndex).toBe(0);
        expect(turn5State.score).toBe(2);
        expect(turn5State.clueTokens).toBe(6);
        expect(turn5State.stats.pace).toBe(8);
        const efficiency = getEfficiency(turn5State);
        expect(efficiency).toBeCloseTo(1.5);
        const futureEfficiency = getFutureEfficiency(turn5State);
        expect(futureEfficiency).toBeCloseTo(22 / (8 + 5 - 1 + 6));
        expect(turn5State.stats.potentialCluesLost).toBe(2);

        expect(turn5State.playStackDirections).toEqual([
          StackDirection.Undecided,
          StackDirection.Down,
          StackDirection.Undecided,
          StackDirection.Down,
          StackDirection.Undecided,
        ]);
      });

      test.each([...Array(18).keys()])(
        "card %i has the correct pips and possibilities",
        (order) => {
          const turn5State = getStateAtTurn(testState, 4);
          const card = turn5State.deck[order];
          // The compiler won't accept a list of tuples from JSON
          const expected = (upOrDownTurn5Cards as unknown as CardState[])[
            order
          ];
          checkPossibilitiesEliminatedByClues(card, expected);
          checkPossibleCardsForEmpathy(card, expected);
        },
      );
    });

    describe("final state", () => {
      test("has the correct cards on each player's hands", () => {
        const finalState = getFinalState(testState);
        expect(finalState.hands).toEqual([
          [27, 32, 35],
          [22, 30, 43],
          [31, 36, 41, 44],
          [13, 23, 39],
        ]);
      });

      test("has the correct stats", () => {
        const finalState = getFinalState(testState);
        expect(finalState.turn.turnNum).toBe(50);
        expect(finalState.turn.currentPlayerIndex).toBeNull();
        expect(finalState.score).toBe(24);
        expect(finalState.clueTokens).toBe(2);
        expect(finalState.stats.pace).toBeNull();
        const efficiency = getEfficiency(finalState);
        expect(efficiency).toBeCloseTo(1.39);
        const futureEfficiency = getFutureEfficiency(finalState);
        expect(futureEfficiency).toBeNull();
        expect(finalState.stats.potentialCluesLost).toBe(18);

        expect(finalState.playStackDirections).toEqual([
          StackDirection.Finished,
          StackDirection.Finished,
          StackDirection.Finished,
          StackDirection.Down,
          StackDirection.Finished,
        ]);
      });

      test.each([...Array(45).keys()])(
        "card %i has the correct pips and possibilities",
        (order) => {
          const finalState = getFinalState(testState);
          const card = finalState.deck[order];
          const expected = (upOrDownFinalCards as unknown as CardState[])[
            order
          ];
          checkPossibilitiesEliminatedByClues(card, expected);
          checkPossibleCardsForEmpathy(card, expected);
        },
      );
    });
  });

  describe("Rainbow-Ones & Pink test game", () => {
    beforeAll(() => {
      // Load the game and get the final state
      testState = loadGameJSON(rainbowOnesAndPinkGame);
    });

    describe("final state", () => {
      test("has the correct cards on each player's hands", () => {
        const finalState = getFinalState(testState);
        expect(finalState.hands).toEqual([
          [34, 37, 39, 43],
          [38, 40, 44, 47],
          [28, 31, 33, 42],
        ]);
      });

      test("has the correct stats", () => {
        const finalState = getFinalState(testState);
        expect(finalState.turn.turnNum).toBe(53);
        expect(finalState.turn.currentPlayerIndex).toBeNull();
        expect(finalState.score).toBe(25);
        expect(finalState.clueTokens).toBe(8);
        expect(finalState.stats.pace).toBeNull();
        const efficiency = getEfficiency(finalState);
        expect(efficiency).toBeCloseTo(1.39);
        const futureEfficiency = getFutureEfficiency(finalState);
        expect(futureEfficiency).toBeNull();
        expect(finalState.stats.potentialCluesLost).toBe(18);
      });
    });
  });
});

function checkPossibilitiesEliminatedByClues(
  card: CardState,
  expected: CardState,
) {
  expect(card.possibleCardsFromClues).toEqual(expected.possibleCardsFromClues);
}

function checkPossibleCardsForEmpathy(card: CardState, expected: CardState) {
  expect(card.possibleCardsForEmpathy).toEqual(
    expected.possibleCardsForEmpathy,
  );
}
