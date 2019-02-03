/*
    CardLayout is composed of LayoutChild objects
*/

// Imports
const globals = require('./globals');

const CardLayout = function CardLayout(config) {
    Kinetic.Group.call(this, config);

    this.align = (config.align || 'left');
    this.reverse = (config.reverse || false);
    this.invertCards = (config.invertCards || false);
};

Kinetic.Util.extend(CardLayout, Kinetic.Group);

CardLayout.prototype.add = function add(child) {
    child.children.forEach((c) => {
        if (c.doRotations) {
            c.doRotations(this.invertCards);
        }
    });
    const pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    this.doLayout();
};

CardLayout.prototype._setChildrenIndices = function _setChildrenIndices() {
    Kinetic.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

CardLayout.prototype.doLayout = function doLayout() {
    let uw = 0;
    let dist = 0;
    let x = 0;

    const lw = this.getWidth();
    const lh = this.getHeight();

    const n = this.children.length;

    for (let i = 0; i < n; i++) {
        const node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        const scale = lh / node.getHeight();

        uw += scale * node.getWidth();
    }

    if (n > 1) {
        dist = (lw - uw) / (n - 1);
    }

    if (dist > 10) {
        dist = 10;
    }

    uw += dist * (n - 1);

    if (this.align === 'center' && uw < lw) {
        x = (lw - uw) / 2;
    }

    if (this.reverse) {
        x = lw - x;
    }

    const storedPostAnimationLayout = globals.postAnimationLayout;

    for (let i = 0; i < n; i++) {
        const node = this.children[i];

        if (!node.getHeight()) {
            continue;
        }

        const scale = lh / node.getHeight();

        if (node.tween) {
            node.tween.destroy();
        }

        if (!node.isDragging()) {
            if (globals.animateFast) {
                node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
            } else {
                node.tween = new Kinetic.Tween({
                    node,
                    duration: 0.5,
                    x: x - (this.reverse ? scale * node.getWidth() : 0),
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    runonce: true,
                    onFinish: storedPostAnimationLayout,
                }).play();
            }
        }

        x += (scale * node.getWidth() + dist) * (this.reverse ? -1 : 1);
    }
};

module.exports = CardLayout;
