// Imports
const globals = require('./globals');
const constants = require('../../constants');

const LayoutChild = function LayoutChild(config) {
    Kinetic.Group.call(this, config);

    this.tween = null;
};

Kinetic.Util.extend(LayoutChild, Kinetic.Group);

LayoutChild.prototype.add = function add(child) {
    Kinetic.Group.prototype.add.call(this, child);
    this.setWidth(child.getWidth());
    this.setHeight(child.getHeight());

    child.on('widthChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        this.setWidth(event.newVal);
        if (this.parent) {
            this.parent.doLayout();
        }
    });

    child.on('heightChange', (event) => {
        if (event.oldVal === event.newVal) {
            return;
        }
        this.setHeight(event.newVal);
        if (this.parent) {
            this.parent.doLayout();
        }
    });
};

// The card sliding animation is finished, so make the card draggable
LayoutChild.prototype.checkSetDraggable = function checkSetDraggable() {
    // Cards should only be draggable in specific circumstances
    const card = this.children[0];
    if (
        // If it is not our turn, then the card does not need to be draggable yet
        // (unless we have the "Enable pre-playing cards" feature enabled)
        (!globals.ourTurn && !globals.lobby.settings.speedrunPreplay)
        || card.holder !== globals.playerUs // Only our cards should be draggable
        || card.isPlayed // Cards on the stacks should not be draggable
        || card.isDiscarded // Cards in the discard pile should not be draggable
        || globals.replay // Cards should not be draggable in solo or shared replays
        || globals.spectating // Cards should not be draggable if we are spectating an ongoing game
        // Cards should not be draggable if they are currently playing an animation
        // (this function will be called again upon the completion of the animation)
        || this.tween !== null
    ) {
        return;
    }

    this.setDraggable(true);
    this.on('dragend.play', this.dragendPlay);
};

LayoutChild.prototype.dragendPlay = function dragendPlay() {
    const pos = this.getAbsolutePosition();

    pos.x += this.getWidth() * this.getScaleX() / 2;
    pos.y += this.getHeight() * this.getScaleY() / 2;

    let draggedTo = null;
    if (globals.elements.playArea.isOver(pos)) {
        draggedTo = 'playArea';
    } else if (globals.elements.discardArea.isOver(pos) && globals.clues !== 8) {
        draggedTo = 'discardArea';
    }
    if (draggedTo === null) {
        // The card was dragged to an invalid location; tween it back to the hand
        globals.elements.playerHands[globals.playerUs].doLayout();
        return;
    }

    globals.lobby.ui.endTurn({
        type: 'action',
        data: {
            type: (draggedTo === 'playArea' ? constants.ACT.PLAY : constants.ACT.DISCARD),
            target: this.children[0].order,
        },
    });
    this.setDraggable(false);

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.off('dragend.play');
};

module.exports = LayoutChild;
