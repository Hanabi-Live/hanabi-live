import {DEFAULT_CARD_RANKS, START_CARD_RANK, UNKNOWN_CARD_RANK, Variant} from "@hanabi/data";
import { CardState } from "../../types/CardState";
import { StackDirection } from "../../types/StackDirection";
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
        if(maxScoresFromStarts.get(suitIndex)! > (rank - playStackStarts[suitIndex]! + 5) % 5) {
            return true;
        }
    }
    return false;
}

/**
 * For Sudoku variants, given a boolean map for which ranks (of the default ranks 1,...,5) are all discarded,
 * returns a map for these ranks of the longest play sequences starting at these maps,
 * and a boolean stating whether all ranks are still available, i.e. whether the returned array is [5,5,5,5,5]
 * @param allDiscardedMap
 */
function sudokuWalkUpAll(
    allDiscardedMap: Map<number, boolean>
): [boolean, Map<number, number>] {
    let maxScores = new Map<number, number>();
    let lastDead = 0
    for (const curRank of DEFAULT_CARD_RANKS) {
        if (allDiscardedMap.get(curRank)) {
           // We hit a new dead rank
           for (let writeRank = lastDead + 1; writeRank < curRank; writeRank) {
               maxScores.set(writeRank, curRank - lastDead - 1);
           }
           maxScores.set(curRank, 0);
           lastDead = curRank;
        }
    }
    // If no value was dead, we did not write anything so far, so we can just return
    if (lastDead == 0) {
        for(const curRank of DEFAULT_CARD_RANKS) {
            maxScores.set(curRank, DEFAULT_CARD_RANKS.length);
        }
        return [true, maxScores];
    }
    // Here, we still need to write all 'higher' values, adding the longest sequence starting at 1 to them
    for (let writeRank = lastDead +1; writeRank <= 5; writeRank++) {
        maxScores.set(writeRank, Math.min(
            maxScores.get(1)! - writeRank + 1,
            DEFAULT_CARD_RANKS.length
        ));
    }
    return [false, maxScores];
}

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