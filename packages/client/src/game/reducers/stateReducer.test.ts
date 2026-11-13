import { draw, getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";

const { init, replayEnter } = await import("../../../test/testActions.ts");
const { initialState } = await import("./initialStates/initialState.ts");
const { stateReducer } = await import("./stateReducer.ts");

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
    const joined = stateReducer(initialState(defaultMetadata), init());
    const state = stateReducer(joined, {
      type: "sharedReplayState",
      turn: 0,
      efficiencyModifier: 3,
      restartDecliners: [],
      leader: "alice",
    });
    expect(state.notes.efficiencyModifier).toBe(3);
  });
  test("a pause message replaces the pause state", () => {
    const queued = stateReducer(initialState(defaultMetadata), {
      type: "pause",
      pausingPlayerIndex: undefined,
      queued: true,
    });
    expect(queued.pause.queued).toBe(true);
    const paused = stateReducer(queued, {
      type: "pause",
      pausingPlayerIndex: 1,
      queued: true,
    });
    expect(paused.pause).toMatchObject({ pausingPlayerIndex: 1, queued: true });
  });
});
