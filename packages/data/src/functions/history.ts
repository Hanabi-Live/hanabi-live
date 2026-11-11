import type { GameHistoryEntry } from "../interfaces/GameHistoryEntry.ts";

type CompletedGame = Pick<GameHistoryEntry, "gameId" | "finishedAt">;

export function compareGameHistory(
  left: CompletedGame,
  right: CompletedGame,
): number {
  const difference =
    new Date(right.finishedAt).getTime() - new Date(left.finishedAt).getTime();
  if (Number.isNaN(difference)) {
    throw new TypeError(
      "Cannot sort game history with an invalid completion time.",
    );
  }
  return difference === 0 ? right.gameId - left.gameId : difference;
}
