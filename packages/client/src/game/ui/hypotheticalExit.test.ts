import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, jest, test } from "@jest/globals";
import { createStore } from "redux";
import { initialState } from "../reducers/initialStates/initialState";
import { stateReducer } from "../reducers/stateReducer";
import { ReplayActionType } from "../types/ReplayActionType";
import { globals } from "./UIGlobals";
import { endHypothetical, finishHypothetical } from "./hypothetical";

jest.mock("../reducers/uiReducer", () => ({ uiReducer: jest.fn() }));
jest.mock("./UIGlobals", () => ({ globals: {} }));
jest.mock("./HanabiCardMouse", () => ({}));

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
          }
        : null,
    },
  });
  const send = jest.fn();
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
