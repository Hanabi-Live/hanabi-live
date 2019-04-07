/*
    This is one of the entries in the clue log
    (in the top-right-hand corner of the UI)
*/

// Imports
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');
const replay = require('./replay');

class ClueEntry extends graphics.Group {
    constructor(config) {
        super(config);

        // Object variables
        const w = config.width;
        const h = config.height;
        this.list = config.list;
        this.neglist = config.neglist;
        this.turn = config.turn;

        this.background = new graphics.Rect({
            x: 0,
            y: 0,
            width: w,
            height: h,
            fill: 'white',
            opacity: 0.1,
            listening: true,
        });
        this.add(this.background);

        const giver = new FitText({
            x: 0.05 * w,
            y: 0,
            width: 0.3 * w,
            height: h,
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.giver,
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
        });
        this.add(name);

        this.negativeMarker = new graphics.Text({
            x: 0.88 * w,
            y: 0,
            width: 0.2 * w,
            height: h,
            align: 'center',
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: '✘',
            visible: false,
        });
        this.add(this.negativeMarker);

        // Add a mouseover highlighting effect
        this.background.on('mouseover', () => {
            globals.elements.clueLog.showMatches(null);

            this.background.setOpacity(0.4);
            this.background.getLayer().batchDraw();
        });
        this.background.on('mouseout', () => {
            // Fix the bug where the mouseout can happen after the clue has been destroyed
            if (this.background.getLayer() === null) {
                return;
            }

            this.background.setOpacity(0.1);
            this.background.getLayer().batchDraw();
        });

        // Click an entry in the clue log to go to that turn in the replay
        this.background.on('click', () => {
            if (globals.replay) {
                replay.checkDisableSharedTurns();
            } else {
                replay.enter();
            }
            replay.goto(this.turn + 1, true);
        });
    }

    showMatch(target) {
        this.background.setOpacity(0.1);
        this.background.setFill('white');
        this.negativeMarker.hide();

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
                    this.negativeMarker.show();
                }
            }
        }
    }
}

module.exports = ClueEntry;
