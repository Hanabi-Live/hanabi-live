import type { GameHistory } from "../interfaces/GameHistory";

type CompletedGame = Pick<GameHistory, "id" | "datetimeFinished">;

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
  return difference === 0 ? right.id - left.id : difference;
}
