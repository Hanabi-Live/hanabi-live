import { draw, getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { Action } from "../types/actions.ts";

const { replayEnter, init } = await import("../../../test/testActions.ts");
const { initialState } = await import("./initialStates/initialState.ts");
const { stateReducer } = await import("./stateReducer.ts");

const numPlayers = 3;

/** A "gameStateLoaded" action with nothing in it but `parts`. */
function gameStateLoaded(
  parts: Partial<Extract<Action, { type: "gameStateLoaded" }>>,
): Action {
  return {
    type: "gameStateLoaded",
    sharedReplay: undefined,
    actions: [],
    cardIdentities: undefined,
    notes: [],
    pause: undefined,
    spectators: [],
    hypothetical: undefined,
    ...parts,
  };
}
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
  test("has a undefined visibleState until the game's state is loaded", () => {
    let state = initialState(defaultMetadata);
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, draw(0, 0));
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, replayEnter());
    expect(state.visibleState).toBeUndefined();

    state = stateReducer(state, gameStateLoaded({}));
    expect(state.visibleState).not.toBeUndefined();
  });
  test("loading the game's state keeps each of its steps", () => {
    const joined = stateReducer(initialState(defaultMetadata), init());
    const state = stateReducer(
      joined,
      gameStateLoaded({
        sharedReplay: {
          turn: 0,
          efficiencyModifier: 3,
          restartDecliners: [],
          leader: "alice",
        },
        actions: [draw(0, 0, 0, 1), draw(1, 1, 0, 2)],
        notes: [
          {
            username: "bob",
            notes: ["a note"],
            spectator: true,
          },
        ],
      }),
    );
    // The notes load after the shared replay's efficiency modifier, which they keep.
    expect(state.notes.efficiencyModifier).toBe(3);
    expect(state.notes.allNotes[0]?.[0]?.text).toBe("a note");
    expect(state.ongoingGame.deck).toHaveLength(2);
    expect(state.replay.shared?.leader).toBe("alice");
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
    expect(paused.pause).toMatchObject({
      pausingPlayerIndex: 1,
      queued: true,
    });
  });
});
