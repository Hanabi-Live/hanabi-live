import { ClueType, getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, jest, test } from "@jest/globals";
import type Konva from "konva";
import { globals } from "./UIGlobals";
import { set } from "./arrows";
import type { Arrow } from "./controls/Arrow";

jest.mock("./UIGlobals", () => ({ globals: {} }));
jest.mock("./HanabiCard", () => ({ HanabiCard: Date }));
jest.mock("./CardLayout", () => ({ CardLayout: Date }));
jest.mock("./controls/StrikeSquare", () => ({ StrikeSquare: Date }));
jest.mock("./getCardOrStackBase", () => ({}));
jest.mock("./konvaHelpers", () => ({}));
jest.mock("./drawPip", () => ({}));
jest.mock("../../tooltips", () => ({}));

describe("clue arrow suit pips", () => {
  test("clears a reused color pip for a Quacker clue and a highlight", () => {
    let pipVisible = false;
    const suitPip = {
      sceneFunc: jest.fn(),
      show: jest.fn(() => {
        pipVisible = true;
      }),
      hide: jest.fn(() => {
        pipVisible = false;
      }),
    };
    const arrow = {
      pointingTo: null,
      tween: null,
      show: jest.fn(),
      moveToTop: jest.fn(),
      rotation: jest.fn(),
      text: {
        rotation: jest.fn(),
        hide: jest.fn(),
        show: jest.fn(),
        text: jest.fn(),
      },
      circle: {
        hide: jest.fn(),
        show: jest.fn(),
        stroke: jest.fn(),
        fill: jest.fn(),
      },
      base: {
        stroke: jest.fn(),
        fill: jest.fn(),
      },
      suitPip,
      setAbsolutePosition: jest.fn(),
    } as unknown as Arrow;
    const deck = {
      getAbsolutePosition: () => ({ x: 10, y: 20 }),
      width: () => 100,
      height: () => 50,
    } as unknown as Konva.Node;
    const variant = getDefaultVariant();
    Object.assign(globals, {
      elements: { arrows: [arrow], deck },
      layers: { arrow: { batchDraw: jest.fn() } },
      lobby: { settings: { colorblindMode: true } },
      // Character ID 34 is Quacker; player 1 has no character.
      metadata: { characterAssignments: [34, null] },
      variant,
      state: { finished: false },
      animateFast: false,
      isResizing: false,
    });

    const clue = {
      type: ClueType.Color,
      value: variant.clueColors[0]!,
    } as const;
    set(0, deck, 1, clue, false, true);
    expect(pipVisible).toBe(true);

    // Reuse exactly the same arrow for a Quacker clue.
    set(0, deck, 0, clue, false, true);
    expect(pipVisible).toBe(false);

    // Regular clues still render their suit pip when appropriate.
    set(0, deck, 1, clue, false, true);
    expect(pipVisible).toBe(true);

    // Non-clue highlight arrows must not inherit the pip either.
    set(0, deck, null, null, false, true);
    expect(pipVisible).toBe(false);
  });
});
