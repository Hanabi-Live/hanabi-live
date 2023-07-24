import {DEFAULT_CARD_RANKS, DEFAULT_CLUE_RANKS, START_CARD_RANK, UNKNOWN_CARD_RANK, Variant} from "@hanabi/data";
import { CardState } from "../../types/CardState";
import * as deckRules from "../deck";
import * as playStacksRules from "../playStacks";
import * as variantRules from "../variant";
import { createAllDiscardedMap } from "./discardHelpers"
import {wrench} from "../../ui/HanabiCardInit";
import {stackStart} from "../playStacks";


/**
 * Assuming that we're dealing with a Sudoku variant, checks if the card still can be played
 * @param suitIndex
 * @param rank
 * @param deck
 * @param playStacks
 * @param playStackStarts
 * @param variant
 */
export function sudokuCanStillBePlayed(
    suitIndex: number,
    rank: number,
    deck: readonly CardState[],
    playStacks: ReadonlyArray<readonly number[]>,
    playStackStarts: readonly number[],
    variant: Variant
): boolean {
    if (!variantRules.isSudoku(variant)) {
        throw new Error("Sudoku function 'sudokuCanStillBePlayed' called for non-Sudoku variant");
    }
    const [_, maxScoresFromStarts] = sudokuWalkUpAll(createAllDiscardedMap(
        variant, deck, suitIndex
    ));
    let possibleStarts: number[];
    if (playStackStarts[suitIndex] != UNKNOWN_CARD_RANK) {
        possibleStarts = [playStackStarts[suitIndex]!]
    } else {
        possibleStarts = sudokuGetFreeStackStarts(playStackStarts);
    }
    for(const stackStart of possibleStarts) {
        // Here, we check if we can play the specified card if we start the stack at 'stackStart'
        // For this, note that we can compare the difference of our card and the start with the longest play sequence
        // starting at the start, thereby checking if the specified rank is included
        if(maxScoresFromStarts[stackStart-1]! > (rank - stackStart + 5) % 5) {
            return true;
        }
    }
    return false;
}

/**
 * For Sudoku variants, given a boolean map for which ranks (of the default ranks 1,...,5) are all discarded,
 * returns an array for these ranks of the longest play sequences starting at these maps (indexed 0,...,4),
 * and a boolean stating whether all ranks are still available, i.e. whether the returned array is [5,5,5,5,5]
 * @param allDiscardedMap
 *
 * This functions mimics the method sudokuWalkUpAll from the server file variants_sudoku.go
 */
function sudokuWalkUpAll(
    allDiscardedMap: Map<number, boolean>
): [boolean, Array<number>] {
    let maxScores = new Array<number>(5);
    let lastDead = 0
    for (const curRank of DEFAULT_CARD_RANKS) {
        if (allDiscardedMap.get(curRank)) {
           // We hit a new dead rank
           for (let writeRank = lastDead + 1; writeRank < curRank; writeRank++) {
               maxScores[writeRank -1] =  curRank - writeRank;
           }
           maxScores[curRank - 1] = 0;
           lastDead = curRank;
        }
    }
    // If no value was dead, we did not write anything so far, so we can just return
    if (lastDead == 0) {
        for(const curRank of DEFAULT_CARD_RANKS) {
            maxScores[curRank - 1] =  DEFAULT_CARD_RANKS.length;
        }
        return [true, maxScores];
    }
    // Here, we still need to write all 'higher' values, adding the longest sequence starting at 1 to them
    for (let writeRank = lastDead +1; writeRank <= 5; writeRank++) {
        maxScores[writeRank - 1] = Math.min(
            maxScores[0]! +  6 - writeRank,
            DEFAULT_CARD_RANKS.length
        );
    }
    return [false, maxScores];
}

/**
 * This functions mimics 'variantSudokuGetFreeStackStarts' from 'variants_sudoku.go' in the server
 * @param stackStarts
 */
function sudokuGetFreeStackStarts(
    stackStarts: readonly number[],
): number[] {
    let possibleStackStarts: number[] = [];
    for(const rank of DEFAULT_CARD_RANKS) {
        if (!stackStarts.includes(rank)) {
            possibleStackStarts.push(rank);
        }
    }
    return possibleStackStarts;
}

