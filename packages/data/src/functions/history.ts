import type { GameHistoryEntry } from "../interfaces/GameHistoryEntry.ts";

type CompletedGame = Pick<GameHistoryEntry, "gameID" | "datetimeFinished">;

export function compareGameHistory(
  left: CompletedGame,
  right: CompletedGame,
): number {
  const difference =
    new Date(right.datetimeFinished).getTime()
    - new Date(left.datetimeFinished).getTime();
  if (Number.isNaN(difference)) {
    throw new TypeError(
      "Cannot sort game history with an invalid completion time.",
    );
  }
  return difference === 0 ? right.gameID - left.gameID : difference;
}
