// Imports
const globals = require('./globals');
const graphics = require('./graphics');
const MultiFitText = require('./MultiFitText');

class FullActionLog extends graphics.Group {
    constructor(config) {
        const baseConfig = {
            x: 0.2 * globals.stage.getWidth(),
            y: 0.02 * globals.stage.getHeight(),
            width: 0.4 * globals.stage.getWidth(),
            height: 0.96 * globals.stage.getHeight(),
            clipX: 0,
            clipY: 0,
            clipWidth: 0.4 * globals.stage.getWidth(),
            clipHeight: 0.96 * globals.stage.getHeight(),
            visible: false,
        };
        $.extend(baseConfig, config);
        super(baseConfig);

        const rect = new graphics.Rect({
            x: 0,
            y: 0,
            width: 0.4 * globals.stage.getWidth(),
            height: 0.96 * globals.stage.getHeight(),
            fill: 'black',
            opacity: 0.9,
            cornerRadius: 0.01 * globals.stage.getWidth(),
        });
        graphics.Group.prototype.add.call(this, rect);

        const textOptions = {
            fontSize: 0.025 * globals.stage.getHeight(),
            fontFamily: 'Verdana',
            fill: 'white',
            x: 0.04 * globals.stage.getWidth(),
            y: 0.01 * globals.stage.getHeight(),
            width: 0.35 * globals.stage.getWidth(),
            height: 0.94 * globals.stage.getHeight(),
            maxLines: 38,
        };

        this.logText = new MultiFitText(textOptions);
        graphics.Group.prototype.add.call(this, this.logText);

        const numbersOptions = {
            fontSize: 0.025 * globals.stage.getHeight(),
            fontFamily: 'Verdana',
            fill: '#d3d3d3', // Light gray
            x: 0.01 * globals.stage.getWidth(),
            y: 0.01 * globals.stage.getHeight(),
            width: 0.03 * globals.stage.getWidth(),
            height: 0.94 * globals.stage.getHeight(),
            maxLines: 38,
        };
        this.logNumbers = new MultiFitText(numbersOptions);
        graphics.Group.prototype.add.call(this, this.logNumbers);

        this.playerLogs = [];
        this.playerLogNumbers = [];
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i] = new MultiFitText(textOptions);
            this.playerLogs[i].hide();
            graphics.Group.prototype.add.call(this, this.playerLogs[i]);

            this.playerLogNumbers[i] = new MultiFitText(numbersOptions);
            this.playerLogNumbers[i].hide();
            graphics.Group.prototype.add.call(this, this.playerLogNumbers[i]);
        }
    }

    addMessage(msg) {
        const appendLine = (log, numbers, line) => {
            log.setMultiText(line);
            numbers.setMultiText((globals.turn + 1).toString());
        };

        appendLine(this.logText, this.logNumbers, msg);
        for (let i = 0; i < globals.playerNames.length; i++) {
            if (msg.startsWith(globals.playerNames[i])) {
                appendLine(this.playerLogs[i], this.playerLogNumbers[i], msg);
                break;
            }
        }
    }

    showPlayerActions(playerName) {
        let playerIndex;
        for (let i = 0; i < globals.playerNames.length; i++) {
            if (globals.playerNames[i] === playerName) {
                playerIndex = i;
            }
        }
        this.logText.hide();
        this.logNumbers.hide();
        this.playerLogs[playerIndex].show();
        this.playerLogNumbers[playerIndex].show();

        this.show();

        globals.elements.stageFade.show();
        globals.layers.UI2.batchDraw();

        globals.elements.stageFade.on('click tap', () => {
            globals.elements.stageFade.off('click tap');
            this.playerLogs[playerIndex].hide();
            this.playerLogNumbers[playerIndex].hide();

            this.logText.show();
            this.logNumbers.show();
            this.hide();
            globals.elements.stageFade.hide();
            globals.layers.UI2.batchDraw();
        });
    }

    refreshText() {
        this.logText.refreshText();
        this.logNumbers.refreshText();
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i].refreshText();
            this.playerLogNumbers[i].refreshText();
        }
    }

    reset() {
        this.logText.reset();
        this.logNumbers.reset();
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i].reset();
            this.playerLogNumbers[i].reset();
        }
    }
}

module.exports = FullActionLog;
