import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ClockChange } from "./clock.ts";

const storeState = {
  game: {
    current: {
      pause: { pausingPlayerIndex: undefined as number | undefined },
      metadata: { options: { timeControl: undefined } },
    },
  },
  session: { settings: { soundTimer: true }, errorOccurred: false },
};
vi.mock("../store.ts", () => ({ store: { getState: () => storeState } }));
vi.mock("../sounds.ts", () => ({ play: vi.fn() }));
const clock = await import("./clock.ts");

beforeEach(() => {
  vi.useFakeTimers();
  storeState.game.current.pause.pausingPlayerIndex = undefined;
});
afterEach(() => {
  clock.reset();
  vi.useRealTimers();
});

test("an untimed game's active clock counts up and tells the listeners", () => {
  const listener = vi.fn<(change: ClockChange) => void>();
  const unsubscribe = clock.subscribe(listener);
  clock.update({
    playerTimesMs: [5000, 0],
    currentPlayerIndex: 0,
    turnElapsedMs: 0,
  });
  expect(listener).toHaveBeenLastCalledWith({ type: "update" });

  vi.advanceTimersByTime(1000);
  expect(clock.getPlayerTimes()).toEqual([6000, 0]);
  expect(clock.getTurnTime()).toBe(1000);
  expect(listener).toHaveBeenLastCalledWith({ type: "tick", warning: false });
  unsubscribe();
});

test("finishing a game stops the clocks", () => {
  clock.update({
    playerTimesMs: [5000, 0],
    currentPlayerIndex: 0,
    turnElapsedMs: 0,
  });
  clock.finish();
  vi.advanceTimersByTime(3000);
  expect(clock.getActivePlayerIndex()).toBeUndefined();
  expect(clock.getPlayerTimes()).toEqual([5000, 0]);
});

test("the clocks do not count while the game is paused", () => {
  storeState.game.current.pause.pausingPlayerIndex = 1;
  clock.update({
    playerTimesMs: [5000, 0],
    currentPlayerIndex: 0,
    turnElapsedMs: 0,
  });
  vi.advanceTimersByTime(3000);
  expect(clock.getActivePlayerIndex()).toBeUndefined();
  expect(clock.getPlayerTimes()).toEqual([]);
});
