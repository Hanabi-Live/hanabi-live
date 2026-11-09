import {
  ClueType,
  getDefaultMetadata,
  getDefaultVariant,
} from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("./arrows", () => ({
  hideAll: vi.fn(),
  set: vi.fn(),
  isPotentialClueShown: vi.fn(),
}));
vi.mock("./turn", () => ({}));
vi.mock("./cluePreview", () => ({ setPotentialClue: vi.fn() }));
vi.mock("./reactive/views/cluesView", () => ({}));
const { globals } = await import("./UIGlobals");
const arrows = await import("./arrows");
const { checkLegal } = await import("./clues");

describe("hypothetical clue matching", () => {
  test("uses the layout card rather than its first Konva child", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    const clue = { type: ClueType.Rank, value: 1 } as const;
    const card = {
      state: { order: 0 },
      getMorphedPossibilities: () => [[0, 1]],
      visibleRank: 1,
      visibleSuitIndex: 0,
    };
    const setEnabled = vi.fn();
    Object.assign(globals, {
      metadata,
      variant,
      options: metadata.options,
      state: {
        replay: { hypothetical: {} },
        visibleState: { turn: { currentPlayerIndex: 0 } },
      },
      elements: {
        clueTargetButtonGroup2: {
          getPressed: () => ({ targetPlayerIndex: 1 }),
        },
        clueTypeButtonGroup: { getPressed: () => ({ clue }) },
        giveClueButton: { setEnabled },
        playerHands: [
          { children: [] },
          { children: [{ card, children: [{}] }] },
        ],
      },
    });

    checkLegal();

    expect(setEnabled).toHaveBeenCalledWith(true);
    expect(arrows.set).toHaveBeenCalledWith(0, card, null, clue, true);
  });
});
