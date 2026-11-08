import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import type { Mock } from "bun:test";
import { describe, expect, mock, test } from "bun:test";
import { createStore } from "redux";

import type { HanabiCard } from "./HanabiCard";

await mock.module("../reducers/uiReducer", () => ({ uiReducer: mock() }));
await mock.module("./UIGlobals", () => ({ globals: {} }));
await mock.module("./HanabiCardMouse", () => ({ setEmpathyOnHand: mock() }));
const { initialState } = await import("../reducers/initialStates/initialState");
const { stateReducer } = await import("../reducers/stateReducer");
const { ReplayActionType } = await import("../types/ReplayActionType");
const mouse = await import("./HanabiCardMouse");
const { changeStartingHandVisibility, endHypothetical, finishHypothetical } =
  await import("./hypothetical");
const { globals } = await import("./UIGlobals");

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
            spoilerFree: false,
          }
        : null,
    },
  });
  const send = mock();
  Object.assign(globals, {
    store,
    lobby: { tableID: 42, conn: { send } },
  });
  Object.defineProperty(globals, "state", {
    configurable: true,
    get: () => store.getState(),
  });
  store.dispatch({ type: "hypoStart", showDrawnCards: false, actions: [] });
  return { store, send };
}

describe("hypothetical exit", () => {
  test("waits for the shared replay's end event before clearing pending actions", () => {
    const { store, send } = setup(true);

    endHypothetical();

    expect(send).toHaveBeenCalledWith("replayAction", {
      tableID: 42,
      type: ReplayActionType.HypoEnd,
    });
    expect(store.getState().replay.hypothetical).not.toBeNull();

    // An earlier action can arrive after Exit was clicked but before hypoEnd.
    store.dispatch({
      type: "hypoAction",
      action: { type: "morph", order: 0 as CardOrder, suitIndex: 0, rank: 1 },
    });
    expect(store.getState().replay.hypothetical?.morphedIdentities[0]).toEqual({
      suitIndex: 0,
      rank: 1,
    });

    finishHypothetical();
    expect(store.getState().replay.hypothetical).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  test("ends a solo hypothetical locally without sending to the server", () => {
    const { store, send } = setup(false);

    endHypothetical();

    expect(store.getState().replay.hypothetical).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test("ignores a duplicate end event after the hypothetical has ended", () => {
    const { store, send } = setup(true);
    finishHypothetical();
    finishHypothetical();
    expect(store.getState().replay.hypothetical).toBeNull();
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
