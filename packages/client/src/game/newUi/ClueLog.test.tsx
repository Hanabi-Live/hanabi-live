// @vitest-environment jsdom

import type { CardOrder } from "@hanabi-live/game";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { ClueLogEntry } from "./ClueLog.tsx";
import { ClueLog } from "./ClueLog.tsx";

function entry(
  segment: number,
  touchedCards: readonly number[],
  missedCards: readonly number[],
): ClueLogEntry {
  return {
    segment,
    turn: segment + 1,
    giverName: "Alice",
    targetName: "Bob",
    clueName: "1",
    marker: { type: "rank", label: "1" },
    touchedCards: touchedCards as readonly CardOrder[],
    missedCards: missedCards as readonly CardOrder[],
  };
}

function renderLog(
  entries: readonly ClueLogEntry[],
  pressedCard: number | undefined,
) {
  render(
    <ClueLog
      entries={entries}
      onShowClue={onShowClue}
      pressedCard={pressedCard as CardOrder | undefined}
      shownSegment={undefined}
    />,
  );
}

/** The clue log ignores clicks in these tests. */
function onShowClue() {
  // Nothing to do.
}

function getTurns(): readonly string[] {
  return screen
    .getAllByRole("button")
    .map((button) => /#\d+/u.exec(button.textContent)?.[0] ?? "");
}

afterEach(() => {
  cleanup();
});

describe("ClueLog", () => {
  const entries = [entry(0, [1], [2]), entry(1, [3], [4]), entry(2, [2], [1])];

  test("shows every clue when no card is pressed", () => {
    renderLog(entries, undefined);
    expect(getTurns()).toEqual(["#1", "#2", "#3"]);
  });

  test("shows only the clues about the pressed card", () => {
    renderLog(entries, 2);
    expect(getTurns()).toEqual(["#1", "#3"]);
    const crosses = screen
      .getAllByRole("listitem")
      .map(
        (item) => within(item).queryByLabelText("did not touch it") !== null,
      );
    expect(crosses).toEqual([true, false]);
  });

  test("says when no clue is about the pressed card", () => {
    renderLog(entries, 5);
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.getByText("No clues about this card yet.")).not.toBe(null);
  });
});
