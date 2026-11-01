interface CompletedGame {
  id: number;
  datetimeFinished: Date | string;
}

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
