// Imports
import Button from './Button';

// A simple two-state button with text for each state
export default class ToggleButton extends Button {
    constructor(config) {
        super(config);

        // Class variables
        this.text1 = config.text;
        this.text2 = config.text2;
        this.toggleState = false;

        this.on('click tap', this.toggle);

        if (config.initialState) {
            this.toggle();
        }
    }

    toggle() {
        this.toggleState = !this.toggleState;
        this.setText(this.toggleState ? this.text2 : this.text1);
        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }
}
