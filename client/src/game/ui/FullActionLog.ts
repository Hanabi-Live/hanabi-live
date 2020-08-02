import Konva from 'konva';
import FitText from './controls/FitText';
import globals from './globals';
import MultiFitText from './MultiFitText';

export default class FullActionLog extends Konva.Group {
  buffer: Array<{turnNum: number; text: string}> = [];
  logText: MultiFitText;
  logNumbers: MultiFitText;
  playerLogEmptyMessage: FitText;
  playerLogs: MultiFitText[] = [];
  playerLogNumbers: MultiFitText[] = [];
  private needsRefresh: boolean = false;

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
      listening: false,
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
      listening: false,
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
      listening: false,
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
      listening: false,
    };
    this.logNumbers = new MultiFitText(numbersOptions, maxLines);
    this.add(this.logNumbers as any);

    // The text displayed when the selected player hasn't taken any actions
    const emptyMessageOptions = {
      fontSize: 0.025 * winH,
      fontFamily: 'Verdana',
      fill: 'white',
      x: 0.04 * winW,
      y: 0.01 * winH,
      width: 0.35 * winW,
      height: 0.94 * winH,
      listening: false,
    };
    this.playerLogEmptyMessage = new FitText(emptyMessageOptions);
    this.playerLogEmptyMessage.fitText('This player has not taken any actions yet.');
    this.playerLogEmptyMessage.hide();
    this.add(this.playerLogEmptyMessage as any);

    for (let i = 0; i < globals.options.numPlayers; i++) {
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

  addMessage(turn: number, msg: string) {
    this.buffer.push({ turnNum: turn, text: msg });
    this.needsRefresh = true;

    // If the log is already open, apply the change immediately
    if (this.isVisible()) {
      this.refreshText();
    }
  }

  // Overrides the Konva show() method to refresh the text as well
  show() {
    // We only need to refresh the text when it is shown
    if (this.needsRefresh) {
      this.refreshText();
    }
    return super.show();
  }

  showPlayerActions(playerName: string) {
    const playerIndex = globals.state.metadata.playerNames.findIndex((name) => name === playerName);
    if (playerIndex === -1) {
      throw new Error(`Failed to find player "${playerName}" in the player names.`);
    }
    this.logText.hide();
    this.logNumbers.hide();

    if (this.needsRefresh) {
      this.refreshText();
    }

    if (this.playerLogs[playerIndex].isEmpty()) {
      this.playerLogEmptyMessage.show();
    } else {
      this.playerLogs[playerIndex].show();
      this.playerLogNumbers[playerIndex].show();
    }

    this.show();

    if (!globals.elements.stageFade) {
      throw new Error('The "stageFade" element was not initialized.');
    }
    globals.elements.stageFade.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade.on('click tap', () => {
      if (!globals.elements.stageFade) {
        throw new Error('The "stageFade" element was not initialized.');
      }
      globals.elements.stageFade.off('click tap');
      this.playerLogEmptyMessage.hide();
      this.playerLogs[playerIndex].hide();
      this.playerLogNumbers[playerIndex].hide();

      this.logText.show();
      this.logNumbers.show();
      this.hide();
      globals.elements.stageFade.hide();

      globals.layers.UI2.batchDraw();
    });
  }

  private refreshText() {
    const appendLine = (log: MultiFitText, numbers: MultiFitText, turn: number, line: string) => {
      log.setMultiText(line);
      numbers.setMultiText(turn.toString());
    };

    this.buffer.forEach((logEntry) => {
      appendLine(this.logText, this.logNumbers, logEntry.turnNum, logEntry.text);
      for (let i = 0; i < globals.options.numPlayers; i++) {
        if (logEntry.text.startsWith(globals.state.metadata.playerNames[i])) {
          appendLine(this.playerLogs[i], this.playerLogNumbers[i], logEntry.turnNum, logEntry.text);
          break;
        }
      }
    });

    this.logText.refreshText();
    this.logNumbers.refreshText();
    for (let i = 0; i < globals.options.numPlayers; i++) {
      this.playerLogs[i].refreshText();
      this.playerLogNumbers[i].refreshText();
    }
    this.buffer = [];
    this.needsRefresh = false;
  }

  reset() {
    this.buffer = [];
    this.logText.reset();
    this.logNumbers.reset();
    for (let i = 0; i < globals.options.numPlayers; i++) {
      this.playerLogs[i].reset();
      this.playerLogNumbers[i].reset();
    }
    this.needsRefresh = true;
  }
}
