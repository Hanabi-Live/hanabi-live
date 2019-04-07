// Imports
const graphics = require('./graphics');

class FitText extends graphics.Text {
    constructor(config) {
        super(config);

        // Class variables
        this.origFontSize = this.getFontSize();
        this.needsResize = true;

        this.setSceneFunc(function setSceneFunc(context) {
            if (this.needsResize) {
                this.resize();
            }
            graphics.Text.prototype._sceneFunc.call(this, context);
        });
    }

    resize() {
        this.setFontSize(this.origFontSize);

        while (
            this._getTextSize(this.getText()).width > this.getWidth()
            && this.getFontSize() > 5
        ) {
            this.setFontSize(this.getFontSize() * 0.9);
        }

        this.needsResize = false;
    }

    setText(text) {
        graphics.Text.prototype.setText.call(this, text);
        this.needsResize = true;
    }
}

module.exports = FitText;
