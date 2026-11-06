import { ClueType, getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, mock, test } from "bun:test";
import type Konva from "konva";

import type { Arrow } from "./controls/Arrow";

await mock.module("./UIGlobals", () => ({ globals: {} }));
await mock.module("./HanabiCard", () => ({ HanabiCard: Date }));
await mock.module("./CardLayout", () => ({ CardLayout: Date }));
await mock.module("./controls/StrikeSquare", () => ({ StrikeSquare: Date }));
await mock.module("./getCardOrStackBase", () => ({
  getCardOrStackBase: mock(),
}));
await mock.module("./konvaHelpers", () => ({}));
await mock.module("./drawPip", () => ({ drawPip: mock() }));
await mock.module("../../tooltips", () => ({}));
const { globals } = await import("./UIGlobals");
const { set } = await import("./arrows");

describe("clue arrow suit pips", () => {
  test("clears a reused color pip for a Quacker clue and a highlight", () => {
    let pipVisible = false;
    const suitPip = {
      sceneFunc: mock(),
      show: mock(() => {
        pipVisible = true;
      }),
      hide: mock(() => {
        pipVisible = false;
      }),
    };
    const arrow = {
      pointingTo: null,
      tween: null,
      show: mock(),
      moveToTop: mock(),
      rotation: mock(),
      text: {
        rotation: mock(),
        hide: mock(),
        show: mock(),
        text: mock(),
      },
      circle: {
        hide: mock(),
        show: mock(),
        stroke: mock(),
        fill: mock(),
      },
      base: {
        stroke: mock(),
        fill: mock(),
      },
      suitPip,
      setAbsolutePosition: mock(),
    } as unknown as Arrow;
    const deck = {
      getAbsolutePosition: () => ({ x: 10, y: 20 }),
      width: () => 100,
      height: () => 50,
    } as unknown as Konva.Node;
    const variant = getDefaultVariant();
    Object.assign(globals, {
      elements: { arrows: [arrow], deck },
      layers: { arrow: { batchDraw: mock() } },
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
