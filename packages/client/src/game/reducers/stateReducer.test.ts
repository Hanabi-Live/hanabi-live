import { draw, getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

vi.mock("./uiReducer", () => ({
  uiReducer: vi.fn(),
}));
const { init, replayEnter } = await import("../../../test/testActions");
const { initialState } = await import("./initialStates/initialState");
const { stateReducer } = await import("./stateReducer");

const numPlayers = 3;
const defaultMetadata = getDefaultMetadata(numPlayers);

describe("stateReducer", () => {
  test("does not mutate state", () => {
    const state = initialState(defaultMetadata);
    const unchangedState = initialState(defaultMetadata);
    const newState = stateReducer(state, draw(0, 0));
    expect(newState).not.toEqual(state);
    expect(newState).not.toStrictEqual(state);
    expect(state).toStrictEqual(unchangedState);
  });
  test("has a undefined visibleState until a gameActionList is received", () => {
    let state = initialState(defaultMetadata);
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, draw(0, 0));
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, replayEnter());
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, { type: "gameActionList", actions: [] });
    expect(state.visibleState).not.toBeUndefined();
  });
  test("joining a shared replay applies its efficiency modifier", () => {
    const action = init();
    const state = stateReducer(initialState(defaultMetadata), {
      ...action,
      sharedReplay: { ...action.sharedReplay!, efficiencyModifier: 3 },
    });
    expect(state.notes.efficiencyModifier).toBe(3);
  });
  test("rejoining a game keeps a pause that the player queued", () => {
    const state = stateReducer(initialState(defaultMetadata), {
      ...init(),
      pauseQueued: true,
    });
    expect(state.pause.queued).toBe(true);
  });
});
