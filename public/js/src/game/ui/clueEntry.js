// Imports
const globals = require('./globals');
const FitText = require('./fitText');
const graphics = require('./graphics');
const replay = require('./replay');

const HanabiClueEntry = function HanabiClueEntry(config) {
    graphics.Group.call(this, config);

    const w = config.width;
    const h = config.height;

    const background = new graphics.Rect({
        x: 0,
        y: 0,
        width: w,
        height: h,
        fill: 'white',
        opacity: 0.1,
        listening: true,
    });
    this.background = background;

    this.add(background);

    const giver = new FitText({
        x: 0.05 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.giver,
        listening: false,
    });
    this.add(giver);

    const target = new FitText({
        x: 0.4 * w,
        y: 0,
        width: 0.3 * w,
        height: h,
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.target,
        listening: false,
    });
    this.add(target);

    const name = new graphics.Text({
        x: 0.75 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: 'center',
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: config.clueName,
        listening: false,
    });
    this.add(name);

    const negativeMarker = new graphics.Text({
        x: 0.88 * w,
        y: 0,
        width: 0.2 * w,
        height: h,
        align: 'center',
        fontSize: 0.9 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        text: '✘',
        listening: false,
        visible: false,
    });

    this.negativeMarker = negativeMarker;
    this.add(negativeMarker);

    this.list = config.list;
    this.neglist = config.neglist;

    // Add a mouseover highlighting effect
    background.on('mouseover tap', () => {
        globals.elements.clueLog.showMatches(null);

        background.setOpacity(0.4);
        background.getLayer().batchDraw();
    });
    background.on('mouseout', () => {
        // Fix the bug where the mouseout can happen after the clue has been destroyed
        if (background.getLayer() === null) {
            return;
        }

        background.setOpacity(0.1);
        background.getLayer().batchDraw();
    });

    // Store the turn that the clue occured inside this object for later
    this.turn = config.turn;

    // Click an entry in the clue log to go to that turn in the replay
    background.on('click', () => {
        if (globals.replay) {
            replay.checkDisableSharedTurns();
        } else {
            replay.enter();
        }
        replay.goto(this.turn + 1, true);
    });
};

graphics.Util.extend(HanabiClueEntry, graphics.Group);

HanabiClueEntry.prototype.checkValid = (c) => {
    if (!globals.deck[c]) {
        return false;
    }

    if (!globals.deck[c].parent) {
        return false;
    }

    return globals.deck[c].isInPlayerHand();
};

// Returns number of expirations, either 0 or 1 depending on whether it expired
HanabiClueEntry.prototype.checkExpiry = function checkExpiry() {
    for (let i = 0; i < this.list.length; i++) {
        if (this.checkValid(this.list[i])) {
            return 0;
        }
    }

    for (let i = 0; i < this.neglist.length; i++) {
        if (this.checkValid(this.neglist[i])) {
            return 0;
        }
    }

    this.off('mouseover tap');
    this.off('mouseout');

    this.remove();
    return 1;
};

HanabiClueEntry.prototype.showMatch = function showMatch(target) {
    this.background.setOpacity(0.1);
    this.background.setFill('white');
    this.negativeMarker.setVisible(false);

    for (let i = 0; i < this.list.length; i++) {
        if (globals.deck[this.list[i]] === target) {
            this.background.setOpacity(0.4);
        }
    }

    for (let i = 0; i < this.neglist.length; i++) {
        if (globals.deck[this.neglist[i]] === target) {
            this.background.setOpacity(0.4);
            this.background.setFill('#ff7777');
            if (globals.lobby.settings.showColorblindUI) {
                this.negativeMarker.setVisible(true);
            }
        }
    }
};

module.exports = HanabiClueEntry;
