import type { Rank } from "@hanabi/data";
import { MAX_CLUE_NUM } from "@hanabi/data";
import {
  colorClue,
  discard,
  draw,
  play,
  rankClue,
  strike,
} from "../../../test/testActions";
import { testMetadata } from "../../../test/testMetadata";
import { gameStateReducer } from "./gameStateReducer";
import { initialGameState } from "./initialStates/initialGameState";
import { initialGameStateTest } from "./initialStates/initialGameStateTest";
import { getEfficiency } from "./reducerHelpers";

const numPlayers = 3;
const defaultMetadata = testMetadata(numPlayers);
const clueStarvedMetadata = testMetadata(numPlayers, "Clue Starved (6 Suits)");

describe("gameStateReducer", () => {
  test("does not mutate state", () => {
    const state = initialGameState(defaultMetadata);
    const unchangedState = initialGameState(defaultMetadata);
    const newState = gameStateReducer(
      state,
      draw(0, 0),
      true,
      false,
      false,
      false,
      defaultMetadata,
    );
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });

  describe("turn", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      expect(state.turn.turnNum).toBeGreaterThan(initialState.turn.turnNum);
    });
  });

  describe("currentPlayerIndex", () => {
    test("is properly incremented (integration test)", () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      expect(state.turn.currentPlayerIndex).not.toEqual(
        initialState.turn.currentPlayerIndex,
      );
    });
  });

  describe("efficiency", () => {
    test("is Infinity after a play on the first turn", () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameStateReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Blind-play that red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameStateReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const efficiency = getEfficiency(state);
      expect(efficiency).toBe(Number.POSITIVE_INFINITY);
    });

    test("is 0 after a misplay on the first turn", () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameStateReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Misplay the red 1.
      const discardAction = discard(0, 0, 0, 1, true);
      state = gameStateReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 0, 1);
      state = gameStateReducer(
        state,
        strikeAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const efficiency = getEfficiency(state);
      expect(efficiency).toBe(0);
    });

    test("is 3 after a 3-for-1 clue", () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a red 1, a red 2, and a red 3.
      for (let i = 0; i < 3; i++) {
        const rank = (i + 1) as Rank;
        const drawAction = draw(0, i, 0, rank);
        state = gameStateReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          defaultMetadata,
        );
      }

      // Give a 3-for-1 clue touching the 3 red cards.
      const clueAction = colorClue(0, 1, [0, 1, 2], 0, 0);
      state = gameStateReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const efficiency = getEfficiency(state);
      expect(efficiency).toBe(3);
    });

    test("is decreased after a misplay", () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a yellow 2 to player 0.
      const drawYellow2Action = draw(0, 0, 1, 2);
      state = gameStateReducer(
        state,
        drawYellow2Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Draw a red 1 to player 1.
      const drawRed1Action = draw(1, 1, 0, 1);
      state = gameStateReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Give a 1-for-1 clue.
      const clueAction = colorClue(0, 0, [0], 1, 0);
      state = gameStateReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Play that red 1.
      const playAction = play(1, 1, 0, 1);
      state = gameStateReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Misplay the yellow 2.
      const discardAction = discard(0, 0, 1, 2, true);
      state = gameStateReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // TODO: remove this when misplays are calculated from an ActionPlay
      // Mark a strike
      const strikeAction = strike(1, 1, 2);
      state = gameStateReducer(
        state,
        strikeAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const efficiency = getEfficiency(state);
      expect(efficiency).toBe(0.5);
    });

    test("is decreased after a clue from playing a 5 is wasted", () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw a red 2, a red 4, and a red 5 to player 0.
      const drawRed2Action = draw(0, 0, 0, 2);
      state = gameStateReducer(
        state,
        drawRed2Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      const drawRed4Action = draw(0, 1, 0, 4);
      state = gameStateReducer(
        state,
        drawRed4Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      const drawRed5Action = draw(0, 2, 0, 5);
      state = gameStateReducer(
        state,
        drawRed5Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Draw a red 1, a red 3, and a red 1 to player 1.
      const drawRed1Action = draw(1, 3, 0, 1);
      state = gameStateReducer(
        state,
        drawRed1Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      const drawRed3Action = draw(1, 4, 0, 3);
      state = gameStateReducer(
        state,
        drawRed3Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );
      const drawRed1Action2 = draw(1, 5, 0, 1);
      state = gameStateReducer(
        state,
        drawRed1Action2,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 0 gives a 1-for-1 clue.
      const clueAction = rankClue(1, 0, [3, 5], 1, 0);
      state = gameStateReducer(
        state,
        clueAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 1 plays the red 1.
      const playRed1Action = play(1, 3, 0, 1);
      state = gameStateReducer(
        state,
        playRed1Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 0 plays the red 2.
      const playRed2Action = play(0, 0, 0, 2);
      state = gameStateReducer(
        state,
        playRed2Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 1 plays the red 3.
      const playRed3Action = play(1, 4, 0, 3);
      state = gameStateReducer(
        state,
        playRed3Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 0 plays the red 4.
      const playRed4Action = play(0, 1, 0, 4);
      state = gameStateReducer(
        state,
        playRed4Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Player 1 discards the other red 1.
      const discardAction = discard(1, 5, 0, 1, false);
      state = gameStateReducer(
        state,
        discardAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      expect(state.clueTokens).toBe(MAX_CLUE_NUM);
      const efficiency1 = getEfficiency(state);
      expect(efficiency1).toBe(4); // e.g. 4 / 1

      // Player 0 plays the red 5.
      const playRed5Action = play(0, 2, 0, 5);
      state = gameStateReducer(
        state,
        playRed5Action,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const efficiency2 = getEfficiency(state);
      expect(efficiency2).toBe(2.5); // e.g. 5 / 2 (because we wasted a clue)
    });

    describe("Clue Starved", () => {
      test("is decreased after a clue from playing a 5 is wasted", () => {
        let state = initialGameStateTest(clueStarvedMetadata);

        // Draw a red 2, a red 4, and a red 5 to player 0.
        const drawRed2Action = draw(0, 0, 0, 2);
        state = gameStateReducer(
          state,
          drawRed2Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const drawRed4Action = draw(0, 1, 0, 4);
        state = gameStateReducer(
          state,
          drawRed4Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const drawRed5Action = draw(1, 2, 0, 5);
        state = gameStateReducer(
          state,
          drawRed5Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Draw a red 1, a red 3, a red 1, and a red 1 to player 1.
        const drawRed1Action = draw(1, 3, 0, 1);
        state = gameStateReducer(
          state,
          drawRed1Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const drawRed3Action = draw(1, 4, 0, 3);
        state = gameStateReducer(
          state,
          drawRed3Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const drawRed1Action2 = draw(0, 5, 0, 1);
        state = gameStateReducer(
          state,
          drawRed1Action2,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const drawRed1Action3 = draw(0, 6, 0, 1);
        state = gameStateReducer(
          state,
          drawRed1Action3,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 0 gives a 1-for-1 clue.
        const clueAction = rankClue(1, 0, [3, 5, 6], 1, 0);
        state = gameStateReducer(
          state,
          clueAction,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 1 plays the red 1.
        const playRed1Action = play(1, 3, 0, 1);
        state = gameStateReducer(
          state,
          playRed1Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 0 plays the red 2.
        const playRed2Action = play(0, 0, 0, 2);
        state = gameStateReducer(
          state,
          playRed2Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 1 plays the red 3.
        const playRed3Action = play(1, 4, 0, 3);
        state = gameStateReducer(
          state,
          playRed3Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 0 plays the red 4.
        const playRed4Action = play(0, 1, 0, 4);
        state = gameStateReducer(
          state,
          playRed4Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        // Player 1 discards the other two red 1s.
        const discardAction1 = discard(1, 5, 0, 1, false);
        state = gameStateReducer(
          state,
          discardAction1,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );
        const discardAction2 = discard(1, 6, 0, 1, false);
        state = gameStateReducer(
          state,
          discardAction2,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        expect(state.clueTokens).toBe(MAX_CLUE_NUM * 2);
        const efficiency1 = getEfficiency(state);
        expect(efficiency1).toBe(4); // e.g. 4 / 1

        // Player 0 plays the red 5.
        const playRed5Action = play(0, 2, 0, 5);
        state = gameStateReducer(
          state,
          playRed5Action,
          true,
          false,
          false,
          false,
          clueStarvedMetadata,
        );

        const efficiency2 = getEfficiency(state);
        expect(efficiency2).toBeCloseTo(3.33);
        // e.g. 5 / 1.5 (because we wasted half a clue)
      });
    });
  });

  describe("clues", () => {
    test("are added to the list of clues", () => {
      const initialState = initialGameState(defaultMetadata);
      let state = initialGameStateTest(defaultMetadata);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const clue = state.clues[0];
      if (clue === undefined) {
        throw new Error("Failed to get the clue.");
      }

      expect(state.clues.length).toBe(initialState.clues.length + 1);
      expect(clue.giver).toBe(testClue.giver);
      expect(clue.target).toBe(testClue.target);
      expect(clue.type).toBe(testClue.clue.type);
      expect(clue.value).toBe(testClue.clue.value);
      expect(clue.list).toEqual([]);
      expect(clue.negativeList).toEqual([]);
    });

    test("are remembered with the correct positive and negative cards", () => {
      let state = initialGameStateTest(defaultMetadata);

      // Draw 5 cards (red 1-3, yellow 4-5).
      for (let i = 0; i <= 4; i++) {
        const suitIndex = i <= 2 ? 0 : 1;
        const rank = (i + 1) as Rank;
        const drawAction = draw(1, i, suitIndex, rank);
        state = gameStateReducer(
          state,
          drawAction,
          true,
          false,
          false,
          false,
          defaultMetadata,
        );
      }

      // Player 0 gives a clue that touches cards 0, 1, and 2.
      const testClue = rankClue(5, 0, [0, 1, 2], 1, 2);
      state = gameStateReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      const clue = state.clues[0];
      if (clue === undefined) {
        throw new Error("Failed to get the clue.");
      }

      expect(clue.list).toEqual([0, 1, 2]);
      expect(clue.negativeList).toEqual([3, 4]);
    });

    test("decrement clueTokens", () => {
      let state = initialGameStateTest(defaultMetadata);

      // Player 1 gives a random clue to player 0.
      const testClue = rankClue(5, 1, [], 0, 2);
      state = gameStateReducer(
        state,
        testClue,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      expect(state.clueTokens).toBe(MAX_CLUE_NUM - 1);
    });
  });

  describe("plays", () => {
    test("increase the score by 1", () => {
      let state = initialGameState(defaultMetadata);

      // Draw a red 1.
      const drawAction = draw(0, 0, 0, 1);
      state = gameStateReducer(
        state,
        drawAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      // Play a red 1.
      const playAction = play(0, 0, 0, 1);
      state = gameStateReducer(
        state,
        playAction,
        true,
        false,
        false,
        false,
        defaultMetadata,
      );

      expect(state.score).toBe(1);
    });
  });
});
