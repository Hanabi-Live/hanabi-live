import type { GameId } from "@hanabi-live/data";
import { compareGameHistory } from "@hanabi-live/data";
import { expect, test } from "vitest";

function game(id: number, finishedAt: string) {
  return { gameId: id as GameId, finishedAt };
}

test("history follows completion time rather than ID allocation order", () => {
  const games = [
    game(20, "2026-01-01T12:00:00Z"),
    game(10, "2026-01-01T12:01:00Z"),
    game(30, "2026-01-01T07:00:00-05:00"),
  ];
  expect(
    games.toSorted(compareGameHistory).map(({ gameId }) => gameId),
  ).toEqual([10, 30, 20]);
});

test("invalid completion times are not silently treated as ID ordering", () => {
  expect(() =>
    compareGameHistory(game(1, "invalid"), game(2, "2026-01-01T12:00:00Z")),
  ).toThrow("invalid completion time");
});
