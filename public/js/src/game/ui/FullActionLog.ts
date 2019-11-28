// Imports
import Konva from 'konva';
import globals from './globals';
import MultiFitText from './MultiFitText';

export default class FullActionLog extends Konva.Group {
    logText: MultiFitText;
    logNumbers: MultiFitText;
    playerLogs: Array<MultiFitText> = [];
    playerLogNumbers: Array<MultiFitText> = [];

    constructor(winW: number, winH: number) {
        super({
            x: 0.2 * winW,
            y: 0.02 * winH,
            width: 0.4 * winW,
            height: 0.96 * winH,
            clipX: 0,
            clipY: 0,
            clipWidth: 0.4 * winW,
            clipHeight: 0.96 * winH,
            visible: false,
        });

        // The black background
        const rect = new Konva.Rect({
            x: 0,
            y: 0,
            width: 0.4 * winW,
            height: 0.96 * winH,
            fill: 'black',
            opacity: 0.9,
            cornerRadius: 0.01 * winW,
        });
        Konva.Group.prototype.add.call(this, rect);

        const maxLines = 38;

        // The text for each action
        const textOptions = {
            fontSize: 0.025 * winH,
            fontFamily: 'Verdana',
            fill: 'white',
            x: 0.04 * winW,
            y: 0.01 * winH,
            width: 0.35 * winW,
            height: 0.94 * winH,
        };
        this.logText = new MultiFitText(textOptions, maxLines);
        this.add(this.logText as any);

        // The turn numbers for each action
        const numbersOptions = {
            fontSize: 0.025 * winH,
            fontFamily: 'Verdana',
            fill: '#d3d3d3', // Light gray
            x: 0.01 * winW,
            y: 0.01 * winH,
            width: 0.03 * winW,
            height: 0.94 * winH,
        };
        this.logNumbers = new MultiFitText(numbersOptions, maxLines);
        this.add(this.logNumbers as any);

        for (let i = 0; i < globals.playerNames.length; i++) {
            const playerLog = new MultiFitText(textOptions, maxLines);
            playerLog.hide();
            this.playerLogs.push(playerLog);
            this.add(playerLog as any);

            const playerLogNumber = new MultiFitText(numbersOptions, maxLines);
            playerLogNumber.hide();
            this.playerLogNumbers.push(playerLogNumber);
            this.add(playerLogNumber as any);
        }
    }

    addMessage(msg: string) {
        const appendLine = (log: MultiFitText, numbers: MultiFitText, line: string) => {
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

    showPlayerActions(playerName: string) {
        let playerIndex = -1;
        for (let i = 0; i < globals.playerNames.length; i++) {
            if (globals.playerNames[i] === playerName) {
                playerIndex = i;
            }
        }
        if (playerIndex === -1) {
            throw new Error(`Failed to find player "${playerName}" in the player names.`);
        }
        this.logText.hide();
        this.logNumbers.hide();
        this.playerLogs[playerIndex].show();
        this.playerLogNumbers[playerIndex].show();

        this.show();

        if (!globals.elements.stageFade) {
            throw new Error('The "stageFade" element was not initialized.');
        }
        globals.elements.stageFade.show();
        globals.layers.get('UI2')!.batchDraw();

        globals.elements.stageFade.on('click tap', () => {
            if (!globals.elements.stageFade) {
                throw new Error('The "stageFade" element was not initialized.');
            }
            globals.elements.stageFade.off('click tap');
            this.playerLogs[playerIndex].hide();
            this.playerLogNumbers[playerIndex].hide();

            this.logText.show();
            this.logNumbers.show();
            this.hide();
            globals.elements.stageFade.hide();
            globals.layers.get('UI2')!.batchDraw();
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
