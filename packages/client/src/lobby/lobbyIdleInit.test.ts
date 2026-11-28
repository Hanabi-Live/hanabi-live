import { expect, test, vi } from "vitest";

vi.mock("../Globals.ts", () => ({
  globals: {},
}));
const { getInactiveToReport } = await import("./lobbyIdleInit.ts");

test("reports only what the server does not know", () => {
  expect(getInactiveToReport(14, false)).toBeUndefined();
  expect(getInactiveToReport(15, false)).toBe(true);
  // A new connection starts as active, so we report again long after the threshold.
  expect(getInactiveToReport(40, false)).toBe(true);
  expect(getInactiveToReport(40, true)).toBeUndefined();
  expect(getInactiveToReport(0, true)).toBe(false);
});
