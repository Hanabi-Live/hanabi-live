/*
    This is the parent of a HanabiCard
    It has a CardLayout or CardStack parent
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');
const graphics = require('./graphics');
const ui = require('./ui');

class LayoutChild extends graphics.Group {
    constructor() {
        super();

        // Class variables
        this.tween = null;
    }

    add(child) {
        graphics.Group.prototype.add.call(this, child);
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
    }

    // The card sliding animation is finished, so make the card draggable
    checkSetDraggable() {
        // Cards should only be draggable in specific circumstances
        const card = this.children[0];
        if (!card) {
            // Rarely, if the game is restarted when a tween is happening,
            // we can get here without the card being defined
            return;
        }
        if (
            // If it is not our turn, then the card does not need to be draggable yet
            // (unless we have the "Enable pre-playing cards" feature enabled)
            (!globals.ourTurn && !globals.lobby.settings.speedrunPreplay)
            || globals.speedrun // Cards should never be draggable while speedrunning
            || card.holder !== globals.playerUs // Only our cards should be draggable
            || card.isPlayed // Cards on the stacks should not be draggable
            || card.isDiscarded // Cards in the discard pile should not be draggable
            || globals.replay // Cards should not be draggable in solo or shared replays
            // Cards should not be draggable if we are spectating an ongoing game
            || globals.spectating
            // Cards should not be draggable if they are currently playing an animation
            // (this function will be called again upon the completion of the animation)
            || card.tweening
        ) {
            // Make an exception for cards in a hypothetical
            // that are being dragged by the replay leader
            if (!globals.hypothetical || !globals.amSharedReplayLeader) {
                this.setDraggable(false);
                this.off('dragend');
                return;
            }
        }

        this.setDraggable(true);
        this.on('dragend', this.dragEnd);
    }

    dragEnd() {
        const card = this.children[0];

        const pos = this.getAbsolutePosition();
        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        let draggedTo = null;
        if (globals.elements.playArea.isOver(pos)) {
            draggedTo = 'playArea';
        } else if (globals.elements.discardArea.isOver(pos) && globals.clues !== 8) {
            draggedTo = 'discardArea';
        }

        // Before we play a card,
        // do a check to ensure that it is actually playable to prevent silly mistakes from players
        // (but disable this in speedruns)
        if (
            draggedTo === 'playArea'
            && !globals.speedrun
            && globals.ourTurn // Don't use warnings for preplays
            && !card.isPotentiallyPlayable()
        ) {
            let text = 'Are you sure you want to play this card?\n';
            text += 'It is known to be unplayable based on the current information\n';
            text += 'available to you. (e.g. positive clues, negative clues, cards seen, etc.)';
            if (!window.confirm(text)) {
                draggedTo = null;
            }
        }

        // We have to unregister the handler or else it will send multiple actions for one drag
        this.setDraggable(false);
        this.off('dragend');

        if (draggedTo === null) {
            // The card was dragged to an invalid location; tween it back to the hand
            this.parent.doLayout(); // The parent is a CardLayout
            return;
        }

        ui.endTurn({
            type: 'action',
            data: {
                type: (draggedTo === 'playArea' ? constants.ACT.PLAY : constants.ACT.DISCARD),
                target: this.children[0].order,
            },
        });
    }
}

module.exports = LayoutChild;
