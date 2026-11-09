import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import { describe, expect, test, vi } from "vitest";
import { RankPip } from "./RankPip";

describe("RankPip", () => {
  test("draws the outline before the fill, so that the outline lies outside the digit", () => {
    // Konva draws each line of text through "fillStrokeShape".
    vi.spyOn(Konva.Text.prototype, "_sceneFunc").mockImplementation(
      function draw(this: Konva.Text, context: KonvaContext.Context) {
        context.fillStrokeShape(this);
      },
    );
    const calls: string[] = [];
    const prototype = {
      fillShape: () => {
        calls.push("fill");
      },
      strokeShape: () => {
        calls.push("stroke");
      },
      fillStrokeShape: () => {
        calls.push("fill then stroke");
      },
    };
    const context = Object.create(prototype) as KonvaContext.SceneContext;
    const pip = Object.create(RankPip.prototype) as RankPip;

    pip._sceneFunc(context);

    expect(calls).toStrictEqual(["stroke", "fill"]);
    expect(Object.hasOwn(context, "fillStrokeShape")).toBe(false);
  });
});
