import {
  ClueType,
  getDefaultMetadata,
  getDefaultVariant,
} from "@hanabi-live/game";
import { describe, expect, jest, test } from "@jest/globals";
import type { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { checkLegal } from "./clues";

jest.mock("./UIGlobals", () => ({ globals: {} }));
jest.mock("./arrows", () => ({ hideAll: jest.fn(), set: jest.fn() }));
jest.mock("./turn", () => ({}));

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
    const setEnabled = jest.fn();
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
    expect(arrows.set).toHaveBeenCalledWith(
      0,
      card as unknown as HanabiCard,
      null,
      clue,
      true,
    );
  });
});
