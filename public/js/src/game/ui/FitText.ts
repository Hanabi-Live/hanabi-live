// Imports
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
        this.fontSize(this.origFontSize);

        while (
            this.measureSize(this.text()).width > this.width()
            && this.fontSize() > 5
        ) {
            this.fontSize(this.fontSize() * 0.9);
        }

        this.needsResize = false;
    }

    fitText(text: string) {
        super.text(text);
        this.needsResize = true;
    }
}
