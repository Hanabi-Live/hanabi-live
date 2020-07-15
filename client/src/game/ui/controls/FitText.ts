import Konva from 'konva';

export default class FitText extends Konva.Text {
  origFontSize: number;
  needsResize: boolean;

  constructor(config: Konva.TextConfig) {
    super(config);

    // Class variables
    this.origFontSize = this.fontSize();
    this.needsResize = true;

    this.sceneFunc(function sceneFunc(this: FitText, context: any) {
      if (this.needsResize) {
        this.resize();
      }
      Konva.Text.prototype._sceneFunc.call(this, context);
    });
  }

  resize() {
    const textFits = (size: number) => {
      this.fontSize(size);
      return this.measureSize(this.text()).width <= this.width();
    };

    const minimumFontSize = 5;

    if (!textFits(this.origFontSize) && this.origFontSize > minimumFontSize) {
      // Binary search the maximum font size that fits within a tolerance
      let low = minimumFontSize;
      let high = this.origFontSize;
      const tolerance = 0.5;
      while (high - low > tolerance) {
        const mid = low + ((high - low) / 2);
        if (textFits(mid)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      this.fontSize(low);
    }

    this.needsResize = false;
  }

  fitText(text: string) {
    this.text(text);
    this.needsResize = true;
  }
}
