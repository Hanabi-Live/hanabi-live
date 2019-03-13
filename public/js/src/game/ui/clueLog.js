// Imports
const globals = require('./globals');
const graphics = require('./graphics');

const ClueLog = function ClueLog(config) {
    graphics.Group.call(this, config);
};

graphics.Util.extend(ClueLog, graphics.Group);

ClueLog.prototype.add = function add(child) {
    graphics.Group.prototype.add.call(this, child);
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

ClueLog.prototype.checkExpiry = function checkExpiry() {
    const maxLength = 31;
    const childrenToRemove = this.children.length - maxLength;
    if (childrenToRemove < 1) {
        return;
    }
    let childrenRemoved = 0;
    for (let i = 0; i < this.children.length; i++) {
        childrenRemoved += this.children[i].checkExpiry();
        if (childrenRemoved >= childrenToRemove) {
            break;
        }
    }

    this.doLayout();
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
