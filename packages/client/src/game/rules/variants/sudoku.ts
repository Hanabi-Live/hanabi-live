import type { NumSuits, Rank, SuitIndex, Variant } from "@hanabi/data";
import {
  DEFAULT_CARD_RANKS,
  DEFAULT_FINISHED_STACK_LENGTH,
} from "@hanabi/data";
import type { Tuple } from "@hanabi/utils";
import { assertDefined, eRange, iRange, newArray } from "@hanabi/utils";
import type { CardState } from "../../types/CardState";
import type { GameState } from "../../types/GameState";
import { getAllDiscardedSet } from "./discardHelpers";

const NUM_SUITS_SUDOKU = 5;

/** Check if the card can still be played in a Sudoku variant. */
export function sudokuCanStillBePlayed(
  suitIndex: SuitIndex,
  rank: Rank,
  deck: readonly CardState[],
  playStackStarts: GameState["playStackStarts"],
  variant: Variant,
): boolean {
  const allDiscardedSet = getAllDiscardedSet(variant, deck, suitIndex);
  const { maxScoresForEachStartingValueOfSuit } = sudokuWalkUpAll(allDiscardedSet);

  const playStackStart = playStackStarts[suitIndex];
  assertDefined(
    playStackStart,
    `Failed to find the play stack start for suit index: ${suitIndex}`,
  );

  const possibleStackStartRanks =
    playStackStart === null
      ? sudokuGetUnusedStackStartRanks(playStackStarts)
      : [playStackStart];

  // Here, we check if we can play the specified card if we start the stack at `playStackStart`. For
  // this, note that we can compare the difference of our card and the start with the longest play
  // sequence starting at the start, thereby checking if the specified rank is included.
  return possibleStackStartRanks.some((possibleStackStartRank) => {
    const longestSequence =
      (rank - possibleStackStartRank + DEFAULT_FINISHED_STACK_LENGTH) %
      DEFAULT_FINISHED_STACK_LENGTH;
    return maxScoresForEachStartingValueOfSuit[possibleStackStartRank - 1]! > longestSequence;
  });
}

/**
 * For Sudoku variants, given a boolean map for which ranks [1, 2, 3, 4, 5] are all discarded,
 * returns an array for these ranks of the longest play sequences starting at these maps (indexed 0
 * through 4), and a boolean stating whether all ranks are still available, i.e. whether the
 * returned array is [5, 5, 5, 5, 5]. This functions mimics the method `sudokuWalkUpAll` from the
 * server file "variants_sudoku.go".
 */
function sudokuWalkUpAll(allDiscardedSet: Set<Rank>): {
  allMax: boolean;
  maxScoresForEachStartingValueOfSuit: Tuple<number, NumSuits>;
} {
  const maxScoresForEachStartingValueOfSuit = newArray(
    NUM_SUITS_SUDOKU,
    DEFAULT_FINISHED_STACK_LENGTH,
  ) as Tuple<number, NumSuits>;
  let lastDead = 0;

  for (const currentRank of DEFAULT_CARD_RANKS) {
    if (allDiscardedSet.has(currentRank)) {
      // We hit a new dead rank.
      for (const writeRank of eRange(lastDead + 1, currentRank)) {
        maxScoresForEachStartingValueOfSuit[writeRank - 1] = currentRank - writeRank;
      }

      maxScoresForEachStartingValueOfSuit[currentRank - 1] = 0;
      lastDead = currentRank;
    }
  }

  // If no value was dead, we did not write anything so far, so we can just return.
  if (lastDead === 0) {
    return {
      allMax: true,
      maxScoresForEachStartingValueOfSuit: maxScoresForEachStartingValueOfSuit,
    };
  }

  // Here, we still need to write all "higher" values, adding the longest sequence starting at 1 to
  // them.
  for (const writeRank of iRange(lastDead + 1, 5)) {
    maxScoresForEachStartingValueOfSuit[writeRank - 1] = Math.min(
      maxScoresForEachStartingValueOfSuit[0]! + 6 - writeRank,
      DEFAULT_CARD_RANKS.length,
    );
  }

  return {
    allMax: false,
    maxScoresForEachStartingValueOfSuit: maxScoresForEachStartingValueOfSuit,
  };
}

