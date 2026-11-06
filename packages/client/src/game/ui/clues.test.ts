import {
  ClueType,
  getDefaultMetadata,
  getDefaultVariant,
} from "@hanabi-live/game";
import { describe, expect, mock, test } from "bun:test";

await mock.module("./UIGlobals", () => ({ globals: {} }));
await mock.module("./arrows", () => ({ hideAll: mock(), set: mock() }));
await mock.module("./turn", () => ({}));
const { globals } = await import("./UIGlobals");
const arrows = await import("./arrows");
const { checkLegal } = await import("./clues");

describe("hypothetical clue matching", () => {
  test("uses the layout card rather than its first Konva child", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    const clue = { type: ClueType.Rank, value: 1 } as const;
    const card = {
      getMorphedPossibilities: () => [[0, 1]],
      visibleRank: 1,
      visibleSuitIndex: 0,
    };
    const setEnabled = mock();
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
