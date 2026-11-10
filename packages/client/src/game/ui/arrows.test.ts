import { getDefaultVariant } from "@hanabi-live/game";
import type Konva from "konva";
import { describe, expect, test, vi } from "vitest";

import type { Arrow } from "./controls/Arrow";

vi.mock("./UIGlobals", () => ({ globals: {} }));
vi.mock("./HanabiCard", () => ({ HanabiCard: Date }));
vi.mock("./CardLayout", () => ({ CardLayout: Date }));
vi.mock("./controls/StrikeSquare", () => ({ StrikeSquare: Date }));
vi.mock("./getCardOrStackBase", () => ({
  getCardOrStackBase: vi.fn(),
}));
vi.mock("./konvaHelpers", () => ({}));
vi.mock("./drawPip", () => ({ drawPip: vi.fn() }));
vi.mock("../../tooltips", () => ({}));
const { globals } = await import("./UIGlobals");
const { set } = await import("./arrows");

describe("clue arrow suit pips", () => {
  test("clears a reused color pip for a Quacker clue and a highlight", () => {
    let pipVisible = false;
    const suitPip = {
      sceneFunc: vi.fn(),
      show: vi.fn(() => {
        pipVisible = true;
      }),
      hide: vi.fn(() => {
        pipVisible = false;
      }),
    };
    const arrow = {
      pointingTo: undefined,
      tween: undefined,
      show: vi.fn(),
      moveToTop: vi.fn(),
      rotation: vi.fn(),
      text: {
        rotation: vi.fn(),
        hide: vi.fn(),
        show: vi.fn(),
        text: vi.fn(),
      },
      circle: {
        hide: vi.fn(),
        show: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
      },
      base: {
        stroke: vi.fn(),
        fill: vi.fn(),
      },
      suitPip,
      setAbsolutePosition: vi.fn(),
    } as unknown as Arrow;
    const deck = {
      getAbsolutePosition: () => ({ x: 10, y: 20 }),
      width: () => 100,
      height: () => 50,
    } as unknown as Konva.Node;
    const variant = getDefaultVariant();
    Object.assign(globals, {
      elements: { arrows: [arrow], deck },
      layers: { arrow: { batchDraw: vi.fn() } },
      lobby: { settings: { colorblindMode: true } },
      // Character ID 34 is Quacker; player 1 has no character.
      metadata: { characterAssignments: [34, undefined] },
      variant,
      state: { finished: false },
      animateFast: false,
      isResizing: false,
    });

    const clue = {
      type: "color",
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
    set(0, deck, undefined, undefined, false, true);
    expect(pipVisible).toBe(false);
  });
});
