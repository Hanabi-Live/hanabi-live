// @vitest-environment jsdom

import type { CardOrder, PlayerIndex, StateClue } from "@hanabi-live/game";
import { getDefaultVariant } from "@hanabi-live/game";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createStore } from "redux";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { State } from "../../types/State";
import { ClueLog } from "./ClueLog";

vi.mock("../replay", () => ({ goToSegment: vi.fn() }));
// The test environment has no canvas to measure text with.
vi.mock("../fitFontSize", () => ({
  fitFontSize: (_text: string, _fontFamily: string, maxFontSize: number) =>
    maxFontSize,
}));
const { goToSegment } = await import("../replay");

/** At this stage height, the log fits 27 entries. */
const STAGE_HEIGHT = 900;
const MAX_ENTRIES = 27;

function clue(
  segment: number,
  list: readonly number[],
  negativeList: readonly number[],
): StateClue {
  return {
    type: "rank",
    value: 1,
    giver: 0 as PlayerIndex,
    target: 1 as PlayerIndex,
    segment,
    list: list as readonly CardOrder[],
    negativeList: negativeList as readonly CardOrder[],
  };
}

function renderLog(
  clues: readonly StateClue[],
  options: { hoveredCardOrder?: number; colorblindMode?: boolean } = {},
) {
  const state = {
    visibleState: { clues },
    metadata: {
      playerNames: ["Alice", "Bob"],
      characterAssignments: [undefined, undefined],
    },
  } as unknown as State;
  render(
    <Provider store={createStore(() => state)}>
      <ClueLog
        colorblindMode={options.colorblindMode ?? false}
        hoveredCardOrder={(options.hoveredCardOrder ?? undefined) as CardOrder}
        stageHeight={STAGE_HEIGHT}
        stageWidth={1600}
        variant={getDefaultVariant()}
      />
    </Provider>,
  );
}

function entries(): readonly HTMLElement[] {
  return screen.getAllByText("Alice").map((name) => name.parentElement!);
}

afterEach(() => {
  cleanup();
});

describe("ClueLog", () => {
  test("shows only the latest clues that fit", () => {
    const clues = Array.from({ length: MAX_ENTRIES + 3 }, (_, i) =>
      clue(i, [], []),
    );
    renderLog(clues);

    expect(entries()).toHaveLength(MAX_ENTRIES);
    fireEvent.click(entries()[0]!);
    expect(goToSegment).toHaveBeenCalledWith(4, true);
  });

  test("highlights the clues that touched or missed the card under the mouse", () => {
    renderLog([clue(0, [5], []), clue(1, [], [5]), clue(2, [], [])], {
      hoveredCardOrder: 5,
      colorblindMode: true,
    });

    const [touched, missed, unrelated] = entries();
    expect(touched!.style.backgroundColor).toBe("rgba(255, 255, 255, 0.4)");
    expect(missed!.style.backgroundColor).toBe("rgba(255, 119, 119, 0.4)");
    expect(unrelated!.style.backgroundColor).toBe("rgba(255, 255, 255, 0.1)");
    // Colorblind players also see a cross on the clue that missed.
    // eslint-disable-next-line complete/require-ascii
    expect(screen.getByText("✘").parentElement).toBe(missed);
  });
});
