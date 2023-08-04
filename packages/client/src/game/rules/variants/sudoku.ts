import { DEFAULT_CARD_RANKS, UNKNOWN_CARD_RANK, Variant } from "@hanabi/data";
import { CardState } from "../../types/CardState";
import { createAllDiscardedMap } from "./discardHelpers";
import { initArray } from "packages/client/src/utils";

// Assuming that we're dealing with a Sudoku variant, checks if the card still can be played.
export function sudokuCanStillBePlayed(
  suitIndex: number,
  rank: number,
  deck: readonly CardState[],
  playStackStarts: readonly number[],
  variant: Variant,
): boolean {
  const [_, maxScoresFromStarts] = sudokuWalkUpAll(
    createAllDiscardedMap(variant, deck, suitIndex),
  );

  const possibleStarts =
    playStackStarts[suitIndex] === UNKNOWN_CARD_RANK
      ? sudokuGetFreeStackStarts(playStackStarts)
      : [playStackStarts[suitIndex]!];

  for (const stackStart of possibleStarts) {
    // Here, we check if we can play the specified card if we start the stack at 'stackStart'. For
    // this, note that we can compare the difference of our card and the start with the longest play
    // sequence starting at the start, thereby checking if the specified rank is included.
    if (maxScoresFromStarts[stackStart - 1]! > (rank - stackStart + 5) % 5) {
      return true;
    }
  }

  return false;
}

// For Sudoku variants, given a boolean map for which ranks (of the default ranks 1,...,5) are all
// discarded, returns an array for these ranks of the longest play sequences starting at these maps
// (indexed 0,...,4), and a boolean stating whether all ranks are still available, i.e. whether the
// returned array is [5,5,5,5,5]. This functions mimics the method sudokuWalkUpAll from the server
// file variants_sudoku.go.
function sudokuWalkUpAll(
  allDiscardedMap: Map<number, boolean>,
): [boolean, number[]] {
  const maxScores: number[] = [5, 5, 5, 5, 5];
  let lastDead = 0;

  for (const curRank of DEFAULT_CARD_RANKS) {
    if (allDiscardedMap.get(curRank)!) {
      // We hit a new dead rank.
      for (let writeRank = lastDead + 1; writeRank < curRank; writeRank++) {
        maxScores[writeRank - 1] = curRank - writeRank;
      }
      maxScores[curRank - 1] = 0;
      lastDead = curRank;
    }
  }

  // If no value was dead, we did not write anything so far, so we can just return.
  if (lastDead === 0) {
    return [true, maxScores];
  }

  // Here, we still need to write all 'higher' values, adding the longest sequence starting at 1 to
  // them.
  for (let writeRank = lastDead + 1; writeRank <= 5; writeRank++) {
    maxScores[writeRank - 1] = Math.min(
      maxScores[0]! + 6 - writeRank,
      DEFAULT_CARD_RANKS.length,
    );
  }

  return [false, maxScores];
}

/**
 * This functions mimics 'variantSudokuGetFreeStackStarts' from 'variants_sudoku.go' in the server.
 */
function sudokuGetFreeStackStarts(stackStarts: readonly number[]): number[] {
  const possibleStackStarts: number[] = [];

  for (const rank of DEFAULT_CARD_RANKS) {
    if (!stackStarts.includes(rank)) {
      possibleStackStarts.push(rank);
    }
  }

  return possibleStackStarts;
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
  playStackStarts: readonly number[],
  variant: Variant,
): number[] {
  const independentPartOfMaxScore: number[] = [];
  const maxPartialScores: number[][] = initArray(5, []);
  const unassignedSuits: number[] = [];

  // Find the suits for which we need to solve the assignment problem.
  for (const [suitIndex, stackStart] of playStackStarts.entries()) {
    const [allMax, suitMaxScores] = sudokuWalkUpAll(
      createAllDiscardedMap(variant, deck, suitIndex),
    );

    if (allMax) {
      independentPartOfMaxScore[suitIndex] = 5;
      continue;
    }

    if (stackStart !== UNKNOWN_CARD_RANK) {
      independentPartOfMaxScore[suitIndex] = suitMaxScores[stackStart - 1]!;
      continue;
    }

    maxPartialScores[suitIndex] = suitMaxScores;
    unassignedSuits.push(suitIndex);
  }

  if (unassignedSuits.length === 0) {
    return independentPartOfMaxScore;
  }

  // Solve the assignment problem.
  const unassigned = -1;

  const possibleStackStarts = sudokuGetFreeStackStarts(playStackStarts);

  // Value of the best assignment found so far.
  let bestAssignmentSum = 0;

  // This denotes the actual values of the best assignment found.
  let bestAssignment: number[] = [];

  // Same, but sorted in ascending order.
  let bestAssignmentSorted: number[] = [];

  let localSuitIndex = 0;

  const curAssignment: number[] = [];
  for (let i = 0; i < curAssignment.length; i++) {
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
        assignmentSorted.sort((n1, n2) => n1 - n2);

        // Check if we need to update the best assignment.
        if (assignmentVal > bestAssignmentSum) {
          bestAssignmentSum = assignmentVal;
          bestAssignment = assignment;
          bestAssignmentSorted = assignmentSorted;
        } else if (assignmentVal === bestAssignmentSum) {
          // If the values are the same, we want to update if the assignment is lexicographically
          // smaller.
          for (let i = 0; i < assignmentSorted.length; i++) {
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
    // Note the '??' here, since it can be that there is actually no feasible assignment. In this
    // case, these values are still undefined at this point, so we replace them by 0.
    maxScorePerStack[unassignedSuit] =
      bestAssignment[unassignedLocalSuitIndex] ?? 0;
  }

  return maxScorePerStack;
}
