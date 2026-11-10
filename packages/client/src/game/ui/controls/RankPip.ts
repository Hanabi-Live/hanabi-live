import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import { CLUED_COLOR } from "../constants";
import { drawWithKonva3Shadow } from "./konva3Shadow";

/** The default miter limit of a canvas, which Konva 3 outlined text with. */
export const CANVAS_DEFAULT_MITER_LIMIT = 10;

export class RankPip extends Konva.Text {
  private fillValue: string | CanvasGradient | undefined;
  private positive = false;

  constructor(config?: Konva.TextConfig) {
    super(config);
    this.fillValue = config?.fill;
  }

  override _sceneFunc(context: KonvaContext.SceneContext): void {
    drawWithKonva3Shadow(this, context, () => {
      super._sceneFunc(context);
    });
  }

  /** Like Konva 3, use a buffer only for a transparent pip. */
  override _useBufferCanvas(
    forceFill?: boolean,
    opacity = this.getAbsoluteOpacity() as number,
  ): boolean {
    return opacity !== 1 && super._useBufferCanvas(forceFill, opacity);
  }

  setFillValue(fill: string): void {
    if (this.fillValue === fill) {
      return;
    }

    this.fillValue = fill;
    if (this.positive) {
      this.showPositiveClue();
    } else {
      this.hidePositiveClue();
    }
  }

  showPositiveClue(): void {
    this.positive = true;
    this.fill(CLUED_COLOR);
  }

  hidePositiveClue(): void {
    this.positive = false;
    this.fill(this.fillValue ?? "black");
  }
}

/**
 * Konva 10 outlines text with a miter limit of 2, which cuts off the sharp corners of digits such
 * as 4 and 5. Outline them as Konva 3 did.
 */
RankPip.prototype._strokeFunc = function _strokeFunc(
  this: RankPip,
  context: KonvaContext.Context,
) {
  context.setAttr("miterLimit", CANVAS_DEFAULT_MITER_LIMIT);
  context.strokeText(this._partialText, this._partialTextX, this._partialTextY);
};
