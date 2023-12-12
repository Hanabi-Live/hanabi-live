import type { NumSuits, Rank, SuitIndex, Variant } from "@hanabi/data";
import { DEFAULT_CARD_RANKS } from "@hanabi/data";
import type { Tuple } from "@hanabi/utils";
import { assertDefined, eRange, iRange, newArray } from "@hanabi/utils";
import type { CardState } from "../../types/CardState";
import type { GameState } from "../../types/GameState";
import { getAllDiscardedSet } from "./discardHelpers";

/** Check if the card can still be played in a Sudoku variant. */
export function sudokuCanStillBePlayed(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): boolean {
  const allDiscardedSet = getAllDiscardedSet(variant, deck, suitIndex);
  const { maxScoresForEachStartingValueOfSuit } = sudokuWalkUpAll(
    allDiscardedSet,
    variant,
  );

  const playStackStart = playStackStarts[suitIndex];
  assertDefined(
    playStackStart,
    `Failed to find the play stack start for suit index: ${suitIndex}`,
  );

  const possibleStackStartRanks =
    playStackStart === null
      ? sudokuGetUnusedStackStartRanks(playStackStarts, variant)
      : [playStackStart];

  // Here, we check if we can play the specified card if we start the stack at `playStackStart`. For
  // this, note that we can compare the difference of our card and the start with the longest play
  // sequence starting at the start, thereby checking if the specified rank is included.
  return possibleStackStartRanks.some((possibleStackStartRank) => {
    const longestSequence =
      (rank - possibleStackStartRank + variant.stackSize) % variant.stackSize;
    const score =
      maxScoresForEachStartingValueOfSuit[possibleStackStartRank - 1];
    assertDefined(
      score,
      `Failed to find the max score for starting suit index ${suitIndex} at start rank: ${possibleStackStartRank}`,
    );
    return score > longestSequence;
  });
}

/**
 * For Sudoku variants, given a boolean map for which ranks [1, 2, 3, 4, 5] are all discarded,
 * returns an array for these ranks of the longest play sequences starting at these maps (indexed 0
 * through 4), and a boolean stating whether all ranks are still available, i.e. whether the
 * returned array is [5, 5, 5, 5, 5]. This functions mimics the method `sudokuWalkUpAll` from the
 * server file "variants_sudoku.go".
 */
export function sudokuWalkUpAll(
  allDiscardedSet: ReadonlySet<Rank>,
  variant: Variant,
): {
  allMax: boolean;
  maxScoresForEachStartingValueOfSuit: Tuple<number, Rank>;
} {
  const maxScoresForEachStartingValueOfSuit = newArray(
    variant.suits.length,
    variant.stackSize,
  ) as Tuple<number, Rank>;
  let lastDead = 0;

  for (const currentRank of variant.ranks) {
    if (allDiscardedSet.has(currentRank)) {
      // We hit a new dead rank.
      for (const writeRank of eRange(lastDead + 1, currentRank)) {
        maxScoresForEachStartingValueOfSuit[writeRank - 1] =
          currentRank - writeRank;
      }

      maxScoresForEachStartingValueOfSuit[currentRank - 1] = 0;
      lastDead = currentRank;
    }
  }

  // If no value was dead, we did not write anything so far, so we can just return.
  if (lastDead === 0) {
    return {
      allMax: true,
      maxScoresForEachStartingValueOfSuit,
    };
  }

  if (lastDead !== 5) {
    // Here, we still need to write all "higher" values, adding the longest sequence starting at 1
    // to them.
    for (const writeRank of iRange(lastDead + 1, variant.stackSize)) {
      maxScoresForEachStartingValueOfSuit[writeRank - 1] = Math.min(
        maxScoresForEachStartingValueOfSuit[0]! +
          variant.stackSize +
          1 -
          writeRank,
        DEFAULT_CARD_RANKS.length,
      );
    }
  }

  return {
    allMax: false,
    maxScoresForEachStartingValueOfSuit,
  };
}

/**
 * This functions mimics `variantSudokuGetFreeStackStarts` from "variants_sudoku.go" in the server.
 */
function sudokuGetUnusedStackStartRanks(
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): readonly Rank[] {
  return variant.ranks.filter((rank) => !playStackStarts.includes(rank));
}

type FiveStackIndex = 0 | 1 | 2 | 3 | 4;

function incrementFiveStackIndex(i: FiveStackIndex): FiveStackIndex {
  const val = i + 1;
  assertFiveStackIndex(val);
  return val;
}

function decrementFiveStackIndex(i: FiveStackIndex): FiveStackIndex {
  const val = i - 1;
  assertFiveStackIndex(val);
  return val;
}

function assertFiveStackIndex(val: number): asserts val is FiveStackIndex {
  if (val < 0 || val > 4) {
    throw new TypeError(
      `A FiveStackIndex was ${val}, but it must be between 0 and 4.`,
    );
  }
}

/**
 * This is a more specialized version of `eRange` that only works with `FiveStackIndex`. (See the
 * documentation for the `eRange` function.)
 */
