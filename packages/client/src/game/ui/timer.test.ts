import { assertDefined } from "complete-common";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../../tooltips.ts", () => ({ setContent: vi.fn() }));
vi.mock("./konvaHelpers.ts", () => ({ drawLayer: vi.fn() }));
vi.mock("./UiGlobals.ts", () => ({
  globals: {
    state: { finished: true },
    elements: {
      timer1: { hide: vi.fn() },
      timer2: { hide: vi.fn() },
    },
    layers: { timer: { batchDraw: vi.fn() } },
    timerId: undefined,
    playerTimes: [],
    clockPlayerIndex: undefined,
    timeTaken: 0,
  },
}));
const { globals } = await import("./UiGlobals.ts");
const tooltips = await import("../../tooltips.ts");
const { resumeAfterResize, stop, update } = await import("./timer.ts");

beforeEach(() => {
  vi.clearAllMocks();
  globals.playerTimes = [10_000, 20_000];
  globals.clockPlayerIndex = 0;
  globals.timerId = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("a late live clock cannot restart timers in a finished replay", () => {
  globals.timerId = 123;
  const clear = vi.spyOn(globalThis, "clearInterval");
  const start = vi.spyOn(globalThis, "setInterval");
  const first = globals.elements.timer1;
  const second = globals.elements.timer2;
  assertDefined(first, "Missing first timer fixture.");
  assertDefined(second, "Missing second timer fixture.");
  const hideFirst = vi.spyOn(first, "hide");
  const hideSecond = vi.spyOn(second, "hide");
  update({
    playerTimesMs: [10_000, 20_000],
    currentPlayerIndex: 0,
    turnElapsedMs: 100,
  });
  expect(clear).toHaveBeenCalledWith(123);
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerId).toBeUndefined();
  expect(globals.clockPlayerIndex).toBeUndefined();
  expect(hideFirst).toHaveBeenCalled();
  expect(hideSecond).toHaveBeenCalled();
});

test("resizing a replay does not resume a stale active-player clock", () => {
  const start = vi.spyOn(globalThis, "setInterval");
  resumeAfterResize();
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerId).toBeUndefined();
});

test("untimed games without timers still update the player time tooltips", () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  const { elements, state } = globals;
  Object.assign(globals, {
    state: {
      finished: false,
      playing: true,
      pause: { pausingPlayerIndex: undefined },
    },
    elements: { timer1: undefined, timer2: undefined, deck: undefined },
    options: { speedrun: false },
    lobby: { settings: { speedrunMode: false, showTimerInUntimed: false } },
    metadata: { ourPlayerIndex: 1 },
  });
  try {
    update({
      playerTimesMs: [5000, 0],
      currentPlayerIndex: 0,
      turnElapsedMs: 0,
    });
    expect(globals.playerTimes).toEqual([5000, 0]);
    expect(tooltips.setContent).toHaveBeenCalledWith(
      "#tooltip-player-0",
      "Time taken:<br /><strong>0:05</strong>",
    );

    vi.advanceTimersByTime(1000);
    expect(tooltips.setContent).toHaveBeenLastCalledWith(
      "#tooltip-player-0",
      "Time taken:<br /><strong>0:06</strong>",
    );
  } finally {
    stop();
    Object.assign(globals, { elements, state });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
