// Imports
const Button = require('./Button');

// A simple two-state button with text for each state
class ToggleButton extends Button {
    constructor(config) {
        super(config);

        // Class variables
        this.text = config.text;
        this.alternateText = config.alternateText;
        this.toggleState = false;

        this.on('click tap', this.toggle);

        if (config.initialState) {
            this.toggle();
        }
    }

    toggle() {
        this.toggleState = !this.toggleState;
        this.setText(this.toggleState ? this.alternateText : this.text);
        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }
}

module.exports = ToggleButton;
