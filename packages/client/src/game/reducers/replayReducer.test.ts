import { assertDefined, assertNotNull } from "@hanabi/utils";
import { loadGameJSON } from "../../../test/loadGameJSON";
import {
  hypoAction,
  hypoBack,
  hypoEnd,
  hypoStart,
  init,
  rankClue,
} from "../../../test/testActions";
import testGame from "../../../test_data/up_or_down.json";
import type { GameMetadata } from "../types/GameMetadata";
import type { State } from "../types/State";
import { replayReducer } from "./replayReducer";
import { stateReducer } from "./stateReducer";

jest.mock("./uiReducer", () => ({
  uiReducer: jest.fn(),
}));

let testState: State;
let metadata: GameMetadata;

describe("replayReducer", () => {
  // Initialize the state before each test.
  beforeAll(() => {
    // Load the game and start a replay.
    testState = loadGameJSON(testGame);
    testState = stateReducer(testState, init());
    metadata = testState.metadata; // eslint-disable-line prefer-destructuring
  });

  describe("hypothetical", () => {
    test("can start", () => {
      const state = replayReducer(
        testState.replay,
        hypoStart(),
        false,
        metadata,
      );

      assertNotNull(state.hypothetical, "Failed to start the hypothetical.");

      expect(state.hypothetical.ongoing).toBe(
        testState.replay.states[testState.replay.segment],
      );
      expect(state.hypothetical.states.length).toBe(1);
      expect(state.hypothetical.states[0]).toBe(state.hypothetical.ongoing);
    });

    test("can give a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);

      // Give a number 3 clue in the new hypothetical.
      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, false, testState.metadata);

      const gameState = testState.replay.states[testState.replay.segment];
      assertDefined(
        gameState,
        `Failed to get the game state at segment: ${testState.replay.segment}`,
      );

      const expectedClues = gameState.clueTokens - 1;
      expect(state.hypothetical?.ongoing.clueTokens).toBe(expectedClues);
    });

    test("can go back on a hypothetical after giving a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);

      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, false, metadata);
      state = replayReducer(state, hypoBack(), false, metadata);

      const originalState = testState.visibleState;
      expect(state.hypothetical?.ongoing).toBe(originalState);
    });

    test("can end hypothetical after giving a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);

      const hypoClue = hypoAction(rankClue(3, 0, [], 1, 0));
      state = replayReducer(state, hypoClue, false, metadata);
      state = replayReducer(state, hypoEnd(), false, metadata);
      expect(state.hypothetical).toBeNull();
    });
  });
});