/**
 * This functions mimics `variantSudokuGetFreeStackStarts` from "variants_sudoku.go" in the server.
 */
function sudokuGetUnusedStackStartRanks(
  playStackStarts: GameState["playStackStarts"],
): Rank[] {
  return DEFAULT_CARD_RANKS.filter((rank) => !playStackStarts.includes(rank));
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
    const { allMax, maxScoresForEachStartingValueOfSuit } = sudokuWalkUpAll(allDiscardedSet);

    if (allMax) {
      independentPartOfMaxScore[suitIndex] = DEFAULT_FINISHED_STACK_LENGTH;
      continue;
    }

    if (stackStart !== null) {
      independentPartOfMaxScore[suitIndex] = maxScoresForEachStartingValueOfSuit[stackStart - 1]!;
      continue;
    }

    maxPartialScores[suitIndex] = maxScoresForEachStartingValueOfSuit;
    unassignedSuits.push(suitIndex);
  }

  if (unassignedSuits.length === 0) {
    return independentPartOfMaxScore as Tuple<number, NumSuits>;
  }

  // Solve the assignment problem.
  const unassigned = -1;

  const possibleStackStarts = sudokuGetUnusedStackStartRanks(playStackStarts);

  // Value of the best assignment found so far.
  let bestAssignmentSum = 0;

  // This denotes the actual values of the best assignment found.
  let bestAssignment: number[] = [];

  // Same, but sorted in ascending order.
  let bestAssignmentSorted: number[] = [];

  let localSuitIndex = 0;

  const curAssignment: number[] = [];
  for (const i of eRange(curAssignment.length)) {
    curAssignment[i] = unassigned;
  }
  const assigned: boolean[] = [];

  while (localSuitIndex >= 0) {
    if (curAssignment[localSuitIndex] !== unassigned) {
      assigned[curAssignment[localSuitIndex]!] = false;
    }

    let couldIncrement = false;
    for (
      let nextAssignment = curAssignment[localSuitIndex]! + 1;
      nextAssignment < possibleStackStarts.length;
      nextAssignment++
    ) {
      if (!assigned[nextAssignment]!) {
        curAssignment[localSuitIndex] = nextAssignment;
        assigned[nextAssignment] = true;
        couldIncrement = true;
        break;
      }
    }

    if (couldIncrement) {
      if (localSuitIndex === unassignedSuits.length - 1) {
        // Evaluate the current assignment.
        let assignmentVal = 0;
        const assignment: number[] = [];
        for (const [
          assignedLocalSuitIndex,
          assignedStackStartIndex,
        ] of curAssignment.entries()) {
          const value =
            maxPartialScores[unassignedSuits[assignedLocalSuitIndex]!]![
              possibleStackStarts[assignedStackStartIndex]! - 1
            ]!;
          assignmentVal += value;
          assignment[assignedLocalSuitIndex] = value;
        }

        const assignmentSorted = [...assignment];
        assignmentSorted.sort((a, b) => a - b);

        // Check if we need to update the best assignment.
        if (assignmentVal > bestAssignmentSum) {
          bestAssignmentSum = assignmentVal;
          bestAssignment = assignment;
          bestAssignmentSorted = assignmentSorted;
        } else if (assignmentVal === bestAssignmentSum) {
          // If the values are the same, we want to update if the assignment is lexicographically
          // smaller.
          for (const i of eRange(assignmentSorted.length)) {
            if (assignmentSorted[i]! < bestAssignmentSorted[i]!) {
              bestAssignment = assignment;
              bestAssignmentSorted = assignmentSorted;
              break;
            }
          }
        }
      }

      if (localSuitIndex < unassignedSuits.length - 1) {
        // Reset all assignment of the higher-indexed suits.
        for (
          let higherLocalSuitIndex = localSuitIndex + 1;
          higherLocalSuitIndex < unassignedSuits.length;
          higherLocalSuitIndex++
        ) {
          if (curAssignment[higherLocalSuitIndex]! !== unassigned) {
            assigned[curAssignment[higherLocalSuitIndex]!] = false;
          }
          curAssignment[higherLocalSuitIndex] = unassigned;
        }
        localSuitIndex++;
      }
    } else {
      localSuitIndex--;
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
