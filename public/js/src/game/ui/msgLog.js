// Imports
const globals = require('./globals');
const graphics = require('./graphics');
const MultiFitText = require('./multiFitText');

const HanabiMsgLog = function HanabiMsgLog(config) {
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
        listening: false,
    };

    $.extend(baseConfig, config);
    graphics.Group.call(this, baseConfig);

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

    const textoptions = {
        fontSize: 0.025 * globals.stage.getHeight(),
        fontFamily: 'Verdana',
        fill: 'white',
        x: 0.04 * globals.stage.getWidth(),
        y: 0.01 * globals.stage.getHeight(),
        width: 0.35 * globals.stage.getWidth(),
        height: 0.94 * globals.stage.getHeight(),
        maxLines: 38,
    };

    this.logtext = new MultiFitText(textoptions);
    graphics.Group.prototype.add.call(this, this.logtext);

    const numbersoptions = {
        fontSize: 0.025 * globals.stage.getHeight(),
        fontFamily: 'Verdana',
        fill: 'lightgrey',
        x: 0.01 * globals.stage.getWidth(),
        y: 0.01 * globals.stage.getHeight(),
        width: 0.03 * globals.stage.getWidth(),
        height: 0.94 * globals.stage.getHeight(),
        maxLines: 38,
    };
    this.lognumbers = new MultiFitText(numbersoptions);
    graphics.Group.prototype.add.call(this, this.lognumbers);

    this.playerLogs = [];
    this.playerLogNumbers = [];
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i] = new MultiFitText(textoptions);
        this.playerLogs[i].hide();
        graphics.Group.prototype.add.call(this, this.playerLogs[i]);

        this.playerLogNumbers[i] = new MultiFitText(numbersoptions);
        this.playerLogNumbers[i].hide();
        graphics.Group.prototype.add.call(this, this.playerLogNumbers[i]);
    }
};

graphics.Util.extend(HanabiMsgLog, graphics.Group);

HanabiMsgLog.prototype.addMessage = function addMessage(msg) {
    const appendLine = (log, numbers, line) => {
        log.setMultiText(line);
        numbers.setMultiText(globals.deckSize.toString());
    };

    appendLine(this.logtext, this.lognumbers, msg);
    for (let i = 0; i < globals.playerNames.length; i++) {
        if (msg.startsWith(globals.playerNames[i])) {
            appendLine(this.playerLogs[i], this.playerLogNumbers[i], msg);
            break;
        }
    }
};

HanabiMsgLog.prototype.showPlayerActions = function showPlayerActions(playerName) {
    let playerIDX;
    for (let i = 0; i < globals.playerNames.length; i++) {
        if (globals.playerNames[i] === playerName) {
            playerIDX = i;
        }
    }
    this.logtext.hide();
    this.lognumbers.hide();
    this.playerLogs[playerIDX].show();
    this.playerLogNumbers[playerIDX].show();

    this.show();

    globals.elements.stageFade.show();
    globals.layers.overtop.batchDraw();

    const thislog = this;
    globals.elements.stageFade.on('click tap', () => {
        globals.elements.stageFade.off('click tap');
        thislog.playerLogs[playerIDX].hide();
        thislog.playerLogNumbers[playerIDX].hide();

        thislog.logtext.show();
        thislog.lognumbers.show();
        thislog.hide();
        globals.elements.stageFade.hide();
        globals.layers.overtop.batchDraw();
    });
};

HanabiMsgLog.prototype.refreshText = function refreshText() {
    this.logtext.refreshText();
    this.lognumbers.refreshText();
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i].refreshText();
        this.playerLogNumbers[i].refreshText();
    }
};

HanabiMsgLog.prototype.reset = function reset() {
    this.logtext.reset();
    this.lognumbers.reset();
    for (let i = 0; i < globals.playerNames.length; i++) {
        this.playerLogs[i].reset();
        this.playerLogNumbers[i].reset();
    }
};

module.exports = HanabiMsgLog;
