import { expect, test } from "vitest";
import { getRankKeyIndex } from "./useHotkeys.ts";

test("a number key chooses a rank by where it is", () => {
  expect(
    getRankKeyIndex({
      code: "Digit1",
      key: "1",
    }),
  ).toBe(0);
  // On a French keyboard, the key types "&" without Shift.
  expect(
    getRankKeyIndex({
      code: "Digit1",
      key: "&",
    }),
  ).toBe(0);
  expect(
    getRankKeyIndex({
      code: "Numpad5",
      key: "5",
    }),
  ).toBe(4);
  // Without Num Lock, the key is End.
  expect(
    getRankKeyIndex({
      code: "Numpad1",
      key: "End",
    }),
  ).toBeUndefined();
  expect(
    getRankKeyIndex({
      code: "KeyQ",
      key: "q",
    }),
  ).toBeUndefined();
});
