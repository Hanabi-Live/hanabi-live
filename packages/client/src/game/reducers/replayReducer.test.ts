import type { CardOrder, GameMetadata, GameState } from "@hanabi-live/game";
import { draw, rankClue } from "@hanabi-live/game";
import { beforeAll, describe, expect, jest, test } from "@jest/globals";
import { assertDefined, assertNotNull } from "complete-common";
import { loadGameJSON } from "../../../test/loadGameJSON";
import {
  hypoAction,
  hypoBack,
  hypoEnd,
  hypoStart,
  init,
} from "../../../test/testActions";
import testGame from "../../../test_data/up_or_down.json";
import type { State } from "../types/State";
import { replayReducer } from "./replayReducer";
import { stateReducer } from "./stateReducer";

jest.mock("./uiReducer", () => ({
  uiReducer: jest.fn(),
}));

let testState: State;
let metadata: GameMetadata;
let startingState: GameState;

describe("replayReducer", () => {
  // Initialize the state before each test.
  beforeAll(() => {
    // Load the game and start a replay.
    testState = loadGameJSON(testGame);
    testState = stateReducer(testState, init());
    metadata = testState.metadata; // eslint-disable-line @typescript-eslint/prefer-destructuring
    const selected = testState.replay.states[testState.replay.segment];
    assertDefined(selected, "Failed to get the starting replay state.");
    startingState = selected;
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
      expect(state.hypothetical.startingPlayerIndex).toBe(
        startingState.turn.currentPlayerIndex,
      );
      expect(state.hypothetical.showDrawnCards).toBe(false);
      expect(state.hypothetical.drawnCardsInHypothetical).toEqual([]);
      expect(state.hypothetical.morphedIdentities).toEqual([]);
    });

    test("can start with drawn cards shown", () => {
      const state = replayReducer(
        testState.replay,
        { ...hypoStart(), showDrawnCards: true },
        false,
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(true);
    });

    test("replays initial actions sequentially and retains the starting player", () => {
      const action = rankClue(3, 1, [], 0);
      const state = replayReducer(
        testState.replay,
        {
          ...hypoStart(),
          actions: [
            { type: "morph", order: 0 as CardOrder, suitIndex: -1, rank: 3 },
            action,
            action,
          ],
        },
        false,
        metadata,
      );
      assertNotNull(state.hypothetical, "Failed to start the hypothetical.");
      expect(state.hypothetical.startingPlayerIndex).toBe(0);
      expect(state.hypothetical.states[0]).toBe(startingState);
      expect(state.hypothetical.states).toHaveLength(3);
      expect(state.hypothetical.ongoing.clueTokens).toBe(
        startingState.clueTokens - 2,
      );
      expect(
        state.hypothetical.ongoing.clues
          .slice(-2)
          .map((clue) => clue.negativeList),
      ).toEqual([[], []]);
      expect(state.hypothetical.morphedIdentities[0]).toEqual({
        suitIndex: null,
        rank: 3,
      });
    });

    test("morph and unmorph only change sparse identities", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);
      const ongoing = state.hypothetical?.ongoing;
      const states = state.hypothetical?.states;
      state = replayReducer(
        state,
        hypoAction({
          type: "morph",
          order: 30 as CardOrder,
          suitIndex: -1,
          rank: -1,
        }),
        false,
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toEqual({
        suitIndex: null,
        rank: null,
      });
      expect(state.hypothetical?.morphedIdentities[0]).toBeUndefined();
      state = replayReducer(
        state,
        hypoAction({
          type: "morph",
          order: 30 as CardOrder,
          suitIndex: 1,
          rank: 2,
        }),
        false,
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toEqual({
        suitIndex: 1,
        rank: 2,
      });
      state = replayReducer(
        state,
        hypoAction({ type: "unmorph", order: 30 as CardOrder }),
        false,
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toBeUndefined();
      expect(state.hypothetical?.morphedIdentities).toHaveLength(31);
      expect(state.hypothetical?.ongoing).toBe(ongoing);
      expect(state.hypothetical?.states).toBe(states);
    });

    test("records every hidden draw and toggles all drawn identities", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);
      const order = startingState.deck.length;
      state = replayReducer(
        state,
        hypoAction(draw(0, order, 0, 1)),
        false,
        metadata,
      );
      state = replayReducer(
        state,
        hypoAction(draw(0, order, 0, 1)),
        false,
        metadata,
      );
      expect(state.hypothetical?.drawnCardsInHypothetical).toEqual([
        order,
        order,
      ]);
      expect(state.hypothetical?.morphedIdentities[order]).toEqual({
        suitIndex: null,
        rank: null,
      });
      expect(state.hypothetical?.ongoing.cardsRemainingInTheDeck).toBe(
        startingState.cardsRemainingInTheDeck - 2,
      );
      expect(state.hypothetical?.states).toHaveLength(1);
      state = replayReducer(
        state,
        hypoAction({
          type: "morph",
          order: 0 as CardOrder,
          suitIndex: 1,
          rank: 2,
        }),
        false,
        metadata,
      );
      const ongoing = state.hypothetical?.ongoing;
      state = replayReducer(
        state,
        { type: "hypoShowDrawnCards", showDrawnCards: true },
        false,
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(true);
      expect(state.hypothetical?.morphedIdentities[order]).toBeUndefined();
      state = replayReducer(
        state,
        hypoAction(draw(0, order + 1, 0, 2)),
        false,
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[order + 1]).toBeUndefined();
      const afterDraw = state.hypothetical?.ongoing;
      expect(afterDraw).not.toBe(ongoing);
      state = replayReducer(
        state,
        { type: "hypoShowDrawnCards", showDrawnCards: false },
        false,
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(false);
      for (const drawnOrder of [order, order + 1]) {
        expect(state.hypothetical?.morphedIdentities[drawnOrder]).toEqual({
          suitIndex: null,
          rank: null,
        });
      }
      expect(state.hypothetical?.morphedIdentities[0]).toEqual({
        suitIndex: 1,
        rank: 2,
      });
      expect(state.hypothetical?.ongoing).toBe(afterDraw);
      expect(state.hypothetical?.drawnCardsInHypothetical).toEqual([
        order,
        order,
        order + 1,
      ]);
    });

    test.each([
      { showDrawnCards: false, target: 0, ignoreNegative: true },
      { showDrawnCards: true, target: 0, ignoreNegative: false },
      { showDrawnCards: false, target: 1, ignoreNegative: false },
    ] as const)(
      "clue negatives with $showDrawnCards shown and target $target",
      ({ showDrawnCards, target, ignoreNegative }) => {
        let state = replayReducer(
          testState.replay,
          { ...hypoStart(), showDrawnCards },
          false,
          metadata,
        );
        const action = rankClue(3, target === 0 ? 1 : 0, [], target);
        state = replayReducer(state, hypoAction(action), false, metadata);
        expect(state.hypothetical?.ongoing.clues.at(-1)?.negativeList).toEqual(
          ignoreNegative ? [] : startingState.hands[target],
        );
        expect(action.ignoreNegative).toBe(false);
      },
    );

    test("saves segment changes and Back restores the previous saved state", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);
      state = replayReducer(
        state,
        hypoAction(rankClue(3, 0, [], 1)),
        false,
        metadata,
      );
      const firstMove = state.hypothetical?.ongoing;
      expect(firstMove?.turn.segment).toBe(
        (startingState.turn.segment ?? 0) + 1,
      );
      expect(state.hypothetical?.states).toHaveLength(2);
      expect(state.hypothetical?.states[1]).toBe(firstMove);
      state = replayReducer(
        state,
        hypoAction(rankClue(3, 1, [], 0)),
        false,
        metadata,
      );
      expect(state.hypothetical?.states).toHaveLength(3);
      state = replayReducer(state, hypoBack(), false, metadata);
      expect(state.hypothetical?.ongoing).toBe(firstMove);
      expect(state.hypothetical?.states).toHaveLength(2);
      state = replayReducer(state, hypoBack(), false, metadata);
      expect(state.hypothetical?.ongoing).toBe(startingState);
      state = replayReducer(state, hypoBack(), false, metadata);
      expect(state.hypothetical?.states).toEqual([]);
      expect(state.hypothetical?.ongoing).toBe(startingState);
    });

    test("can give a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);

      // Give a number 3 clue in the new hypothetical.
      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
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

      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
      state = replayReducer(state, hypoClue, false, metadata);
      state = replayReducer(state, hypoBack(), false, metadata);

      const originalState = testState.visibleState;
      expect(state.hypothetical?.ongoing).toBe(originalState);
    });

    test("can end hypothetical after giving a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), false, metadata);

      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
      state = replayReducer(state, hypoClue, false, metadata);
      state = replayReducer(state, hypoEnd(), false, metadata);
      expect(state.hypothetical).toBeNull();
    });
  });
});
