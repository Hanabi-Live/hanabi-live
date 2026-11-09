/* eslint-disable unicorn/no-null */

import { describe, expect, spyOn, test } from "bun:test";
import { MAX_STRIKES } from "./generated/protocol";
import {
  hypotheticalStateReducer,
  initializeHypotheticalState,
} from "./hypotheticalState";
import { getDefaultMetadata } from "./metadata";
import * as gameReducerModule from "./reducers/gameReducer";
import { gameReducer } from "./reducers/gameReducer";
import { getInitialGameState } from "./reducers/initialStates/initialGameState";
import { draw, rankClue } from "./testActions";
import type { CardOrder } from "./types/CardOrder";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { SuitRankTuple } from "./types/SuitRankTuple";

const metadata = getDefaultMetadata(2);
let startingState = getInitialGameState(metadata);
for (let order = 0; order < 10; order++) {
  startingState = gameReducer(
    startingState,
    draw(order < 5 ? 0 : 1, order),
    true,
    false,
    false,
    true,
    metadata,
  );
}

describe("hypothetical state", () => {
  test.each([false, true])(
    "initializes with showDrawnCards = %s",
    (showDrawnCards) => {
      const state = initializeHypotheticalState(
        startingState,
        showDrawnCards,
        [],
        false,
        metadata,
      );
      expect(state.ongoing).toBe(startingState);
      expect(state.states).toEqual([startingState]);
      expect(state.states[0]).toBe(startingState);
      expect(state.startingPlayerIndex).toBe(0);
      expect(state.showDrawnCards).toBe(showDrawnCards);
      expect(state.drawnCardsInHypothetical).toEqual([]);
      expect(state.morphedIdentities).toEqual([]);
    },
  );

  test.each([1, null] as const)(
    "captures starting player %s from the selected state",
    (currentPlayerIndex) => {
      const selected = {
        ...startingState,
        turn: { ...startingState.turn, segment: 7, currentPlayerIndex },
      };
      const state = initializeHypotheticalState(
        selected,
        false,
        [],
        false,
        metadata,
      );
      expect(state.ongoing).toBe(selected);
      expect(state.states[0]).toBe(selected);
      expect(state.startingPlayerIndex).toBe(currentPlayerIndex);
    },
  );

  test("applies initial actions sequentially while retaining the starting player", () => {
    const action = rankClue(3, 1, [], 0);
    const state = initializeHypotheticalState(
      startingState,
      false,
      [
        { type: "morph", order: 0 as CardOrder, suitIndex: -1, rank: 3 },
        action,
        action,
      ],
      false,
      metadata,
    );
    expect(state.startingPlayerIndex).toBe(0);
    expect(state.states[0]).toBe(startingState);
    expect(state.states).toHaveLength(3);
    expect(state.ongoing.clueTokens).toBe(startingState.clueTokens - 2);
    expect(state.ongoing.clues.map((clue) => clue.negativeList)).toEqual([
      [],
      [],
    ]);
    expect(state.morphedIdentities[0]).toEqual({ suitIndex: null, rank: 3 });
  });

  test("morph and unmorph preserve the game state and sparse indexes", () => {
    const initial = initializeHypotheticalState(
      startingState,
      false,
      [],
      false,
      metadata,
    );
    let state = hypotheticalStateReducer(
      initial,
      {
        type: "morph",
        order: 30 as CardOrder,
        suitIndex: -1,
        rank: -1,
      },
      false,
      metadata,
    );
    expect(state.morphedIdentities[30]).toEqual({
      suitIndex: null,
      rank: null,
    });
    expect(state.morphedIdentities[0]).toBeUndefined();
    state = hypotheticalStateReducer(
      state,
      {
        type: "morph",
        order: 30 as CardOrder,
        suitIndex: 1,
        rank: 2,
      },
      false,
      metadata,
    );
    expect(state.morphedIdentities[30]).toEqual({ suitIndex: 1, rank: 2 });
    state = hypotheticalStateReducer(
      state,
      {
        type: "unmorph",
        order: 30 as CardOrder,
      },
      false,
      metadata,
    );
    expect(state.morphedIdentities[30]).toBeUndefined();
    expect(state.morphedIdentities).toHaveLength(31);
    expect(state.ongoing).toBe<unknown>(startingState);
    expect(state.states).toBe<unknown>(initial.states);
    expect(initial.morphedIdentities).toEqual([]);
  });

  test.each([
    { name: "duplicate", order: 0 },
    { name: "skipped", order: startingState.deck.length + 1 },
  ])("ignores a received $name draw order", ({ order }) => {
    const initial = initializeHypotheticalState(
      startingState,
      false,
      [],
      false,
      metadata,
    );

    const result = hypotheticalStateReducer(
      initial,
      draw(0, order, 0, 1),
      false,
      metadata,
    );

    expect(result).toBe<unknown>(initial);
  });

  test.each([-1, metadata.options.numPlayers, 1.5])(
    "ignores a received draw with invalid player index %s",
    (playerIndex) => {
      const initial = initializeHypotheticalState(
        startingState,
        false,
        [],
        false,
        metadata,
      );

      const result = hypotheticalStateReducer(
        initial,
        draw(playerIndex as PlayerIndex, startingState.deck.length, 0, 1),
        false,
        metadata,
      );

      expect(result).toBe<unknown>(initial);
    },
  );

  test("ignores a received draw when the deck is empty", () => {
    const emptyDeckState = {
      ...startingState,
      cardsRemainingInTheDeck: 0,
    };
    const initial = initializeHypotheticalState(
      emptyDeckState,
      false,
      [],
      false,
      metadata,
    );

    const result = hypotheticalStateReducer(
      initial,
      draw(0, emptyDeckState.deck.length, 0, 1),
      false,
      metadata,
    );

    expect(result).toBe<unknown>(initial);
  });

  test("allows drawing the last remaining card", () => {
    const finalCardState = {
      ...startingState,
      cardsRemainingInTheDeck: 1,
    };
    const initial = initializeHypotheticalState(
      finalCardState,
      false,
      [],
      false,
      metadata,
    );
    const nextOrder = finalCardState.deck.length;

    const result = hypotheticalStateReducer(
      initial,
      draw(0, nextOrder, 0, 1),
      false,
      metadata,
    );

    expect(result.ongoing.cardsRemainingInTheDeck).toBe(0);
    expect(result.ongoing.deck).toHaveLength(nextOrder + 1);
    expect(result.ongoing.hands[0]).toContain<number>(nextOrder);
    expect(initial.ongoing.cardsRemainingInTheDeck).toBe(1);
  });

  test("ignores a repeated draw after applying it once", () => {
    const initial = initializeHypotheticalState(
      startingState,
      false,
      [],
      false,
      metadata,
    );
    const nextOrder = startingState.deck.length;
    const once = hypotheticalStateReducer(
      initial,
      draw(0, nextOrder, 0, 1),
      false,
      metadata,
    );
    const twice = hypotheticalStateReducer(
      once,
      draw(0, nextOrder, 0, 1),
      false,
      metadata,
    );

    expect(twice).toBe(once);
    const drawnCards = once.ongoing.hands[0].filter(
      (order) => order === nextOrder,
    );
    expect(drawnCards).toHaveLength(1);
  });

  test("records every hidden draw and toggles all drawn identities", () => {
    const initial = initializeHypotheticalState(
      startingState,
      false,
      [],
      false,
      metadata,
    );
    const order = startingState.deck.length;
    let state = hypotheticalStateReducer(
      initial,
      draw(0, order, 0, 1),
      false,
      metadata,
    );
    state = hypotheticalStateReducer(
      state,
      draw(0, order + 1, 0, 1),
      false,
      metadata,
    );
    expect(state.drawnCardsInHypothetical).toEqual([order, order + 1]);
    expect(state.morphedIdentities[order]).toEqual({
      suitIndex: null,
      rank: null,
    });
    expect(state.ongoing.cardsRemainingInTheDeck).toBe(
      startingState.cardsRemainingInTheDeck - 2,
    );
    expect(state.states).toBe<unknown>(initial.states);
    state = hypotheticalStateReducer(
      state,
      {
        type: "morph",
        order: 0 as CardOrder,
        suitIndex: 1,
        rank: 2,
      },
      false,
      metadata,
    );
    const { ongoing } = state;
    state = hypotheticalStateReducer(
      state,
      { type: "showDrawnCards", showDrawnCards: true },
      false,
      metadata,
    );
    expect(state.showDrawnCards).toBe(true);
    expect(state.morphedIdentities[order]).toBeUndefined();
    expect(state.ongoing).toBe(ongoing);
    state = hypotheticalStateReducer(
      state,
      draw(0, order + 2, 0, 2),
      false,
      metadata,
    );
    expect(state.morphedIdentities[order + 2]).toBeUndefined();
    const afterDraw = state.ongoing;
    state = hypotheticalStateReducer(
      state,
      { type: "showDrawnCards", showDrawnCards: false },
      false,
      metadata,
    );
    expect(state.showDrawnCards).toBe(false);
    for (const drawnOrder of [order, order + 1, order + 2]) {
      expect(state.morphedIdentities[drawnOrder]).toEqual({
        suitIndex: null,
        rank: null,
      });
    }
    expect(state.morphedIdentities[0]).toEqual({ suitIndex: 1, rank: 2 });
    expect(state.ongoing).toBe(afterDraw);
    expect(state.drawnCardsInHypothetical).toEqual([
      order,
      order + 1,
      order + 2,
    ]);
    expect(initial.drawnCardsInHypothetical).toEqual([]);
  });

  test.each([
    { showDrawnCards: false, target: 0, ignoreNegative: true },
    { showDrawnCards: true, target: 0, ignoreNegative: false },
    { showDrawnCards: false, target: 1, ignoreNegative: false },
  ] as const)(
    "clue negatives with $showDrawnCards shown and target $target",
    ({ showDrawnCards, target, ignoreNegative }) => {
      const initial = initializeHypotheticalState(
        startingState,
        showDrawnCards,
        [],
        false,
        metadata,
      );
      const action = rankClue(3, target === 0 ? 1 : 0, [], target);
      const state = hypotheticalStateReducer(initial, action, false, metadata);
      expect(state.ongoing.clues.at(-1)?.negativeList).toEqual<unknown>(
        ignoreNegative ? [] : startingState.hands[target],
      );
      expect(action.ignoreNegative).toBe(false);
    },
  );

  describe.each(["play", "discard"] as const)("a received %s", (type) => {
    function cardAction(order: number) {
      return type === "play"
        ? ({
            type: "play",
            playerIndex: 0,
            order: order as CardOrder,
            suitIndex: 0,
            rank: 1,
          } as const)
        : ({
            type: "discard",
            playerIndex: 0,
            order: order as CardOrder,
            suitIndex: 0,
            rank: 1,
            failed: false,
          } as const);
    }

    // Persisted shared replay actions bypass the local action planner. Applying any of these would
    // leave the same order in two collections or reference a card that has not been drawn.
    test.each([
      ["in another player's hand", 5],
      ["that has not been drawn", 20],
    ])("is ignored for a card %s", (_description, order) => {
      const original = initializeHypotheticalState(
        startingState,
        false,
        [],
        false,
        metadata,
      );
      expect(original.ongoing.hands[0]).not.toContain(order);

      const result = hypotheticalStateReducer(
        original,
        cardAction(order),
        false,
        metadata,
      );
      expect(result).toBe<unknown>(original);
    });

    test("is ignored for a card that already left the hand", () => {
      const original = initializeHypotheticalState(
        startingState,
        false,
        [cardAction(0)],
        false,
        metadata,
      );
      expect(original.ongoing.hands[0]).not.toContain(0);

      const result = hypotheticalStateReducer(
        original,
        cardAction(0),
        false,
        metadata,
      );
      expect(result).toBe<unknown>(original);
    });
  });

  test("preserves an explicit ignoreNegative on other clues", () => {
    const initial = initializeHypotheticalState(
      startingState,
      true,
      [],
      false,
      metadata,
    );
    const action = { ...rankClue(3, 0, [], 1), ignoreNegative: true };
    const state = hypotheticalStateReducer(initial, action, false, metadata);
    expect(state.ongoing.clues.at(-1)?.negativeList).toEqual([]);
  });

  test("saves segment changes and Back restores the previous saved state", () => {
    let state = initializeHypotheticalState(
      startingState,
      false,
      [],
      false,
      metadata,
    );
    state = hypotheticalStateReducer(
      state,
      rankClue(3, 0, [], 1),
      false,
      metadata,
    );
    const firstMove = state.ongoing;
    expect(firstMove.turn.segment).toBe(1);
    expect(state.states).toHaveLength(2);
    expect(state.states[1]).toBe(firstMove);
    state = hypotheticalStateReducer(
      state,
      rankClue(3, 1, [], 0),
      false,
      metadata,
    );
    expect(state.states).toHaveLength(3);
    state = hypotheticalStateReducer(state, { type: "back" }, false, metadata);
    expect(state.ongoing).toBe(firstMove);
    expect(state.states).toHaveLength(2);
    state = hypotheticalStateReducer(state, { type: "back" }, false, metadata);
    expect(state.ongoing).toBe(startingState);
    state = hypotheticalStateReducer(state, { type: "back" }, false, metadata);
    expect(state.states).toEqual([]);
    expect(state.ongoing).toBe(startingState);
    state = hypotheticalStateReducer(state, { type: "back" }, false, metadata);
    expect(state.states).toEqual([]);
    expect(state.ongoing).toBe(startingState);
  });

  test.each([false, true])(
    "uses the real game reducer with finished = %s",
    (finished) => {
      const initial = initializeHypotheticalState(
        startingState,
        false,
        [],
        finished,
        metadata,
      );
      const reducer = spyOn(gameReducerModule, "gameReducer");
      try {
        let state = hypotheticalStateReducer(
          initial,
          { type: "morph", order: 0 as CardOrder, suitIndex: -1, rank: -1 },
          finished,
          metadata,
        );
        state = hypotheticalStateReducer(
          state,
          { type: "unmorph", order: 0 as CardOrder },
          finished,
          metadata,
        );
        expect(reducer).not.toHaveBeenCalled();
        const action = draw(0, startingState.deck.length, 0, 1);
        hypotheticalStateReducer(state, action, finished, metadata);
        expect(reducer).toHaveBeenCalledTimes(1);
        // The first argument is an Immer draft that is revoked after the transition.
        expect(reducer.mock.calls[0]?.slice(1)).toEqual([
          action,
          true,
          false,
          finished,
          true,
          metadata,
        ]);
      } finally {
        reducer.mockRestore();
      }
    },
  );

  test("deduces empathy from the identities that cards are shown as", () => {
    // The first player holds a green 5 (order 0), and the second player has a 5 clued (order 5).
    const identities = [
      [2, 5],
      [0, 1],
      [0, 1],
      [1, 1],
      [1, 1],
      [0, 5],
      [3, 1],
      [3, 1],
      [4, 1],
      [4, 1],
    ] as const;
    let dealtState = getInitialGameState(metadata);
    for (const [order, [suitIndex, rank]] of identities.entries()) {
      dealtState = gameReducer(
        dealtState,
        draw(order < 5 ? 0 : 1, order, suitIndex, rank),
        true,
        false,
        false,
        true,
        metadata,
      );
    }
    const cluedOrder = 5;
    const green5: SuitRankTuple = [2, 5];
    const yellow5: SuitRankTuple = [1, 5];

    let state = initializeHypotheticalState(
      dealtState,
      true,
      [rankClue(5, 0, [cluedOrder], 1)],
      false,
      metadata,
    );
    function empathy() {
      return state.ongoing.deck[cluedOrder]?.possibleCardsForEmpathy;
    }
    expect(empathy()).not.toContainEqual(green5);

    state = hypotheticalStateReducer(
      state,
      { type: "morph", order: 0 as CardOrder, suitIndex: 3, rank: 1 },
      false,
      metadata,
    );
    expect(empathy()).toContainEqual(green5);

    state = hypotheticalStateReducer(
      state,
      { type: "morph", order: 1 as CardOrder, suitIndex: 1, rank: 5 },
      false,
      metadata,
    );
    expect(empathy()).toContainEqual(green5);
    expect(empathy()).not.toContainEqual(yellow5);

    state = hypotheticalStateReducer(
      state,
      { type: "unmorph", order: 0 as CardOrder },
      false,
      metadata,
    );
    state = hypotheticalStateReducer(
      state,
      { type: "unmorph", order: 1 as CardOrder },
      false,
      metadata,
    );
    expect(empathy()).not.toContainEqual(green5);
    expect(empathy()).toContainEqual(yellow5);
    expect(state.ongoing.deck[0]).toMatchObject({ suitIndex: 2, rank: 5 });
  });

  const lastSegment = { ...startingState.turn, segment: 0 };
  test.each([
    {
      name: "the final round",
      turn: { ...lastSegment, endTurnNum: startingState.turn.turnNum + 1 },
    },
    {
      name: "a strikeout",
      turn: lastSegment,
      strikes: Array.from({ length: MAX_STRIKES }, (_, i) => ({
        order: i as CardOrder,
        segment: 0,
      })),
    },
    {
      name: "the maximum score",
      turn: lastSegment,
      score: startingState.stats.maxScore,
    },
  ])("ends after $name", (overrides) => {
    const { name: _name, ...stateOverrides } = overrides;
    const ended = initializeHypotheticalState(
      { ...startingState, ...stateOverrides },
      false,
      [rankClue(3, 0, [], 1)],
      false,
      metadata,
    );
    expect(ended.ongoing.turn.currentPlayerIndex).toBeNull();

    const next = hypotheticalStateReducer(
      ended,
      rankClue(3, 1, [], 0),
      false,
      metadata,
    );
    expect(next.ongoing).toBe(ended.ongoing);
  });

  test.each([
    { rank: 5, ends: true },
    { rank: 1, ends: false },
  ] as const)(
    "with a rank $rank last in the final round, ends = $ends",
    ({ rank, ends }) => {
      let finalRound = getInitialGameState(metadata);
      for (let order = 0; order < 10; order++) {
        finalRound = gameReducer(
          finalRound,
          order < 5 ? draw(0, order) : draw(1, order, 0, rank),
          true,
          false,
          false,
          true,
          metadata,
        );
      }
      finalRound = {
        ...finalRound,
        turn: {
          ...finalRound.turn,
          endTurnNum: finalRound.turn.turnNum + metadata.options.numPlayers,
        },
      };

      const state = initializeHypotheticalState(
        finalRound,
        false,
        [rankClue(3, 0, [], 1)],
        false,
        metadata,
      );
      expect(state.ongoing.turn.currentPlayerIndex).toBe(ends ? null : 1);
    },
  );
});
