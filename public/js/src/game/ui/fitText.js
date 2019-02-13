// Imports
const graphics = require('./graphics');

const FitText = function FitText(config) {
    graphics.Text.call(this, config);

    this.origFontSize = this.getFontSize();
    this.needsResize = true;

    this.setSceneFunc(function setSceneFunc(context) {
        if (this.needsResize) {
            this.resize();
        }
        graphics.Text.prototype._sceneFunc.call(this, context);
    });
};

graphics.Util.extend(FitText, graphics.Text);

FitText.prototype.resize = function resize() {
    this.setFontSize(this.origFontSize);

    while (
        this._getTextSize(this.getText()).width > this.getWidth()
        && this.getFontSize() > 5
    ) {
        this.setFontSize(this.getFontSize() * 0.9);
    }

    this.needsResize = false;
};

FitText.prototype.setText = function setText(text) {
    graphics.Text.prototype.setText.call(this, text);

    this.needsResize = true;
};

module.exports = FitText;
