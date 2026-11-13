import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import type { Mock } from "vitest";
import { describe, expect, test, vi } from "vitest";
import type { State } from "../types/State.ts";
import type { Action } from "../types/actions.ts";

import type { HanabiCard } from "./HanabiCard.ts";

vi.mock("./UiGlobals.ts", () => ({ globals: {} }));
vi.mock("./HanabiCardMouse.ts", () => ({ setEmpathyOnHand: vi.fn() }));
const { initialState } =
  await import("../reducers/initialStates/initialState.ts");
const mouse = await import("./HanabiCardMouse.ts");
const { changeStartingHandVisibility, endHypothetical, finishHypothetical } =
  await import("./hypothetical.ts");
const { globals } = await import("./UiGlobals.ts");
const { store: appStore } = await import("../../store.ts");
const { gameStarted, gameUpdated } = await import("../gameSlice.ts");

/** Starts a game with this state in the store, and reads and changes it like a store of its own. */
function startGame(state: State) {
  appStore.dispatch(gameStarted(state));
  return {
    getState: (): State => appStore.getState().game.current!,
    dispatch: (action: Action) => appStore.dispatch(gameUpdated(action)),
  };
}

function setup(shared: boolean) {
  const metadata = getDefaultMetadata(2);
  const initial = initialState(metadata);
  const store = startGame({
    ...initial,
    visibleState: initial.ongoingGame,
    playing: false,
    finished: true,
    replay: {
      ...initial.replay,
      segment: 0,
      states: [initial.ongoingGame],
      shared: shared
        ? {
            segment: 0,
            useSharedSegments: true,
            leader: metadata.ourUsername,
            amLeader: true,
            replayStartedAt: "2026-01-01T00:00:00.000Z",
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
    lobby: { tableId: 42, joinedTableId: 42, conn: { send } },
  });
  Object.defineProperty(globals, "state", {
    configurable: true,
    get: () => store.getState(),
  });
  store.dispatch({
    type: "hypotheticalStart",
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
      action: { type: "hypothetical", control: { type: "end" } },
    });
    expect(store.getState().replay.hypothetical).not.toBeUndefined();

    // An earlier action can arrive after Exit was clicked but before the hypothetical ends.
    store.dispatch({
      type: "hypotheticalAction",
      shared: true,
      action: {
        type: "morph",
        order: 0 as CardOrder,
        identity: { suitIndex: 0, rank: 1 },
      },
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
