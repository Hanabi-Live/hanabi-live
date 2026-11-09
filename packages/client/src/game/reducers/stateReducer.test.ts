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
  test("has a null visibleState until a gameActionList is received", () => {
    let state = initialState(defaultMetadata);
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, draw(0, 0));
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, replayEnter());
    expect(state.visibleState).toBeNull();

    state = stateReducer(state, { type: "gameActionList", actions: [] });
    expect(state.visibleState).not.toBeNull();
  });
  test("joining a shared replay applies its efficiency modifier", () => {
    const state = stateReducer(initialState(defaultMetadata), {
      ...init(),
      sharedReplayEffMod: 3,
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
