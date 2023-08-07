// Integration tests, involving loading a full game and checking state at different points.

import { getVariant, START_CARD_RANK } from "@hanabi/data";
import { loadGameJSON } from "../../../test/loadGameJSON";
import upOrDownGame from "../../../test_data/up_or_down_critical.json";
import type { State } from "../types/State";
import { isCritical } from "./variants/reversible";

let testState: State;

const variant = getVariant("Up or Down & Brown (6 Suits)");
const redSuit = 0;

describe("UI", () => {
  describe("Up or Down test game", () => {
    beforeAll(() => {
      // Load the game and get the final state.
      testState = loadGameJSON(upOrDownGame);
    });

    describe("at turn 3", () => {
      test("red S is not critical", () => {
        const turnState = getStateAtTurn(testState, 2)!;
        expect(
          isCritical(
            redSuit,
            START_CARD_RANK,
            turnState.deck,
            turnState.playStackDirections,
            variant,
          ),
        ).toBe(false);
      });
    });

    describe("at turn 6", () => {
      test("red 1 is not critical", () => {
        const turnState = getStateAtTurn(testState, 5)!;
        expect(
          isCritical(
            redSuit,
            1,
            turnState.deck,
            turnState.playStackDirections,
            variant,
          ),
        ).toBe(false);
      });
    });

    describe("at turn 22", () => {
      test("red 5 is critical", () => {
        const turnState = getStateAtTurn(testState, 21)!;
        expect(
          isCritical(
            redSuit,
            5,
            turnState.deck,
            turnState.playStackDirections,
            variant,
          ),
        ).toBe(true);
      });
    });
  });
});

function getStateAtTurn(state: State, turn: number) {
  return state.replay.states[turn];
}
