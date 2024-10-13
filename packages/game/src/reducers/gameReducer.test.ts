import { assertDefined, eRange, iRange } from "complete-common";
import { MAX_CLUE_NUM } from "../constants";
import { getDefaultMetadata } from "../metadata";
import {
  colorClue,
  discard,
  draw,
  play,
  rankClue,
  strike,
} from "../testActions";
import type { Rank } from "../types/Rank";
import { gameReducer } from "./gameReducer";
import { getInitialGameState } from "./initialStates/initialGameState";
import { getInitialGameStateTest } from "./initialStates/initialGameStateTest";
import { getEfficiencyFromGameState } from "./reducerHelpers";

const NUM_PLAYERS = 3;
const DEFAULT_METADATA = getDefaultMetadata(NUM_PLAYERS);
const CLUE_STARVED_METADATA = getDefaultMetadata(
  NUM_PLAYERS,
  "Clue Starved (6 Suits)",
);

describe("gameReducer", () => {
  test("does not mutate state", () => {
    const state = getInitialGameState(DEFAULT_METADATA);
    const unchangedState = getInitialGameState(DEFAULT_METADATA);
    const newState = gameReducer(
      state,
      draw(0, 0),
      true,
      false,
      false,
      false,
      DEFAULT_METADATA,
    );
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe("turn", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      expect(state.turn.turnNum).toBeGreaterThan(initialState.turn.turnNum);
    });
  });

  describe("currentPlayerIndex", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      expect(state.turn.currentPlayerIndex).not.toEqual(
        initialState.turn.currentPlayerIndex,
      );
    });
  });

  describe("efficiency", () => {
    test("is Infinity after a play on the first turn", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Blind-play that red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(Number.POSITIVE_INFINITY);
    });

    test("is 0 after a misplay on the first turn", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Misplay the red 1.
      const discardAction = discard(0, 0, 0, 1, true);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 0, 1);
      state = gameReducer(
        state,
        strikeAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(0);
    });

    test("is 3 after a 3-for-1 clue", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a red 1, a red 2, and a red 3.
      for (const i of iRange(1, 3)) {
        const order = i - 1;
        const rank = i as Rank;
        const drawAction = draw(0, order, 0, rank);
        state = gameReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          DEFAULT_METADATA,
        );
      }

      // Give a 3-for-1 clue touching the 3 red cards.
      const clueAction = colorClue(0, 1, [0, 1, 2], 0);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(3);
    });

    test("is decreased after a misplay", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a yellow 2 to player 0.
      const drawYellow2Action = draw(0, 0, 1, 2);
      state = gameReducer(
        state,
        drawYellow2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Draw a red 1 to player 1.
      const drawRed1Action = draw(1, 1, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Give a 1-for-1 clue.
      const clueAction = colorClue(0, 0, [0], 1);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Play that red 1.
      const playAction = play(1, 1, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Misplay the yellow 2.
      const discardAction = discard(0, 0, 1, 2, true);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 1, 2);
      state = gameReducer(
        state,
        strikeAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency = getEfficiencyFromGameState(state);
      expect(efficiency).toBe(0.5);
    });

    test("is decreased after a clue from playing a 5 is wasted", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw a red 2, a red 4, and a red 5 to player 0.
      const drawRed2Action = draw(0, 0, 0, 2);
      state = gameReducer(
        state,
        drawRed2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed4Action = draw(0, 1, 0, 4);
      state = gameReducer(
        state,
        drawRed4Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed5Action = draw(0, 2, 0, 5);
      state = gameReducer(
        state,
        drawRed5Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Draw a red 1, a red 3, and a red 1 to player 1.
      const drawRed1Action = draw(1, 3, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed3Action = draw(1, 4, 0, 3);
      state = gameReducer(
        state,
        drawRed3Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );
      const drawRed1Action2 = draw(1, 5, 0, 1);
      state = gameReducer(
        state,
        drawRed1Action2,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 gives a 1-for-1 clue.
      const clueAction = rankClue(1, 0, [3, 5], 1);
      state = gameReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 plays the red 1.
      const playRed1Action = play(1, 3, 0, 1);
      state = gameReducer(
        state,
        playRed1Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 plays the red 2.
      const playRed2Action = play(0, 0, 0, 2);
      state = gameReducer(
        state,
        playRed2Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 plays the red 3.
      const playRed3Action = play(1, 4, 0, 3);
      state = gameReducer(
        state,
        playRed3Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 0 plays the red 4.
      const playRed4Action = play(0, 1, 0, 4);
      state = gameReducer(
        state,
        playRed4Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Player 1 discards the other red 1.
      const discardAction = discard(1, 5, 0, 1, false);
      state = gameReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.clueTokens).toBe(MAX_CLUE_NUM);
      const efficiency1 = getEfficiencyFromGameState(state);
      expect(efficiency1).toBe(4); // e.g. 4 / 1

      // Player 0 plays the red 5.
      const playRed5Action = play(0, 2, 0, 5);
      state = gameReducer(
        state,
        playRed5Action,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const efficiency2 = getEfficiencyFromGameState(state);
      expect(efficiency2).toBe(2.5); // e.g. 5 / 2 (because we wasted a clue)
    });

    describe("Clue Starved", () => {
      test("is decreased after a clue from playing a 5 is wasted", () => {
        let state = getInitialGameStateTest(CLUE_STARVED_METADATA);

        // Draw a red 2, a red 4, and a red 5 to player 0.
        const drawRed2Action = draw(0, 0, 0, 2);
        state = gameReducer(
          state,
          drawRed2Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed4Action = draw(0, 1, 0, 4);
        state = gameReducer(
          state,
          drawRed4Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed5Action = draw(1, 2, 0, 5);
        state = gameReducer(
          state,
          drawRed5Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Draw a red 1, a red 3, a red 1, and a red 1 to player 1.
        const drawRed1Action = draw(1, 3, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed3Action = draw(1, 4, 0, 3);
        state = gameReducer(
          state,
          drawRed3Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed1Action2 = draw(0, 5, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action2,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const drawRed1Action3 = draw(0, 6, 0, 1);
        state = gameReducer(
          state,
          drawRed1Action3,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 gives a 1-for-1 clue.
        const clueAction = rankClue(1, 0, [3, 5, 6], 1);
        state = gameReducer(
          state,
          clueAction,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 plays the red 1.
        const playRed1Action = play(1, 3, 0, 1);
        state = gameReducer(
          state,
          playRed1Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 plays the red 2.
        const playRed2Action = play(0, 0, 0, 2);
        state = gameReducer(
          state,
          playRed2Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 plays the red 3.
        const playRed3Action = play(1, 4, 0, 3);
        state = gameReducer(
          state,
          playRed3Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 0 plays the red 4.
        const playRed4Action = play(0, 1, 0, 4);
        state = gameReducer(
          state,
          playRed4Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        // Player 1 discards the other two red 1s.
        const discardAction1 = discard(1, 5, 0, 1, false);
        state = gameReducer(
          state,
          discardAction1,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );
        const discardAction2 = discard(1, 6, 0, 1, false);
        state = gameReducer(
          state,
          discardAction2,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        expect(state.clueTokens).toBe(MAX_CLUE_NUM * 2);
        const efficiency1 = getEfficiencyFromGameState(state);
        expect(efficiency1).toBe(4); // e.g. 4 / 1

        // Player 0 plays the red 5.
        const playRed5Action = play(0, 2, 0, 5);
        state = gameReducer(
          state,
          playRed5Action,
          true,
          false,
          false,
          false,
          CLUE_STARVED_METADATA,
        );

        const efficiency2 = getEfficiencyFromGameState(state);
        expect(efficiency2).toBeCloseTo(3.33);
        // e.g. 5 / 1.5 (because we wasted half a clue)
      });
    });
  });

  describe("clues", () => {
    test("are added to the list of clues", () => {
      const initialState = getInitialGameState(DEFAULT_METADATA);
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const clue = state.clues[0];
      assertDefined(clue, "Failed to get the clue.");

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(clue.giver).toBe(testClue.giver);
      expect(clue.target).toBe(testClue.target);
      expect(clue.type).toBe(testClue.clue.type);
      expect(clue.value).toBe(testClue.clue.value);
      expect(clue.list).toEqual([]);
      expect(clue.negativeList).toEqual([]);
    });

    test("are remembered with the correct positive and negative cards", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Draw 5 cards (red 1-3, yellow 4-5).
      for (const i of eRange(5)) {
        const suitIndex = i <= 2 ? 0 : 1;
        const rank = (i + 1) as Rank;
        const drawAction = draw(1, i, suitIndex, rank);
        state = gameReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          DEFAULT_METADATA,
        );
      }

      // Player 0 gives a clue that touches cards 0, 1, and 2.
      const testClue = rankClue(5, 0, [0, 1, 2], 1);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      const clue = state.clues[0];
      assertDefined(clue, "Failed to get the clue.");

      expect(clue.list).toEqual([0, 1, 2]);
      expect(clue.negativeList).toEqual([3, 4]);
    });

    test("decrement clueTokens", () => {
      let state = getInitialGameStateTest(DEFAULT_METADATA);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0);
      state = gameReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe("plays", () => {
    test("increase the score by 1", () => {
      let state = getInitialGameState(DEFAULT_METADATA);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      // Play a red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        DEFAULT_METADATA,
      );

      expect(state.score).toBe(1);
    });
  });
});
