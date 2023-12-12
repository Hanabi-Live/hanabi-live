import type { TurnState } from "@hanabi/game";
import { eRange } from "@hanabi/utils";
import { draw, play } from "../../../test/testActions";
import { testMetadata } from "../../../test/testMetadata";
import { initialGameState } from "./initialStates/initialGameState";
import { initialTurnState } from "./initialStates/initialTurnState";
import { turnReducer } from "./turnReducer";

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);
const defaultGameState = initialGameState(defaultMetadata);

describe("turnReducer", () => {
  describe("turn", () => {
    test("is properly incremented", () => {
      let state: TurnState = {
        ...initialTurnState(),
        segment: 0,
      };

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = turnReducer(state, drawAction, defaultGameState, defaultMetadata);

      for (const i of eRange(3)) {
        // Play the last red 1 that was drawn.
        const playAction = play(0, i, 0, 1);
        state = turnReducer(
          state,
          playAction,
          defaultGameState,
          defaultMetadata,
        );

        // Draw another red 1.
        const drawAction2 = draw(0, i + 1, 0, 1);
        state = turnReducer(
          state,
          drawAction2,
          defaultGameState,
          defaultMetadata,
        );
      }

      expect(state.turnNum).toBe(3);
    });
  });

  describe("currentPlayerIndex", () => {
    test("is properly incremented", () => {
      let state: TurnState = {
        ...initialTurnState(),
        segment: 0,
      };

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = turnReducer(state, drawAction, defaultGameState, defaultMetadata);

      expect(state.currentPlayerIndex).toBe(0);
      state = playRed1AndDraw(state, 0);
      expect(state.currentPlayerIndex).toBe(1);
      state = playRed1AndDraw(state, 1);
      expect(state.currentPlayerIndex).toBe(2);
      state = playRed1AndDraw(state, 2);
      expect(state.currentPlayerIndex).toBe(0);
    });

    test("is properly incremented for a legacy game with a custom starting player", () => {
      let state: TurnState = {
        ...initialTurnState(1),
        segment: 0,
      };

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = turnReducer(state, drawAction, defaultGameState, defaultMetadata);

      expect(state.currentPlayerIndex).toBe(1);
      state = playRed1AndDraw(state, 0);
      expect(state.currentPlayerIndex).toBe(2);
      state = playRed1AndDraw(state, 1);
      expect(state.currentPlayerIndex).toBe(0);
      state = playRed1AndDraw(state, 2);
      expect(state.currentPlayerIndex).toBe(1);
    });
  });
});

function playRed1AndDraw(oldState: TurnState, i: number) {
  let state = oldState;

  // Play that red 1.
  const playAction = play(0, i, 0, 1);
  state = turnReducer(state, playAction, defaultGameState, defaultMetadata);

  // Draw another red 1.
  const drawAction2 = draw(0, i + 1, 0, 1);
  state = turnReducer(state, drawAction2, defaultGameState, defaultMetadata);

  return state;
}
