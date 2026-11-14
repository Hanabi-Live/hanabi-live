import { describe, expect, test } from "vitest";
import { getPlayerLog } from "./PlayerLog.tsx";

describe("getPlayerLog", () => {
  const log = [
    { turn: 1, text: "Alice plays Red 1 from slot #1" },
    { turn: 2, text: "Al tells Alice about one red" },
    { turn: 3, text: "Bob discards Blue 4 from slot #5" },
    { turn: 4, text: "Alice discards Green 3 from slot #2" },
  ];
  const playerNames = ["Al", "Alice", "Bob"];

  test("lists only the lines of the player who acted", () => {
    expect(
      getPlayerLog(log, playerNames, 1).map((entry) => entry.turn),
    ).toEqual([1, 4]);
    expect(
      getPlayerLog(log, playerNames, 0).map((entry) => entry.turn),
    ).toEqual([2]);
    expect(
      getPlayerLog(log, playerNames, 2).map((entry) => entry.turn),
    ).toEqual([3]);
  });
});
