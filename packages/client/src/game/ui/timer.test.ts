import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { assertNotNull } from "complete-common";

await mock.module("../../tooltips", () => ({}));
await mock.module("./konvaHelpers", () => ({ drawLayer: mock() }));
await mock.module("./UIGlobals", () => ({
  globals: {
    state: { finished: true },
    elements: {
      timer1: { hide: mock() },
      timer2: { hide: mock() },
    },
    layers: { timer: { batchDraw: mock() } },
    timerID: null,
    playerTimes: [],
    activePlayerIndex: -1,
    timeTaken: 0,
  },
}));
const { globals } = await import("./UIGlobals");
const { resumeAfterResize, update } = await import("./timer");

beforeEach(() => {
  mock.clearAllMocks();
  globals.playerTimes = [10_000, 20_000];
  globals.activePlayerIndex = 0;
  globals.timerID = null;
});
afterEach(() => {
  mock.restore();
});

test("a late live clock cannot restart timers in a finished replay", () => {
  globals.timerID = 123;
  const clear = spyOn(globalThis, "clearInterval");
  const start = spyOn(globalThis, "setInterval");
  const first = globals.elements.timer1;
  const second = globals.elements.timer2;
  assertNotNull(first, "Missing first timer fixture.");
  assertNotNull(second, "Missing second timer fixture.");
  const hideFirst = spyOn(first, "hide");
  const hideSecond = spyOn(second, "hide");
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
  const start = spyOn(globalThis, "setInterval");
  resumeAfterResize();
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerID).toBeNull();
});
