import { getDefaultMetadata, getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("./arrows", () => ({
  hideAll: vi.fn(),
  set: vi.fn(),
  isPotentialClueShown: vi.fn(),
}));
vi.mock("./turn", () => ({ end: vi.fn() }));
vi.mock("./cluePreview", () => ({ setPotentialClue: vi.fn(), hide: vi.fn() }));
vi.mock("./reactive/views/cluesView", () => ({}));
const { globals } = await import("./UIGlobals");
const arrows = await import("./arrows");
const cluePreview = await import("./cluePreview");
const turn = await import("./turn");
const { checkLegal, give } = await import("./clues");

describe("hypothetical clue matching", () => {
  test("uses the layout card rather than its first Konva child", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    const clue = { type: "rank", value: 1 } as const;
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
    expect(arrows.set).toHaveBeenCalledWith(0, card, undefined, clue, true);
  });
});

describe("giving a clue", () => {
  test("hides the clue preview before the clue is planned", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    const clue = { type: "rank", value: 1 } as const;
    Object.assign(globals, {
      metadata,
      variant,
      UIClickTime: 0,
      state: {
        ongoingGame: { turn: { currentPlayerIndex: 0 } },
        replay: { hypothetical: { ongoing: { clueTokens: 8 } } },
      },
      elements: {
        clueTargetButtonGroup2: {
          getPressed: () => ({ targetPlayerIndex: 1 }),
        },
        clueTypeButtonGroup: { getPressed: () => ({ clue }) },
        giveClueButton: { enabled: true },
      },
    });
    vi.mocked(turn.end).mockImplementation(() => {
      expect(cluePreview.hide).toHaveBeenCalled();
    });

    give();

    expect(turn.end).toHaveBeenCalledOnce();
  });
});