/**
 * This function mimics variantSudokuGetMaxScore from the 'variants_sudoku.go' file in the server
 * See there for corresponding documentation on how the score is calculated
 *
 * Additionally, since here, we want to return the maximum score *per Stack* (this is needed for endgame calculations,
 * since the distribution of playable cards to the stacks matters for how many clues we can get back before the extra
 * round starts), we will find an optimum solution (in terms of score) such that the distribution of the played cards
 * to the stacks is lexicographically minimal (after sorting the values) as well, since this allows for the most amount
 * of clues to be gotten back before the extra-round.
 *
 */
export function getMaxScorePerStack(
    deck: readonly CardState[],
    playStackStarts: readonly number[],
    variant: Variant
): number[] {
    let independentPartOfMaxScore =  new Array<number>(playStackStarts.length);
    let maxPartialScores = new Array<Array<number>>(5);
    let unassignedSuits: number[] = [];
    // Find the suits for which we need to solve the assignment problem
    playStackStarts.forEach( (stackStart, suitIndex) => {
        const [allMax, suitMaxScores] = sudokuWalkUpAll(createAllDiscardedMap(
            variant, deck, suitIndex
        ));
        if (allMax) {
            independentPartOfMaxScore[suitIndex] = 5;
            return;
        }
        if (stackStart != UNKNOWN_CARD_RANK) {
            independentPartOfMaxScore[suitIndex] = suitMaxScores[stackStart -1]!;
            return ;
        }
        maxPartialScores[suitIndex] =  suitMaxScores;
        unassignedSuits.push(suitIndex);
    });

    if (unassignedSuits.length == 0) {
        return independentPartOfMaxScore;
    }

    // Solve the assignment problem
    const unassigned = -1;

    const possibleStackStarts = sudokuGetFreeStackStarts(playStackStarts);

    // Value of the best assignment found so far
    let bestAssignmentSum = 0;
    // This denotes the actual values of the best assignment found
    let bestAssignment = new Array<number>(unassignedSuits.length);
    // Same, but sorted in ascending order
    let bestAssignmentSorted = new Array<number>(unassignedSuits.length);

    let localSuitIndex = 0;
    let curAssignment = new Array<number>(unassignedSuits.length);
    for (let i = 0; i < curAssignment.length; i++) {
        curAssignment[i] = unassigned;
    }
    let assigned = new Array<boolean>(possibleStackStarts.length);

    while (localSuitIndex >= 0) {
        if (curAssignment[localSuitIndex] != unassigned) {
            assigned[curAssignment[localSuitIndex]!] = false;
        }
        let couldIncrement = false;
        for (let nextAssignment = curAssignment[localSuitIndex]! + 1; nextAssignment < possibleStackStarts.length; nextAssignment++) {
            if (!assigned[nextAssignment]!) {
                curAssignment[localSuitIndex] = nextAssignment;
                assigned[nextAssignment] = true;
                couldIncrement = true;
                break;
            }
        }
        if (couldIncrement) {
            if (localSuitIndex == unassignedSuits.length - 1) {
                // evaluate the current assignment
                let assignment_val = 0;
                let assignment = new Array<number>(unassignedSuits.length);
                curAssignment.forEach( (assignedStackStartIndex, assignedLocalSuitIndex) => {
                    let value= maxPartialScores[unassignedSuits[assignedLocalSuitIndex]!]![possibleStackStarts[assignedStackStartIndex]! -1]!;
                    assignment_val += value;
                    assignment[assignedLocalSuitIndex] = value;
                });
                let assignmentSorted = assignment.slice(0);
                assignmentSorted.sort();
                // Check if we need to update the best assignment
                if (assignment_val > bestAssignmentSum) {
                    bestAssignmentSum = assignment_val;
                    bestAssignment = assignment;
                    bestAssignmentSorted = assignmentSorted
                } else if (assignment_val == bestAssignmentSum) {
                    // If the values are the same, we want to update if the assignment is lexicographically smaller
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
                // reset all assignment of the higher-indexed suits
                for (let higherLocalSuitIndex = localSuitIndex + 1; higherLocalSuitIndex < unassignedSuits.length; higherLocalSuitIndex++) {
                    if (curAssignment[higherLocalSuitIndex]! != unassigned) {
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

    // Now, we just need to put the found assignment together with the independent parts found already
    let maxScorePerStack = independentPartOfMaxScore;
    unassignedSuits.forEach((unassignedSuit, localSuitIndex) => {
        // Note the ?? here, since it can be that there is actually no feasible assignment, in which case these values
        // are still undefined at this point, so we replace them by 0.
        maxScorePerStack[unassignedSuit] = bestAssignment[localSuitIndex] ?? 0;
    });

    return maxScorePerStack;
}
