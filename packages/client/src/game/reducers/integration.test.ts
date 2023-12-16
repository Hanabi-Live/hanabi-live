// Integration tests, involving loading a full game and checking state at different points.

import type { CardState, GameState } from "@hanabi/game";
import { StackDirection } from "@hanabi/game";
import { assertDefined, eRange } from "isaacscript-common-ts";
import { loadGameJSON } from "../../../test/loadGameJSON";
import rainbowOnesAndPinkGame from "../../../test_data/rainbow-ones_and_pink.json";
import upOrDownGame from "../../../test_data/up_or_down.json";
import upOrDownFinalCards from "../../../test_data/up_or_down_final_cards.json";
import upOrDownTurn5Cards from "../../../test_data/up_or_down_turn5.json";
import type { State } from "../types/State";
import { getEfficiency, getFutureEfficiency } from "./reducerHelpers";

let testState: State;

describe("integration", () => {
  describe("Up or Down test game", () => {
    beforeAll(() => {
      // Load the game and get the final state.
      testState = loadGameJSON(upOrDownGame);
    });

    describe("at turn 5", () => {
      test("has the correct cards on each player's hands", () => {
        const turn5State = getGameStateAtTurn(testState, 4);
        expect(turn5State.hands).toEqual([
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 11, 16],
          [12, 13, 15, 17],
        ]);
      });

      test("has the correct stats", () => {
        const turn5State = getGameStateAtTurn(testState, 4);
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

      test.each([...eRange(18)])(
        "card %i has the correct pips and possibilities",
        (order) => {
          const turn5State = getGameStateAtTurn(testState, 4);

          const card = turn5State.deck[order];
          assertDefined(card, `Failed to find the card at order: ${order}`);

          const upOrDownTurn5Card = upOrDownTurn5Cards[order];
          assertDefined(
            upOrDownTurn5Card,
            `Failed to get the card at order: ${order}`,
          );

          const expected = upOrDownTurn5Card as unknown as CardState;

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

      test.each([...eRange(45)])(
        "card %i has the correct pips and possibilities",
        (order) => {
          const finalState = getFinalState(testState);
          const card = finalState.deck[order];
          assertDefined(card, `Failed to find the card at order: ${order}`);

          const upOrDownFinalCard = upOrDownFinalCards[order];
          assertDefined(
            upOrDownFinalCard,
            `Failed to get the card at order: ${order}`,
          );

          const expected = upOrDownFinalCard as unknown as CardState;

          checkPossibilitiesEliminatedByClues(card, expected);
          checkPossibleCardsForEmpathy(card, expected);
        },
      );
    });
  });

  describe("Rainbow-Ones & Pink test game", () => {
    beforeAll(() => {
      // Load the game and get the final state.
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

function getGameStateAtTurn(state: State, turn: number): GameState {
  const gameState = state.replay.states[turn];
  assertDefined(gameState, `Failed to get the game state at turn: ${turn}`);

  return gameState;
}

function getFinalState(state: State): GameState {
  const gameState = state.replay.states.at(-1);
  assertDefined(gameState, "Failed to get the final game state.");

  return gameState;
}

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