function* eRange5(
  start: FiveStackIndex,
  end: FiveStackIndex,
): Generator<FiveStackIndex> {
  let cur = start;
  while (cur < end) {
    yield cur;
    // Note this increment must be safe since start < end, so in particular, start + 1 is still at
    // most 4.
    cur = incrementFiveStackIndex(cur);
  }
}

function evaluateAssignment(
  curAssignment: Tuple<FiveStackIndex | undefined, 5>,
  unassignedSuits: readonly number[],
  possibleStackStarts: readonly number[],
  maxPartialScores: ReadonlyArray<readonly number[]>,
): {
  assignmentValue: number;
  assignment: number[];
} {
  let assignmentValue = 0;
  const assignment: number[] = [];

  for (const [
    assignedLocalSuitIndex,
    assignedStackStartIndex,
  ] of curAssignment.entries()) {
    // Note that since the 'curAssignment' always has length 5, but potentially we are dealing with
    // fewer suits, it is expected that this can be undefined (because we never assigned the other
    // suits), so we don't throw an error here but just stop the loop.
    if (assignedStackStartIndex === undefined) {
      continue;
    }

    const assignedSuit = unassignedSuits[assignedLocalSuitIndex];
    assertDefined(
      assignedSuit,
      `Unexpected assigned local suit index ${assignedLocalSuitIndex} encountered while evaluating assignment.`,
    );

    const assignedStackStart = possibleStackStarts[assignedStackStartIndex];

    assertDefined(
      assignedStackStart,
      "Failed to retrieve the stack start while solving the assignment problem since the index access was out of range.",
    );

    const maxPartialScoresForThisSuit = maxPartialScores[assignedSuit];
    assertDefined(
      maxPartialScoresForThisSuit,
      `Failed to retrieve the max partial scores for suit: ${assignedSuit}`,
    );

    // Note the '-1' here, since the array access starts at 0, while the assigned ranks start at 1.
    const value = maxPartialScoresForThisSuit[assignedStackStart - 1];
    assertDefined(
      value,
      `Failed to retrieve the max score for starting suit ${assignedSuit} at rank ${assignedStackStart}.`,
    );
    assignmentValue += value;
    assignment[assignedLocalSuitIndex] = value;
  }

  return { assignmentValue, assignment };
}

/**
 * Whether the assignment is better than the previously known best, i.e. has a higher maximum score
 * or has the same score, but is lexicographically smaller.
 *
 * @param assignmentValue Value of new assignment.
 * @param assignmentSorted New assignment, sorted in ascending order.
 * @param bestAssignmentSum Value of the currently best-known assignment.
 * @param bestAssignmentSorted Currently best-known assignment, sorted in ascending order.
 */
function isAssignmentBetter(
  assignmentValue: number,
  assignmentSorted: readonly number[],
  bestAssignmentSum: number,
  bestAssignmentSorted: readonly number[],
): boolean {
  if (
    assignmentValue > bestAssignmentSum ||
    bestAssignmentSorted.length === 0
  ) {
    return true;
  }

  if (assignmentValue === bestAssignmentSum) {
    // If the values are the same, we want to update if the assignment is lexicographically smaller.
    for (const [i, val] of assignmentSorted.entries()) {
      const valBestAssignment = bestAssignmentSorted[i];
      assertDefined(
        valBestAssignment,
        "Failed to retrieve the currently best stored assignment entry.",
      );
      if (val < valBestAssignment) {
        return true;
      }
    }
  }

  return false;
}

function findNextAssignment(
  curAssignedStackStartIndex: FiveStackIndex | undefined,
  possibleStackStarts: readonly number[],
  assignedStackStarts: Tuple<boolean, 5>,
): FiveStackIndex | undefined {
  if (curAssignedStackStartIndex !== 4) {
    // If the assignment was undefined before, we start at 0, otherwise start at the next value.
    const firstStackStartToTry =
      curAssignedStackStartIndex === undefined
        ? 0
        : incrementFiveStackIndex(curAssignedStackStartIndex);

    for (const nextAssignment of eRange5(
      firstStackStartToTry,
      possibleStackStarts.length as FiveStackIndex,
    )) {
      if (!assignedStackStarts[nextAssignment]) {
        return nextAssignment;
      }
    }
  }

  return undefined;
}

/**
 * This function mimics `variantSudokuGetMaxScore` from the "variants_sudoku.go" file on the server.
 * See there for corresponding documentation on how the score is calculated. Additionally, since
 * here, we want to return the maximum score per stack (this is needed for endgame calculations,
 * since the distribution of playable cards to the stacks matters for how many clues we can get back
 * before the extra round starts), we will find an optimum solution (in terms of score) such that
 * the distribution of the played cards to the stacks is lexicographically minimal (after sorting
 * the values) as well, since this allows for the most amount of clues to be gotten back before the
 * extra-round.
 */
