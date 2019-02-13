// Imports
const graphics = require('./graphics');

const ButtonGroup = function ButtonGroup(config) {
    graphics.Node.call(this, config);

    this.list = [];
};

graphics.Util.extend(ButtonGroup, graphics.Node);

ButtonGroup.prototype.add = function add(button) {
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
};

ButtonGroup.prototype.getPressed = function getPressed() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.list[i].pressed) {
            return this.list[i];
        }
    }

    return null;
};

ButtonGroup.prototype.clearPressed = function clearPressed() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.list[i].pressed) {
            this.list[i].setPressed(false);
        }
    }
};

module.exports = ButtonGroup;
