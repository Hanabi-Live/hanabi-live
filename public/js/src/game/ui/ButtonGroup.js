// Imports
import Konva from 'konva';

export default class ButtonGroup extends Konva.Group {
    constructor(config) {
        super(config);

        // Class variables
        this.list = [];
    }

    addList(button) {
        const self = this;

        this.list.push(button);

        button.on('click tap', function buttonClick() {
            this.setPressed(true);

            for (let i = 0; i < self.list.length; i++) {
                if (self.list[i] !== this && self.list[i].pressed) {
                    self.list[i].setPressed(false);
                }
            }

            self.fire('change');
        });
    }

    getPressed() {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                return this.list[i];
            }
        }

        return null;
    }

    clearPressed() {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                this.list[i].setPressed(false);
            }
        }
    }
}
