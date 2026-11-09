import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import { CLUED_COLOR } from "../constants";

export class RankPip extends Konva.Text {
  private fillValue: string | CanvasGradient | undefined;
  private positive = false;

  constructor(config?: Konva.TextConfig) {
    super(config);
    this.fillValue = config?.fill;
  }

  /**
   * Draws the outline before the fill. The fill then covers the inner half of the outline, so the
   * whole outline lies outside the digit and still surrounds it when cards are drawn small.
   */
  override _sceneFunc(context: KonvaContext.SceneContext): void {
    // Shadow the prototype method on this context only while the text is drawn.
    context.fillStrokeShape = (shape: Konva.Shape) => {
      context.strokeShape(shape);
      context.fillShape(shape);
    };
    try {
      super._sceneFunc(context);
    } finally {
      Reflect.deleteProperty(context, "fillStrokeShape");
    }
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
