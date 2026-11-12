import { getDefaultMetadata } from "@hanabi-live/game";
import { createStore } from "redux";
import { describe, expect, test, vi } from "vitest";

vi.mock("../reducers/uiReducer.ts", () => ({ uiReducer: vi.fn() }));
vi.mock("./UiGlobals.ts", () => ({ globals: {} }));
vi.mock("../../modals.ts", () => ({}));
vi.mock("./arrows.ts", () => ({}));
vi.mock("./getCardOrStackBase.ts", () => ({}));
vi.mock("./konvaHelpers.ts", () => ({}));
vi.mock("../../utils.ts", () => ({
  getHtmlElement: vi.fn(),
  getHtmlInputElement: vi.fn(),
}));
const { initialState } =
  await import("../reducers/initialStates/initialState.ts");
const { stateReducer } = await import("../reducers/stateReducer.ts");
const replay = await import("./replay.ts");
const { globals } = await import("./UiGlobals.ts");

function setup(amLeader: boolean) {
  const metadata = getDefaultMetadata(2);
  const initial = initialState(metadata);
  const sharedSegment = 1;
  const store = createStore(stateReducer, {
    ...initial,
    visibleState: initial.ongoingGame,
    playing: false,
    finished: true,
    ongoingGame: {
      ...initial.ongoingGame,
      turn: { ...initial.ongoingGame.turn, segment: sharedSegment },
    },
    replay: {
      ...initial.replay,
      segment: sharedSegment,
      states: [initial.ongoingGame, initial.ongoingGame],
      shared: {
        segment: sharedSegment,
        useSharedSegments: true,
        leader: amLeader ? metadata.ourUsername : "leader",
        amLeader,
        datetimeReplayStarted: "2026-01-01T00:00:00.000Z",
        spoilerFree: false,
        canPlayAgain: false,
        restartDeclined: [],
        hypothetical: undefined,
      },
    },
  });
  Object.assign(globals, { store });
  Object.defineProperty(globals, "state", {
    configurable: true,
    get: () => store.getState(),
  });
  store.dispatch({
    type: "hypotheticalStart",
    shared: true,
    showDrawnCards: false,
    actions: [],
  });
  return store;
}

describe("replay navigation during a shared hypothetical", () => {
  test("a spectator leaves the hypothetical by pausing the shared turns", () => {
    const store = setup(false);

    replay.back();

    const state = store.getState().replay;
    expect(state.shared?.useSharedSegments).toBe(false);
    expect(state.hypothetical).toBeUndefined();
    expect(state.shared?.hypothetical).not.toBeUndefined();
    expect(state.segment).toBe(0);
  });

  test("the leader stays in the hypothetical", () => {
    const store = setup(true);

    replay.back();

    const state = store.getState().replay;
    expect(state.shared?.useSharedSegments).toBe(true);
    expect(state.hypothetical).not.toBeUndefined();
    expect(state.segment).toBe(1);
  });
});
