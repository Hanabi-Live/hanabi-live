import { afterEach, beforeEach, expect, jest, test } from "@jest/globals";
import { assertNotNull } from "complete-common";
import { globals } from "./UIGlobals";
import { resumeAfterResize, update } from "./timer";

jest.mock("../../tooltips", () => ({}));
jest.mock("./konvaHelpers", () => ({ drawLayer: jest.fn() }));
jest.mock("./UIGlobals", () => ({
  globals: {
    state: { finished: true },
    elements: {
      timer1: { hide: jest.fn() },
      timer2: { hide: jest.fn() },
    },
    layers: { timer: { batchDraw: jest.fn() } },
    timerID: null,
    playerTimes: [],
    activePlayerIndex: -1,
    timeTaken: 0,
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  globals.playerTimes = [10_000, 20_000];
  globals.activePlayerIndex = 0;
  globals.timerID = null;
});
afterEach(() => {
  jest.restoreAllMocks();
});

test("a late live clock cannot restart timers in a finished replay", () => {
  globals.timerID = 123;
  const clear = jest.spyOn(globalThis, "clearInterval");
  const start = jest.spyOn(globalThis, "setInterval");
  const first = globals.elements.timer1;
  const second = globals.elements.timer2;
  assertNotNull(first, "Missing first timer fixture.");
  assertNotNull(second, "Missing second timer fixture.");
  const hideFirst = jest.spyOn(first, "hide");
  const hideSecond = jest.spyOn(second, "hide");
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
  const start = jest.spyOn(globalThis, "setInterval");
  resumeAfterResize();
  expect(start).not.toHaveBeenCalled();
  expect(globals.timerID).toBeNull();
});
