/*
    This is the list of clues in the top-right-hand corner of the UI
*/

// Imports
const globals = require('./globals');
const graphics = require('./graphics');

class ClueLog extends graphics.Group {
    add(child) {
        graphics.Group.prototype.add.call(this, child);
        this.truncateExcessClueEntries();
        this.doLayout();
    }

    _setChildrenIndices() {
        graphics.Group.prototype._setChildrenIndices.call(this);
        this.doLayout();
    }

    doLayout() {
        let y = 0;
        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i];
            node.setY(y);
            y += node.getHeight() + 0.001 * globals.stage.getHeight();
        }
    }

    // In a 2-player game,
    // it is possible for there to be so many clues in the game such that it overflows the clue log
    // So, if it is overflowing, then remove the earliest clues to make room for the latest clues
    truncateExcessClueEntries() {
        const maxLength = 27; // Just enough to fill the parent rectangle
        while (this.children.length - maxLength >= 1) {
            this.children[0].remove();
        }
    }

    showMatches(target) {
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].showMatch(target);
        }
    }

    clear() {
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].remove();
        }
    }
}

module.exports = ClueLog;
