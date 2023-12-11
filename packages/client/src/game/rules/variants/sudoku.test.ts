import { sudokuWalkUpAll } from "./sudoku";
import {Rank} from "@hanabi/data";

describe("WalkUpAll", () => {
    test("Handles single discarded 1", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([1]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([0,4,3,2,1]);
    });
    test("Handles single discarded 2", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([2]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([1,0,4,3,2]);
    });
    test("Handles single discarded 3", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([3]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([2,1,0,4,3]);
    });
    test("Handles single discarded 4", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([4]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([3,2,1,0,4]);
    });
    test("Handles single discarded 5", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([5]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([4,3,2,1,0]);
    });
    test("Handles discarded 2 and 5", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([2, 5]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([1,0,2,1,0]);
    });
    test("Handles discarded 1 and 4", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([1, 4]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([0,2,1,0,1]);
    });
    test("Handles discarded 1, 2, and 5", () => {
        const allDiscardedSet: Set<Rank> = new Set<Rank>([1, 2, 5]);
        const { allMax, maxScoresForEachStartingValueOfSuit } =  sudokuWalkUpAll(allDiscardedSet);
        expect(allMax).toBe(false);
        expect(maxScoresForEachStartingValueOfSuit).toStrictEqual([0,0,2,1,0]);
    });
});