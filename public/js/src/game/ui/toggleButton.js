// Imports
const Button = require('./button');

// A simple two-state button with text for each state
const ToggleButton = function ToggleButton(config) {
    Button.call(this, config);
    let toggleState = false;

    const toggle = () => {
        toggleState = !toggleState;
        this.setText(toggleState ? config.alternateText : config.text);
        if (this.getLayer()) {
            this.getLayer().batchDraw();
        }
    };

    this.on('click tap', toggle);

    if (config.initialState) {
        toggle();
    }
};

Kinetic.Util.extend(ToggleButton, Button);

module.exports = ToggleButton;
