import type { CardOrder, GameMetadata, GameState } from "@hanabi-live/game";
import { draw, rankClue } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { beforeAll, describe, expect, test } from "vitest";

import testGame from "../../../test_data/up_or_down.json";
import type { ReplayState } from "../types/ReplayState.ts";
import type { State } from "../types/State.ts";

const { loadGameJson } = await import("../../../test/loadGameJson.ts");
const { hypoAction, hypoBack, hypoEnd, hypoStart, init } =
  await import("../../../test/testActions.ts");
const { replayReducer } = await import("./replayReducer.ts");
const { stateReducer } = await import("./stateReducer.ts");

let testState: State;
let metadata: GameMetadata;
let startingState: GameState;

describe("replayReducer", () => {
  // Initialize the state before each test.
  beforeAll(() => {
    // Load the game and start a replay.
    testState = loadGameJson(testGame);
    testState = stateReducer(testState, init());
    metadata = testState.metadata; // eslint-disable-line @typescript-eslint/prefer-destructuring
    const { segment } = testState.replay;
    assertDefined(segment, "The test game did not start a replay.");
    const selected = testState.replay.states[segment];
    assertDefined(selected, "Failed to get the starting replay state.");
    startingState = selected;
  });

  describe("hypothetical", () => {
    test("can start", () => {
      const state = replayReducer(testState.replay, hypoStart(), metadata);

      assertDefined(state.hypothetical, "Failed to start the hypothetical.");

      expect(state.hypothetical.ongoing).toBe<unknown>(startingState);
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
        {
          ...hypoStart(),
          showDrawnCards: true,
        },
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(true);
    });

    test("replays initial actions sequentially and retains the starting player", () => {
      const action = {
        ...rankClue(3, 1, [], 0),
        ignoreNegative: true,
      };
      const state = replayReducer(
        testState.replay,
        {
          ...hypoStart(),
          actions: [
            {
              type: "morph",
              order: 0 as CardOrder,
              identity: {
                suitIndex: undefined,
                rank: 3,
              },
            },
            action,
            action,
          ],
        },
        metadata,
      );
      assertDefined(state.hypothetical, "Failed to start the hypothetical.");
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
        suitIndex: undefined,
        rank: 3,
      });
    });

    test("morph and unmorph only change sparse identities", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      const ongoing = state.hypothetical?.ongoing;
      const states = state.hypothetical?.states;
      state = replayReducer(
        state,
        hypoAction({
          type: "morph",
          order: 30 as CardOrder,
          identity: {
            suitIndex: undefined,
            rank: undefined,
          },
        }),
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toEqual({
        suitIndex: undefined,
        rank: undefined,
      });
      expect(state.hypothetical?.morphedIdentities[0]).toBeUndefined();
      state = replayReducer(
        state,
        hypoAction({
          type: "morph",
          order: 30 as CardOrder,
          identity: {
            suitIndex: 1,
            rank: 2,
          },
        }),
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toEqual({
        suitIndex: 1,
        rank: 2,
      });
      state = replayReducer(
        state,
        hypoAction({
          type: "unmorph",
          order: 30 as CardOrder,
        }),
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[30]).toBeUndefined();
      expect(state.hypothetical?.morphedIdentities).toHaveLength(31);
      expect(state.hypothetical?.ongoing).toBe(ongoing);
      expect(state.hypothetical?.states).toBe(states);
    });

    test("records every hidden draw and toggles all drawn identities", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      const order = startingState.deck.length;
      state = replayReducer(state, hypoAction(draw(0, order, 0, 1)), metadata);
      state = replayReducer(
        state,
        hypoAction(draw(0, order + 1, 0, 1)),
        metadata,
      );
      expect(state.hypothetical?.drawnCardsInHypothetical).toEqual([
        order,
        order + 1,
      ]);
      expect(state.hypothetical?.morphedIdentities[order]).toEqual({
        suitIndex: undefined,
        rank: undefined,
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
          identity: {
            suitIndex: 1,
            rank: 2,
          },
        }),
        metadata,
      );
      const ongoing = state.hypothetical?.ongoing;
      state = replayReducer(
        state,
        {
          type: "hypotheticalShowDrawnCards",
          shared: false,
          showDrawnCards: true,
        },
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(true);
      expect(state.hypothetical?.morphedIdentities[order]).toBeUndefined();
      state = replayReducer(
        state,
        hypoAction(draw(0, order + 2, 0, 2)),
        metadata,
      );
      expect(state.hypothetical?.morphedIdentities[order + 2]).toBeUndefined();
      const afterDraw = state.hypothetical?.ongoing;
      expect(afterDraw).not.toBe(ongoing);
      state = replayReducer(
        state,
        {
          type: "hypotheticalShowDrawnCards",
          shared: false,
          showDrawnCards: false,
        },
        metadata,
      );
      expect(state.hypothetical?.showDrawnCards).toBe(false);
      for (const drawnOrder of [order, order + 1, order + 2]) {
        expect(state.hypothetical?.morphedIdentities[drawnOrder]).toEqual({
          suitIndex: undefined,
          rank: undefined,
        });
      }
      expect(state.hypothetical?.morphedIdentities[0]).toEqual({
        suitIndex: 1,
        rank: 2,
      });
      expect(state.hypothetical?.ongoing).toBe(afterDraw);
      expect(state.hypothetical?.drawnCardsInHypothetical).toEqual([
        order,
        order + 1,
        order + 2,
      ]);
    });

    test("saves segment changes and Back restores the previous saved state", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      state = replayReducer(state, hypoAction(rankClue(3, 0, [], 1)), metadata);
      const firstMove = state.hypothetical?.ongoing;
      expect(firstMove?.turn.segment).toBe(
        (startingState.turn.segment ?? 0) + 1,
      );
      expect(state.hypothetical?.states).toHaveLength(2);
      expect(state.hypothetical?.states[1]).toBe(firstMove);
      state = replayReducer(state, hypoAction(rankClue(3, 1, [], 0)), metadata);
      expect(state.hypothetical?.states).toHaveLength(3);
      state = replayReducer(state, hypoBack(), metadata);
      expect(state.hypothetical?.ongoing).toBe(firstMove);
      expect(state.hypothetical?.states).toHaveLength(2);
      state = replayReducer(state, hypoBack(), metadata);
      expect(state.hypothetical?.ongoing).toBe(startingState);
      state = replayReducer(state, hypoBack(), metadata);
      expect(state.hypothetical?.states).toEqual([]);
      expect(state.hypothetical?.ongoing).toBe(startingState);
    });

    test("can give a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);

      // Give a number 3 clue in the new hypothetical.
      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
      state = replayReducer(state, hypoClue, testState.metadata);

      const expectedClues = startingState.clueTokens - 1;
      expect(state.hypothetical?.ongoing.clueTokens).toBe(expectedClues);
    });

    test("can go back on a hypothetical after giving a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);

      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
      state = replayReducer(state, hypoClue, metadata);
      state = replayReducer(state, hypoBack(), metadata);

      const originalState = testState.visibleState;
      expect(state.hypothetical?.ongoing).toBe<unknown>(originalState);
    });

    test("waits until we use the shared segments to show the leader's hypothetical", () => {
      const sharedSegment = 1;
      const ourSegment = 3;
      let state: ReplayState = {
        ...testState.replay,
        segment: ourSegment,
        shared: {
          segment: sharedSegment,
          useSharedSegments: false,
          leader: "leader",
          amLeader: false,
          replayStartedAt: "2026-01-01T00:00:00.000Z",
          spoilerFree: false,
          canPlayAgain: false,
          restartDeclined: [],
          hypothetical: undefined,
        },
      };

      state = replayReducer(state, hypoStart(true), metadata);
      state = replayReducer(
        state,
        hypoAction(rankClue(3, 0, [], 1), true),
        metadata,
      );
      expect(state.hypothetical).toBeUndefined();
      expect(state.segment).toBe(ourSegment);
      const hidden = state.shared?.hypothetical;
      expect(hidden?.states[0]).toBe(state.states[sharedSegment]);
      expect(hidden?.states).toHaveLength(2);

      state = replayReducer(
        state,
        {
          type: "replayUseSharedSegments",
          useSharedSegments: true,
        },
        metadata,
      );
      expect(state.hypothetical).toBe(hidden);

      state = replayReducer(state, hypoEnd(true), metadata);
      expect(state.hypothetical).toBeUndefined();
      expect(state.shared?.hypothetical).toBeUndefined();
    });

    test("keeps our own hypothetical when the game ends and a shared replay starts", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);
      const own = state.ownHypothetical;
      assertDefined(own, "Failed to start our own hypothetical.");

      // The game ends while we are in an in-game replay.
      state = {
        ...state,
        shared: {
          segment: 1,
          useSharedSegments: false,
          leader: "leader",
          amLeader: false,
          replayStartedAt: "2026-01-01T00:00:00.000Z",
          spoilerFree: false,
          canPlayAgain: false,
          restartDeclined: [],
          hypothetical: undefined,
        },
      };
      state = replayReducer(
        state,
        {
          type: "replayLeader",
          username: "leader",
        },
        metadata,
      );
      state = replayReducer(state, hypoStart(true), metadata);
      expect(state.hypothetical).toBe(own);

      state = replayReducer(state, hypoAction(rankClue(3, 0, [], 1)), metadata);
      expect(state.hypothetical).toBe(state.ownHypothetical);
      expect(state.hypothetical?.states).toHaveLength(2);
      expect(state.shared?.hypothetical?.states).toHaveLength(1);

      state = replayReducer(state, hypoEnd(), metadata);
      expect(state.ownHypothetical).toBeUndefined();
      expect(state.hypothetical).toBeUndefined();

      state = replayReducer(
        state,
        {
          type: "replayUseSharedSegments",
          useSharedSegments: true,
        },
        metadata,
      );
      expect(state.hypothetical).toBe(state.shared?.hypothetical);
    });

    test("can end hypothetical after giving a clue", () => {
      let state = replayReducer(testState.replay, hypoStart(), metadata);

      const hypoClue = hypoAction(rankClue(3, 0, [], 1));
      state = replayReducer(state, hypoClue, metadata);
      state = replayReducer(state, hypoEnd(), metadata);
      expect(state.hypothetical).toBeUndefined();
    });
  });
});
