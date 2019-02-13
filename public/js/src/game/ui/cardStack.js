/*
    CardStack is an object that represents a play stack
    It is composed of LayoutChild objects
*/

// Imports
const globals = require('./globals');

const CardStack = function CardStack(config) {
    Kinetic.Group.call(this, config);
};

Kinetic.Util.extend(CardStack, Kinetic.Group);

CardStack.prototype.add = function add(child) {
    child.children.forEach((c) => {
        if (c.doRotations) {
            c.doRotations(false);
        }
    });
    const pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardStack.prototype._setChildrenIndices = function _setChildrenIndices() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
};

CardStack.prototype.doLayout = function doLayout() {
    const lh = this.getHeight();

    const hideUnder = () => {
        const n = this.children.length;
        for (let i = 0; i < n; i++) {
            const node = this.children[i];

            if (!node.tween) {
                continue;
            }

            if (node.tween !== null) {
                return;
            }
        }
        for (let i = 0; i < n - 1; i++) {
            this.children[i].setVisible(false);
        }
        if (n > 0) {
            this.children[n - 1].setVisible(true);
        }
    };

    for (let i = 0; i < this.children.length; i++) {
        const node = this.children[i]; // This is a LayoutChild

        const scale = lh / node.getHeight();

        if (globals.animateFast) {
            node.setX(0);
            node.setY(0);
            node.setScaleX(scale);
            node.setScaleY(scale);
            node.setRotation(0);
            hideUnder();
        } else {
            // Animate the card leaving the hand to the play stacks
            node.tween = new Kinetic.Tween({
                node,
                duration: 0.8,
                x: 0,
                y: 0,
                scaleX: scale,
                scaleY: scale,
                rotation: 0,
                runonce: true,
                onFinish: () => {
                    node.tween.destroy();
                    node.tween = null;
                    node.checkSetDraggable();
                    hideUnder();
                },
            }).play();
        }
    }
};

module.exports = CardStack;
