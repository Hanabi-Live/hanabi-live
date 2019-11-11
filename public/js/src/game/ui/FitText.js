// Imports
import Konva from 'konva';

export default class FitText extends Konva.Text {
    constructor(config) {
        super(config);

        // Class variables
        this.origFontSize = this.getFontSize();
        this.needsResize = true;

        this.setSceneFunc(function setSceneFunc(context) {
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

    setText(text) {
        Konva.Text.prototype.setText.call(this, text);
        this.needsResize = true;
    }
}
