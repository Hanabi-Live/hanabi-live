import { compareGameHistory } from "@hanabi-live/data";
import { expect, test } from "@jest/globals";

test("history follows completion time rather than ID allocation order", () => {
  const games = [
    { id: 20, datetimeFinished: "2026-01-01T12:00:00Z" },
    { id: 10, datetimeFinished: "2026-01-01T12:01:00Z" },
    { id: 30, datetimeFinished: new Date("2026-01-01T07:00:00-05:00") },
  ];
  expect(games.toSorted(compareGameHistory).map((game) => game.id)).toEqual([
    10, 30, 20,
  ]);
});

test("invalid completion times are not silently treated as ID ordering", () => {
  expect(() =>
    compareGameHistory(
      { id: 1, datetimeFinished: "invalid" },
      { id: 2, datetimeFinished: "2026-01-01T12:00:00Z" },
    ),
  ).toThrow("invalid completion time");
});
