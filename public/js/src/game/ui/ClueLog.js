// Imports
const globals = require('./globals');
const graphics = require('./graphics');

const ClueLog = function ClueLog(config) {
    graphics.Group.call(this, config);
};

graphics.Util.extend(ClueLog, graphics.Group);

ClueLog.prototype.add = function add(child) {
    graphics.Group.prototype.add.call(this, child);
    this.truncateExcessClueEntries();
    this.doLayout();
};

ClueLog.prototype._setChildrenIndices = function _setChildrenIndices() {
    graphics.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
};

ClueLog.prototype.doLayout = function doLayout() {
    let y = 0;
    for (let i = 0; i < this.children.length; i++) {
        const node = this.children[i];
        node.setY(y);
        y += node.getHeight() + 0.001 * globals.stage.getHeight();
    }
};

// In a 2-player game,
// it is possible for there to be so many clues in the game such that it overflows the clue log
// So, if it is overflowing, then remove the earliest clues to make room for the latest clues
ClueLog.prototype.truncateExcessClueEntries = function truncateExcessClueEntries() {
    const maxLength = 27; // Just enough to fill the parent rectangle
    while (this.children.length - maxLength >= 1) {
        this.children[0].remove();
    }
};

ClueLog.prototype.showMatches = function showMatches(target) {
    for (let i = 0; i < this.children.length; i++) {
        this.children[i].showMatch(target);
    }
};

ClueLog.prototype.clear = function clear() {
    for (let i = this.children.length - 1; i >= 0; i--) {
        this.children[i].remove();
    }
};

module.exports = ClueLog;