export function getMaxScorePerStack(
  deck: readonly CardState[],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): Tuple<number, NumSuits> {
  const independentPartOfMaxScore: number[] = [];
  const maxPartialScores: number[][] = [];
  const unassignedSuits: number[] = [];

  // Find the suits for which we need to solve the assignment problem.
  for (const [i, stackStart] of playStackStarts.entries()) {
    const suitIndex = i as SuitIndex;

    const allDiscardedSet = getAllDiscardedSet(variant, deck, suitIndex);
    const { allMax, maxScoresForEachStartingValueOfSuit } = sudokuWalkUpAll(
      allDiscardedSet,
      variant,
    );

    if (allMax) {
      independentPartOfMaxScore[suitIndex] = variant.stackSize;
      continue;
    }

    if (stackStart !== null) {
      const score = maxScoresForEachStartingValueOfSuit[stackStart - 1];
      assertDefined(
        score,
        `Failed to find the max score for the starting suit index ${suitIndex} at start: ${stackStart}`,
      );
      independentPartOfMaxScore[suitIndex] = score;
      continue;
    }

    maxPartialScores[suitIndex] = maxScoresForEachStartingValueOfSuit;
    unassignedSuits.push(suitIndex);
  }

  if (unassignedSuits.length === 0) {
    return independentPartOfMaxScore as Tuple<number, NumSuits>;
  }

  // Solve the assignment problem.
  const possibleStackStarts = sudokuGetUnusedStackStartRanks(
    playStackStarts,
    variant,
  );

  // Value of the best assignment found so far.
  let bestAssignmentSum = 0;

  // This denotes the actual values of the best assignment found.
  let bestAssignment: number[] = [];

  // Same, but sorted in ascending order.
  let bestAssignmentSorted: number[] = [];

  // This will denote a 'local' index and refers to the index in the unassignedSuits array. We will
  // therefore iterate this over 0, ..., unassignedSuits.length - 1.
  let localSuitIndex: FiveStackIndex = 0;

  // A map (unassignedSuits) -> (index in possibleStackStarts) that denotes the current assignment
  // of the stacks to their starting values. We use local suit indices to access into this.
  const curAssignment: Tuple<FiveStackIndex | undefined, 5> = [
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ];

  // A map (index of stackStart) -> bool, denoting wether some suit is currently assigned to this
  // stack start.
  const assigned: Tuple<boolean, 5> = [false, false, false, false, false];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
  while (true) {
    // The goal of each iteration is to increase the assignment of 'localSuitIndex' to the next free
    // stack start. (Specifically, the next number available and not yet assigned to some other
    // suit.)

    // Thus, we will first un-assign the current suit.
    const curAssignedStackStartIndex = curAssignment[localSuitIndex];
    if (curAssignedStackStartIndex !== undefined) {
      assigned[curAssignedStackStartIndex] = false;
    }

    const nextAssignment = findNextAssignment(
      curAssignedStackStartIndex,
      possibleStackStarts,
      assigned,
    );

    if (nextAssignment !== undefined) {
      // Update the assignment
      curAssignment[localSuitIndex] = nextAssignment;
      assigned[nextAssignment] = true;

      // If this was a full assignment, we need to check whether it was better.
      if (localSuitIndex === unassignedSuits.length - 1) {
        const { assignmentValue, assignment } = evaluateAssignment(
          curAssignment,
          unassignedSuits,
          possibleStackStarts,
          maxPartialScores,
        );

        const assignmentSorted = [...assignment];
        assignmentSorted.sort((a, b) => a - b);

        if (
          isAssignmentBetter(
            assignmentValue,
            assignmentSorted,
            bestAssignmentSum,
            bestAssignmentSorted,
          )
        ) {
          bestAssignmentSum = assignmentValue;
          bestAssignment = assignment;
          bestAssignmentSorted = assignmentSorted;
        }
      }

      if (localSuitIndex < unassignedSuits.length - 1) {
        // Reset all assignment of the higher-indexed suits.
        for (const higherLocalSuitIndex of eRange5(
          incrementFiveStackIndex(localSuitIndex),
          unassignedSuits.length as FiveStackIndex,
        )) {
          const assignment = curAssignment[higherLocalSuitIndex];
          if (assignment !== undefined) {
            assigned[assignment] = false;
          }
          curAssignment[higherLocalSuitIndex] = undefined;
        }
        localSuitIndex = incrementFiveStackIndex(localSuitIndex);
      }
    } else if (localSuitIndex > 0) {
      localSuitIndex = decrementFiveStackIndex(localSuitIndex);
    } else {
      break;
    }
  }

  // Now, we just need to put the found assignment together with the independent parts found
  // already.
  const maxScorePerStack = independentPartOfMaxScore;
  for (const [
    unassignedLocalSuitIndex,
    unassignedSuit,
  ] of unassignedSuits.entries()) {
    // Note the "??" here, since it can be that there is actually no feasible assignment. In this
    // case, these values are still undefined at this point, so we replace them by 0.
    maxScorePerStack[unassignedSuit] =
      bestAssignment[unassignedLocalSuitIndex] ?? 0;
  }

  return maxScorePerStack as Tuple<number, NumSuits>;
}
