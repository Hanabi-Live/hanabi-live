// Imports
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');

class MultiFitText extends graphics.Group {
    constructor(config) {
        super(config);

        this.maxLines = config.maxLines;
        this.smallHistory = [];
        for (let i = 0; i < this.maxLines; i++) {
            const newConfig = $.extend({}, config);

            newConfig.height = config.height / this.maxLines;
            newConfig.x = 0;
            newConfig.y = i * newConfig.height;

            const childText = new FitText(newConfig);
            graphics.Group.prototype.add.call(this, childText);
        }
    }

    setMultiText(text) {
        if (this.smallHistory.length >= this.maxLines) {
            this.smallHistory.shift();
        }
        this.smallHistory.push(text);

        // Performance optimization: setText on the children is slow,
        // so don't actually do it until its time to display things
        // We also have to call refreshText after any time we manipulate replay position
        if (!globals.inReplay || !globals.animateFast) {
            this.refreshText();
        }
    }

    refreshText() {
        for (let i = 0; i < this.children.length; i++) {
            let msg = this.smallHistory[i];
            if (!msg) {
                msg = '';
            }
            this.children[i].setText(msg);
        }
    }

    reset() {
        this.smallHistory = [];
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].setText('');
        }
    }
}

module.exports = MultiFitText;
