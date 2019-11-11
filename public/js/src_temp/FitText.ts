// Imports
import * as Konva from 'konva';

class FitText extends Konva.Text {
    origFontSize: number;

    constructor(config: Konva.TextConfig) {
        super(config);

        // Class variables
        this.origFontSize = this.getFontSize();
        this.needsResize = true;

        this.setSceneFunc(function setSceneFunc(this: FitText, context: object) {
            if (this.needsResize) {
                this.resize();
            }
            Konva.Text.prototype._sceneFunc.call(this, context);
        });
    }

    resize() {
        this.setFontSize(this.origFontSize);

        while (
            this.measureSize(this.getText()).width > this.getWidth()
            && this.getFontSize() > 5
        ) {
            this.setFontSize(this.getFontSize() * 0.9);
        }

        this.needsResize = false;
    }

    setText(text: string) {
        Konva.Text.prototype.setText.call(this, text);
        this.needsResize = true;
    }
}

export default FitText;
