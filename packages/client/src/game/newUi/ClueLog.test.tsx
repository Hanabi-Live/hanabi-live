// @vitest-environment jsdom

import type { CardOrder } from "@hanabi-live/game";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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
    marker: {
      type: "rank",
      label: "1",
    },
    touchedCards: touchedCards as readonly CardOrder[],
    missedCards: missedCards as readonly CardOrder[],
  };
}

/** The card that the mouse is over in these tests. */
const HOVERED_CARD = 2 as CardOrder;

function renderLog(entries: readonly ClueLogEntry[], colorblindMode = false) {
  render(
    <ClueLog
      colorblindMode={colorblindMode}
      entries={entries}
      hoveredCard={HOVERED_CARD}
      onShowClue={onShowClue}
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

/** A stand-in for jsdom, which has no layout. So the names never need to be made smaller. */
class NoResizeObserver {
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ClueLog", () => {
  const entries = [entry(0, [1], [2]), entry(1, [3], [4]), entry(2, [2], [1])];

  test("marks the clues about the hovered card and keeps the others", () => {
    renderLog(entries);
    expect(getTurns()).toEqual(["#1", "#2", "#3"]);
    const labels = screen.getAllByRole("listitem").map((item) => {
      if (within(item).queryByLabelText(/did not touch it$/u) !== null) {
        return "missed";
      }
      return within(item).queryByLabelText(/touched it$/u) === null
        ? "none"
        : "touched";
    });
    expect(labels).toEqual(["missed", "none", "touched"]);
  });

  test("crosses the clues that missed the hovered card in colorblind mode", () => {
    renderLog(entries, true);
    const crossed = screen
      .getAllByRole("listitem")
      .map(
        (item) =>
          item
            .querySelector("[data-negative-marker]")
            ?.classList.contains("tw:invisible") === false,
      );
    expect(crossed).toEqual([true, false, false]);
  });
});
