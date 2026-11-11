import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { createStore } from "redux";
import type { Mock } from "vitest";
import { describe, expect, test, vi } from "vitest";

import type { HanabiCard } from "./HanabiCard.ts";

vi.mock("../reducers/uiReducer.ts", () => ({ uiReducer: vi.fn() }));
vi.mock("./UIGlobals.ts", () => ({ globals: {} }));
vi.mock("./HanabiCardMouse.ts", () => ({ setEmpathyOnHand: vi.fn() }));
const { initialState } =
  await import("../reducers/initialStates/initialState.ts");
const { stateReducer } = await import("../reducers/stateReducer.ts");
const mouse = await import("./HanabiCardMouse.ts");
const { changeStartingHandVisibility, endHypothetical, finishHypothetical } =
  await import("./hypothetical.ts");
const { globals } = await import("./UIGlobals.ts");

function setup(shared: boolean) {
  const metadata = getDefaultMetadata(2);
  const initial = initialState(metadata);
  const store = createStore(stateReducer, {
    ...initial,
    visibleState: initial.ongoingGame,
    playing: false,
    finished: true,
    replay: {
      ...initial.replay,
      active: true,
      states: [initial.ongoingGame],
      shared: shared
        ? {
            segment: 0,
            useSharedSegments: true,
            leader: metadata.ourUsername,
            amLeader: true,
            datetimeStarted: "2026-01-01T00:00:00.000Z",
            spoilerFree: false,
            canPlayAgain: false,
            restartDeclined: [],
            hypothetical: undefined,
          }
        : undefined,
    },
  });
  const send = vi.fn();
  Object.assign(globals, {
    store,
    lobby: { tableId: 42, joinedTableId: 42, conn: { send } },
  });
  Object.defineProperty(globals, "state", {
    configurable: true,
    get: () => store.getState(),
  });
  store.dispatch({
    type: "hypoStart",
    shared,
    showDrawnCards: false,
    actions: [],
  });
  return { store, send };
}

describe("hypothetical exit", () => {
  test("waits for the shared replay's end event before clearing pending actions", () => {
    const { store, send } = setup(true);

    endHypothetical();

    expect(send).toHaveBeenCalledWith("replayAction", {
      tableId: 42,
      action: { type: "hypoEnd" },
    });
    expect(store.getState().replay.hypothetical).not.toBeUndefined();

    // An earlier action can arrive after Exit was clicked but before hypoEnd.
    store.dispatch({
      type: "hypoAction",
      shared: true,
      action: { type: "morph", order: 0 as CardOrder, suitIndex: 0, rank: 1 },
    });
    expect(store.getState().replay.hypothetical?.morphedIdentities[0]).toEqual({
      suitIndex: 0,
      rank: 1,
    });

    finishHypothetical();
    expect(store.getState().replay.hypothetical).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("ends a solo hypothetical locally without sending to the server", () => {
    const { store, send } = setup(false);

    endHypothetical();

    expect(store.getState().replay.hypothetical).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test("ignores a duplicate end event after the hypothetical has ended", () => {
    const { store, send } = setup(true);
    finishHypothetical();
    finishHypothetical();
    expect(store.getState().replay.hypothetical).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("hypothetical hand empathy", () => {
  test("uses the LayoutChild card when its first Konva child is not a card", () => {
    setup(false);
    const card = { state: { location: 0 } } as unknown as HanabiCard;
    const hand = {
      children: [{ card, children: [{ isDecoration: true }] }],
    };
    Object.assign(globals, {
      elements: { playerHands: [hand, { children: [] }] },
      options: { numPlayers: 2 },
    });

    changeStartingHandVisibility();

    const empathyCalls = (
      mouse.setEmpathyOnHand as unknown as Mock<typeof mouse.setEmpathyOnHand>
    ).mock.calls;
    expect(empathyCalls).toHaveLength(1);
    expect(empathyCalls[0]).toEqual([card, true]);
  });
});
