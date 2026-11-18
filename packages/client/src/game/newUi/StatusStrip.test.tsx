// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../modals.ts", () => ({
  isModalVisible: () => false,
}));
const { StatusStrip } = await import("./StatusStrip.tsx");

/** A stand-in for jsdom, which has no layout. So nothing changes size. */
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

function renderStrip(score: number, maxScore: number) {
  return render(
    <StatusStrip
      chatButton={undefined}
      clueLog={undefined}
      colorblindMode={false}
      efficiencyModified={false}
      efficiencyStats={{
        cardsGotten: 0,
        cardsGottenByNotes: undefined,
        modifier: undefined,
        modified: false,
        potentialCluesLost: 0,
        currentEfficiency: undefined,
        cardsNotGotten: 0,
        cluesStillUsableNotRounded: undefined,
        futureEfficiency: undefined,
        spareClues: undefined,
      }}
      futureEfficiency="-"
      gameInfoTooltip=""
      hardVariant={false}
      lastTurn={undefined}
      lowScorePhase={false}
      maxScore={maxScore}
      minEfficiency="1.00"
      mode={undefined}
      onEfficiencyClick={vi.fn<() => void>()}
      onFooter={vi.fn<(element: HTMLElement | null) => void>()}
      onLobby={vi.fn<() => void>()}
      onTurnClick={vi.fn<() => void>()}
      pace="-"
      paceColor={undefined}
      panel={false}
      phoneLayout={false}
      reducedMotion={false}
      replayControls={undefined}
      replayToggle={undefined}
      score={score}
      scoreLabel="Score"
      tableMenu={undefined}
      turn={1}
      turnTooltip=""
      variantName="No Variant"
      viewAsMenu={undefined}
    />,
  );
}

describe("StatusStrip", () => {
  // The invisible "10 / 30" that holds the score's space has its own maximum. The drop of the
  // maximum score once covered that copy instead of the maximum on the screen, so that the old and
  // the new maximum overlapped.
  test("the animations find the maximum score on the screen", () => {
    const { container } = renderStrip(0, 29);
    const maxScores = container.querySelectorAll(
      ":scope [data-score] [data-out-of-max]",
    );
    expect(maxScores).toHaveLength(1);
    expect(maxScores[0]?.closest("[aria-hidden]")).toBeNull();
    expect(maxScores[0]?.textContent).toBe("/ 29");
  });
});
