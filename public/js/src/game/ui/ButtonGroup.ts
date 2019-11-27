// Imports
import Konva from 'konva';
import PlayerButton from './PlayerButton';
import ColorButton from './ColorButton';
import RankButton from './RankButton';

export default class ButtonGroup extends Konva.Group {
    list: Array<PlayerButton | ColorButton | RankButton> = [];

    constructor(config: Konva.ContainerConfig) {
        super(config);

        // Class variables
        this.list = [];
    }

    addList(button: any) {
        const self = this;

        this.list.push(button);

        button.on('click tap', function buttonClick(this: any) {
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

    selectNextTarget() {
        let newSelectionIndex = 0;
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                newSelectionIndex = (i + 1) % this.list.length;
                break;
            }
        }
        this.list[newSelectionIndex].dispatchEvent(new MouseEvent('click'));
    }
}
