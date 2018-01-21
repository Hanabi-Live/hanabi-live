// TODO
/*
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

    while (this._getTextSize(this.getText()).width > this.getWidth() && this.getFontSize() > 5) {
        this.setFontSize(this.getFontSize() * 0.9);
    }

    this.needsResize = false;
};

FitText.prototype.setText = function setText(text) {
    Kinetic.Text.prototype.setText.call(this, text);

    this.needsResize = true;
};

const MultiFitText = function MultiFitText(config) {
    Kinetic.Group.call(this, config);
    this.maxLines = config.maxLines;
    this.smallHistory = [];
    for (let i = 0; i < this.maxLines; i++) {
        const newConfig = $.extend({}, config);

        newConfig.height = config.height / this.maxLines;
        newConfig.x = 0;
        newConfig.y = i * newConfig.height;

        const childText = new FitText(newConfig);
        Kinetic.Group.prototype.add.call(this, childText);
    }
};

Kinetic.Util.extend(MultiFitText, Kinetic.Group);

MultiFitText.prototype.setMultiText = function setMultiText(text) {
    if (this.smallHistory.length >= this.maxLines) {
        this.smallHistory.shift();
    }
    this.smallHistory.push(text);
    // Performance optimization: setText on the children is slow, so don't
    // actually do it until its time to display things.
    // We also have to call refreshText after any time we manipulate replay
    // position
    if (!ui.replay || !ui.animateFast) {
        this.refreshText();
    }
};

MultiFitText.prototype.refreshText = function refreshText() {
    for (let i = 0; i < this.children.length; i++) {
        let msg = this.smallHistory[i];
        if (!msg) {
            msg = '';
        }
        this.children[i].setText(msg);
    }
};

MultiFitText.prototype.reset = function reset() {
    this.smallHistory = [];
    for (let i = 0; i < this.children.length; i++) {
        this.children[i].setText('');
    }
};
*/
