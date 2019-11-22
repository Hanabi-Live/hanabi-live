// Imports
import Konva from 'konva';
import Button from './Button';

export default class ButtonGroup extends Konva.Group {
    list: Array<Button> = [];

    constructor(config: Konva.ContainerConfig) {
        super(config);

        // Class variables
        this.list = [];
    }

    addList(button: Button) {
        const self = this;

        this.list.push(button);

        button.on('click tap', function buttonClick() {
            this.setPressed(true);

            for (let i = 0; i < self.list.length; i++) {
                if (self.list[i] !== this && self.list[i].pressed) {
                    self.list[i].setPressed(false);
                }
            }

            self.fire('change', null);
        });
    }

    getPressed() {
        for (const button of this.list) {
            if (button.pressed) {
                return button;
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
