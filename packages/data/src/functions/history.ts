import type { GameSummary } from "../interfaces/GameSummary.ts";

type CompletedGame = Pick<GameSummary, "gameId" | "finishedAt">;

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
