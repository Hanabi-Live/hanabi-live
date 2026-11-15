import type { CardOrder, Rank, SuitIndex } from "@hanabi-live/game";
import { StackDirection, getVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { getStackDirectionLabel, getSudokuStackLabels } from "./stackLabels.ts";

describe("getStackDirectionLabel", () => {
  test("names the direction of every stack in Up or Down", () => {
    const variant = getVariant("Up or Down (5 Suits)");
    const suitIndex = 0 as SuitIndex;
    expect(
      getStackDirectionLabel(variant, suitIndex, StackDirection.Undecided),
    ).toBe("");
    expect(getStackDirectionLabel(variant, suitIndex, StackDirection.Up)).toBe(
      "Up",
    );
    expect(
      getStackDirectionLabel(variant, suitIndex, StackDirection.Down),
    ).toBe("Down");
    expect(
      getStackDirectionLabel(variant, suitIndex, StackDirection.Finished),
    ).toBe("Finished");
  });

  test("labels only the reversed suit", () => {
    const variant = getVariant("Reversed (5 Suits)");
    const reversed = variant.suits.findIndex((suit) => suit.reversed);
    const normal = variant.suits.findIndex((suit) => !suit.reversed);
    expect(
      getStackDirectionLabel(
        variant,
        reversed as SuitIndex,
        StackDirection.Down,
      ),
    ).toBe("Reversed");
    expect(
      getStackDirectionLabel(variant, normal as SuitIndex, StackDirection.Up),
    ).toBe("");
  });
});

describe("getSudokuStackLabels", () => {
  const variant = getVariant("Sudoku (5 Suits)");

  test("lists the starts that are still free", () => {
    const stacks: CardOrder[][] = [[], [], [], [], []];
    const starts: Array<Rank | undefined> = [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ];
    expect(getSudokuStackLabels(variant, stacks, starts)[0]).toBe(
      "Start: [Any]",
    );

    stacks[1] = [10, 11, 12] as CardOrder[];
    starts[1] = 3;
    stacks[2] = [20] as CardOrder[];
    starts[2] = 1;
    expect(getSudokuStackLabels(variant, stacks, starts)).toStrictEqual([
      "Start: [245]",
      "[ 3 4 5 _ _ ]",
      "[ 1 _ _ _ _ ]",
      "Start: [245]",
      "Start: [245]",
    ]);
  });

  test("wraps the ranks around and finishes a full stack", () => {
    const stacks = [[1, 2, 3, 4], [5, 6, 7, 8, 9], [], [], []] as CardOrder[][];
    const starts: Array<Rank | undefined> = [
      4,
      2,
      undefined,
      undefined,
      undefined,
    ];
    const labels = getSudokuStackLabels(variant, stacks, starts);
    expect(labels[0]).toBe("[ 4 5 1 2 _ ]");
    expect(labels[1]).toBe("Finished");
  });
});
