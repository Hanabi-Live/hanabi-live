import { describe, expect, test } from "bun:test";
import { millisecondsToClockString, secondsToClockString } from "./text.js";

describe("secondsToClockString", () => {
  test("omits hours under an hour", () => {
    expect(secondsToClockString(0)).toBe("0:00");
    expect(secondsToClockString(90)).toBe("1:30");
    expect(secondsToClockString(3599)).toBe("59:59");
  });

  test("shows hours without wrapping at a day", () => {
    expect(secondsToClockString(3600)).toBe("1:00:00");
    expect(secondsToClockString(9000)).toBe("2:30:00");
    expect(secondsToClockString(7 * 24 * 3600 + 65)).toBe("168:01:05");
  });
});

describe("millisecondsToClockString", () => {
  test("rounds up and ignores the untimed sign", () => {
    expect(millisecondsToClockString(-61_001)).toBe("1:02");
    expect(millisecondsToClockString(7_200_000)).toBe("2:00:00");
  });
});
