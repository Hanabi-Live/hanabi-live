import type {
  CardOrder,
  GameAction,
  GameState,
  PlanHypotheticalActionContext,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi-live/game";
import {
  gameReducer,
  getDefaultMetadata,
  getDefaultVariant,
  getInitialCardState,
  planHypotheticalAction,
} from "@hanabi-live/game";
import { describe, expect, jest, test } from "@jest/globals";
import { initialState } from "../reducers/initialStates/initialState";
import { ActionType } from "../types/ActionType";
import { globals } from "./UIGlobals";
import { getCardOrStackBase } from "./getCardOrStackBase";
import { sendHypotheticalAction } from "./hypothetical";
import { planClientHypotheticalAction } from "./planClientHypotheticalAction";

jest.mock("./UIGlobals", () => ({ globals: {} }));
jest.mock("./HanabiCardMouse", () => ({}));

const bottomOrder = 2 as CardOrder;

function makeContext(rank: Rank = 1): PlanHypotheticalActionContext {
  const variant = getDefaultVariant();
  const metadata = getDefaultMetadata(2);
  const state = initialState(metadata);
  const deck = [0, 1].map((order) => ({
    ...getInitialCardState(order as CardOrder, variant, 2),
    location: order as PlayerIndex,
  }));
  return {
    metadata: {
      ...metadata,
      options: { ...metadata.options, deckPlays: true },
    },
    variant,
    gameState: {
      ...state.ongoingGame,
      turn: {
        ...state.ongoingGame.turn,
        segment: 4,
        turnNum: 6,
        currentPlayerIndex: 0 as PlayerIndex,
      },
      deck,
      hands: [[0 as CardOrder], [1 as CardOrder]],
      cardsRemainingInTheDeck: 1,
    },
    cardIdentities: [
      { suitIndex: 0 as SuitIndex, rank: 1 },
      { suitIndex: 0 as SuitIndex, rank: 1 },
      { suitIndex: 0 as SuitIndex, rank },
    ],
    morphedIdentities: [],
    notes: state.notes.ourNotes,
    playing: false,
    // Only drawn cards have UI views. The bottom card is absent from both collections.
    cardViews: deck.map((card) => ({
      state: card,
      isStackBase: false,
      visibleSuitIndex: null,
      visibleRank: null,
    })),
  };
}

function applyPlan(
  actions: readonly GameAction[] | null,
  context: PlanHypotheticalActionContext,
): GameState {
  expect(actions).not.toBeNull();
  let state = context.gameState;
  for (const action of actions!) {
    state = gameReducer(
      state,
      action,
      context.playing,
      false,
      false,
      true,
      context.metadata,
    );
  }
  return state;
}

describe("client hypothetical planning", () => {
  test.each([1, 2] as const)(
    "sends a bottom-deck rank %s play through the real client handoff without a UI card",
    (rank) => {
      const context = makeContext(rank);
      const state = initialState(context.metadata);
      const dispatch = jest.fn();
      Object.assign(globals, {
        metadata: context.metadata,
        variant: context.variant,
        deck: [],
        state: {
          ...state,
          playing: context.playing,
          cardIdentities: context.cardIdentities,
          replay: {
            ...state.replay,
            hypothetical: {
              ongoing: context.gameState,
              morphedIdentities: [],
            },
          },
        },
        store: { dispatch },
      });
      expect(getCardOrStackBase(bottomOrder)).toBeUndefined();

      sendHypotheticalAction({ type: ActionType.Play, target: bottomOrder });

      const actions = planClientHypotheticalAction(
        { type: "play", order: bottomOrder },
        context,
      );
      expect(actions).not.toBeNull();
      expect(dispatch).toHaveBeenCalledTimes(rank === 1 ? 3 : 4);
      for (const [index, action] of actions!.entries()) {
        expect(dispatch).toHaveBeenNthCalledWith(index + 1, {
          type: "hypoAction",
          action,
        });
      }
    },
  );

  test("plans the exact final order without an existing UI card", () => {
    const context = makeContext();
    const intent = { type: "play", order: bottomOrder } as const;
    expect(context.gameState.deck[bottomOrder]).toBeUndefined();
    expect(
      context.cardViews.find(({ state }) => state.order === bottomOrder),
    ).toBeUndefined();
    expect(planHypotheticalAction(intent, context)).toBeNull();

    const actions = planClientHypotheticalAction(intent, context);
    expect(actions).toEqual([
      { type: "draw", order: 2, playerIndex: 0, suitIndex: 0, rank: 1 },
      { type: "play", order: 2, playerIndex: 0, suitIndex: 0, rank: 1 },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[bottomOrder]?.location).toBe("playStack");
    expect(state.cardsRemainingInTheDeck).toBe(0);
    expect(state.turn.currentPlayerIndex).toBe(1);
    expect(context.cardViews).toHaveLength(2);
    expect(context.gameState.deck).toHaveLength(2);
  });

  test("draws before a failed discard and strike without an existing UI card", () => {
    const context = makeContext(2);
    const actions = planClientHypotheticalAction(
      { type: "play", order: bottomOrder },
      context,
    );
    expect(actions).toEqual([
      { type: "draw", order: 2, playerIndex: 0, suitIndex: 0, rank: 2 },
      {
        type: "discard",
        order: 2,
        playerIndex: 0,
        suitIndex: 0,
        rank: 2,
        failed: true,
      },
      { type: "strike", num: 1, turn: 4, order: 2 },
      { type: "turn", num: 7, currentPlayerIndex: 1 },
    ]);
    const state = applyPlan(actions, context);
    expect(state.hands).toEqual(context.gameState.hands);
    expect(state.deck[bottomOrder]).toMatchObject({
      location: "discard",
      isMisplayed: true,
    });
    expect(state.cardsRemainingInTheDeck).toBe(0);
  });

  test.each(["play", "discard"] as const)(
    "preserves ordinary hand %s before the final draw",
    (type) => {
      const context = makeContext();
      const intent = { type, order: 0 as CardOrder };
      const actions = planClientHypotheticalAction(intent, context);
      expect(actions).toEqual(planHypotheticalAction(intent, context));
      expect(actions?.map((action) => action.type)).toEqual([
        type,
        "draw",
        "turn",
      ]);
    },
  );

  test("rejects a bottom card without a UI view when deck plays are disabled", () => {
    const base = makeContext();
    const context = {
      ...base,
      metadata: {
        ...base.metadata,
        options: { ...base.metadata.options, deckPlays: false },
      },
    };
    expect(
      planClientHypotheticalAction(
        { type: "play", order: bottomOrder },
        context,
      ),
    ).toBeNull();
  });

  test.each([2, 3])(
    "rejects missing future order %s with two cards remaining",
    (order) => {
      const base = makeContext();
      const context = {
        ...base,
        gameState: { ...base.gameState, cardsRemainingInTheDeck: 2 },
        cardIdentities: [...base.cardIdentities, base.cardIdentities[0]!],
      };
      expect(
        planClientHypotheticalAction(
          { type: "play", order: order as CardOrder },
          context,
        ),
      ).toBeNull();
    },
  );

  test("rejects a missing order beyond the final card", () => {
    expect(
      planClientHypotheticalAction(
        { type: "play", order: 3 as CardOrder },
        makeContext(),
      ),
    ).toBeNull();
  });

  test("requires the remaining count to agree with the final order", () => {
    const base = makeContext();
    const context = {
      ...base,
      gameState: { ...base.gameState, cardsRemainingInTheDeck: 2 },
    };
    expect(
      planClientHypotheticalAction(
        { type: "play", order: bottomOrder },
        context,
      ),
    ).toBeNull();
  });
});
