import { assertNotNull } from "complete-common";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("../../tooltips", () => ({}));
vi.mock("./konvaHelpers", () => ({ drawLayer: vi.fn() }));
vi.mock("./UIGlobals", () => ({
  globals: {
    state: { finished: true },
    elements: {
      timer1: { hide: vi.fn() },
      timer2: { hide: vi.fn() },
    },
    layers: { timer: { batchDraw: vi.fn() } },
    timerID: null,
    playerTimes: [],
    activePlayerIndex: -1,
    timeTaken: 0,
  },
}));
const { globals } = await import("./UIGlobals");
const { resumeAfterResize, update } = await import("./timer");

beforeEach(() => {
  vi.clearAllMocks();
  globals.playerTimes = [10_000, 20_000];
  globals.activePlayerIndex = 0;
  globals.timerID = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("a late live clock cannot restart timers in a finished replay", () => {
  globals.timerID = 123;
  const clear = vi.spyOn(globalThis, "clearInterval");
  const start = vi.spyOn(globalThis, "setInterval");
  const first = globals.elements.timer1;
  const second = globals.elements.timer2;
  assertNotNull(first, "Missing first timer fixture.");
  assertNotNull(second, "Missing second timer fixture.");
  const hideFirst = vi.spyOn(first, "hide");
  const hideSecond = vi.spyOn(second, "hide");
  update({
    times: [10_000, 20_000],
    activePlayerIndex: 0,
    timeTaken: 100,
  });
  expect(clear).toHaveBeenCalledWith(123);
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerID).toBeNull();
  expect(globals.activePlayerIndex).toBe(-1);
  expect(hideFirst).toHaveBeenCalled();
  expect(hideSecond).toHaveBeenCalled();
});

test("resizing a replay does not resume a stale active-player clock", () => {
  const start = vi.spyOn(globalThis, "setInterval");
  resumeAfterResize();
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerID).toBeNull();
});
