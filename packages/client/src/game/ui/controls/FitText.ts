import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import { MIN_FONT_SIZE } from "../constants.ts";

export class FitText extends Konva.Text {
  origFontSize: number;
  needsResize: boolean;

  constructor(config: Konva.TextConfig) {
    super(config);

    // Never listen on the text object, listen on the parent instead.
    this.listening(false);

    // Class variables
    this.origFontSize = this.fontSize();
    this.needsResize = true;

    this.sceneFunc(function sceneFunc(
      this: FitText,
      context: KonvaContext.Context,
    ) {
      if (this.needsResize) {
        this.resize();
      }
      // Konva only calls scene functions with a scene context.
      Konva.Text.prototype._sceneFunc.call(
        this,
        context as KonvaContext.SceneContext,
      );
    });
  }

  resize(): void {
    if (
      !this.textFits(this.origFontSize)
      && this.origFontSize > MIN_FONT_SIZE
    ) {
      // Binary search the maximum font size that fits within a tolerance.
      let low = MIN_FONT_SIZE;
      let high = this.origFontSize;
      const tolerance = 0.5;
      while (high - low > tolerance) {
        const mid = low + (high - low) / 2;
        if (this.textFits(mid)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      this.fontSize(low);
    }

    this.needsResize = false;
  }

  textFits(size: number): boolean {
    this.fontSize(size);
    return this.measureSize(this.text()).width <= this.width();
  }

  fitText(text: string): void {
    this.text(text);
    this.needsResize = true;
  }
}
