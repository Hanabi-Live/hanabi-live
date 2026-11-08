import { draw, getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

vi.mock("./uiReducer", () => ({
  uiReducer: vi.fn(),
}));
const { replayEnter } = await import("../../../test/testActions");
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
});
