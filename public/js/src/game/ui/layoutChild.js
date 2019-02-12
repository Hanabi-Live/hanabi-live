// Imports
const globals = require('./globals');

const LayoutChild = function LayoutChild(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on('widthChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setWidth(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });

    child.on('heightChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        self.setHeight(event.newVal);
        if (self.parent) {
            self.parent.doLayout();
        }
    });
};

LayoutChild.prototype.setSpeedrunDraggable = function setSpeedrunDraggable() {
    // If we have the "Enable pre-playing cards" feature enabled,
    // make all cards in our hand draggable from the get-go
    // (except for cards we have already played or discarded)
    const card = this.children[0];
    if (
        globals.lobby.settings.speedrunPreplay
        && card.holder === globals.playerUs
        && !globals.replay
        && !globals.spectating
        && !globals.learnedCards[card.order].revealed
    ) {
        this.setDraggable(true);
        this.on('dragend.play', globals.lobby.ui.dragendPlay);
    }
};

module.exports = LayoutChild;
