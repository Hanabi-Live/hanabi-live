import type { CardOrder } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";
import type { State } from "./types/State.ts";
import type { Action } from "./types/actions.ts";

const send = vi.fn();
vi.mock("../Globals.ts", () => ({
  globals: { connection: { send }, joinedTableId: 42 },
}));
const { initialState } =
  await import("./reducers/initialStates/initialState.ts");
const { endHypothetical, finishHypothetical } =
  await import("./hypothetical.ts");
const { store: appStore } = await import("../store.ts");
const { gameStarted, gameUpdated } = await import("./gameSlice.ts");

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
  send.mockClear();
  store.dispatch({
    type: "hypotheticalStart",
    shared,
    showDrawnCards: false,
    actions: [],
  });
  return { store };
}

describe("hypothetical exit", () => {
  test("waits for the shared replay's end event before clearing pending actions", () => {
    const { store } = setup(true);

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
    const { store } = setup(false);

    endHypothetical();

    expect(store.getState().replay.hypothetical).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  test("ignores a duplicate end event after the hypothetical has ended", () => {
    const { store } = setup(true);
    finishHypothetical();
    finishHypothetical();
    expect(store.getState().replay.hypothetical).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
