const FitText = function FitText(config) {
    Kinetic.Text.call(this, config);

    this.origFontSize = this.getFontSize();
    this.needsResize = true;

    this.setDrawFunc(function setDrawFunc(context) {
        if (this.needsResize) {
            this.resize();
        }
        Kinetic.Text.prototype._sceneFunc.call(this, context);
    });
};

Kinetic.Util.extend(FitText, Kinetic.Text);

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
    Kinetic.Text.prototype.setText.call(this, text);

    this.needsResize = true;
};

module.exports = FitText;
