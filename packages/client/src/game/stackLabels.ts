// The labels under the play stacks that say which way a stack goes, or where a stack can start.
// Both game screens show them.

import type { CardOrder, Rank, SuitIndex, Variant } from "@hanabi-live/game";
import { StackDirection } from "@hanabi-live/game";

const REVERSED_LABELS = {
  [StackDirection.Undecided]: "",
  [StackDirection.Up]: "",
  [StackDirection.Down]: "Reversed",
  [StackDirection.Finished]: "Reversed",
} as const satisfies Record<StackDirection, string>;

const UP_OR_DOWN_LABELS = {
  [StackDirection.Undecided]: "",
  [StackDirection.Up]: "Up",
  [StackDirection.Down]: "Down",
  [StackDirection.Finished]: "Finished",
} as const satisfies Record<StackDirection, string>;

/**
 * The label of a play stack whose direction matters: "Up", "Down", or "Finished" in "Up or Down"
 * variants, and "Reversed" for a reversed suit. It is empty for every other stack.
 */
export function getStackDirectionLabel(
  variant: Variant,
  suitIndex: SuitIndex,
  direction: StackDirection,
): string {
  if (variant.upOrDown) {
    return UP_OR_DOWN_LABELS[direction];
  }

  return variant.suits[suitIndex]?.reversed === true
    ? REVERSED_LABELS[direction]
    : "";
}

/**
 * The labels of the play stacks in "Sudoku" variants. A stack that has not started lists the ranks
 * that no other stack started with, such as "Start: [135]", or "Start: [Any]". A started stack
 * shows its ranks in the order that they are played, such as "[ 3 4 5 _ _ ]". A full stack is
 * "Finished".
 */
export function getSudokuStackLabels(
  variant: Variant,
  playStacks: ReadonlyArray<readonly CardOrder[]>,
  playStackStarts: ReadonlyArray<Rank | undefined>,
): readonly string[] {
  const { stackSize } = variant;
  const usedStarts = new Set(playStackStarts);
  const availableStarts = variant.ranks.filter((rank) => !usedStarts.has(rank));

  return playStacks.map((stack, suitIndex) => {
    if (stack.length === variant.ranks.length) {
      return "Finished";
    }

    const start = playStackStarts[suitIndex];
    if (start !== undefined && stack.length > 0) {
      const playedRanks = stack.map(
        (_order, offset) => ((offset + start - 1) % stackSize) + 1,
      );
      const ranksText =
        playedRanks.join(" ") + " _".repeat(stackSize - stack.length);
      return `[ ${ranksText} ]`;
    }

    const startsText =
      availableStarts.length === stackSize ? "Any" : availableStarts.join("");
    return `Start: [${startsText}]`;
  });
}
