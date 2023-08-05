import Konva from "konva";
import type { ContainerConfig } from "konva/types/Container";
import { FitText } from "./controls/FitText";
import { globals } from "./globals";
import { MultiFitText } from "./MultiFitText";

export class FullActionLog extends Konva.Group {
  buffer: Array<{ turnNum: number; text: string }> = [];
  logText: MultiFitText | null = null;
  logNumbers: MultiFitText | null = null;
  playerLogEmptyMessage: FitText;
  private playerLogs: Array<MultiFitText | null> = [];
  private playerLogNumbers: Array<MultiFitText | null> = [];
  private needsRefresh = false;
  private readonly numbersOptions: ContainerConfig;
  private readonly maxLines = 38;
  private readonly textOptions: ContainerConfig;

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
      fill: "black",
      opacity: 0.9,
      cornerRadius: 0.01 * winW,
      listening: false,
    });
    Konva.Group.prototype.add.call(this, rect);

    // The text for each action.
    this.textOptions = {
      fontSize: 0.025 * winH,
      fontFamily: "Verdana",
      fill: "white",
      x: 0.04 * winW,
      y: 0.01 * winH,
      width: 0.35 * winW,
      height: 0.94 * winH,
      listening: false,
    };

    // The turn numbers for each action.
    this.numbersOptions = {
      fontSize: 0.025 * winH,
      fontFamily: "Verdana",
      fill: "#d3d3d3", // Light gray
      x: 0.01 * winW,
      y: 0.01 * winH,
      width: 0.03 * winW,
      height: 0.94 * winH,
      listening: false,
    };

    // The text displayed when the selected player hasn't taken any actions.
    const emptyMessageOptions = {
      fontSize: 0.025 * winH,
      fontFamily: "Verdana",
      fill: "white",
      x: 0.04 * winW,
      y: 0.01 * winH,
      width: 0.35 * winW,
      height: 0.94 * winH,
      listening: false,
    };
    this.playerLogEmptyMessage = new FitText(emptyMessageOptions);
    this.playerLogEmptyMessage.fitText(
      "This player has not taken any actions yet.",
    );
    this.playerLogEmptyMessage.hide();
    this.add(this.playerLogEmptyMessage as unknown as Konva.Text);

    for (let i = 0; i < globals.options.numPlayers; i++) {
      this.playerLogs.push(null);
      this.playerLogNumbers.push(null);
    }
  }

  addMessage(turn: number, msg: string): void {
    this.buffer.push({ turnNum: turn, text: msg });
    this.needsRefresh = true;

    // If the log is already open, apply the change immediately.
    if (this.isVisible() === true) {
      this.refreshText();
    }
  }

  // Overrides the Konva show() method to refresh the text as well.
  override show(): this {
    // We only need to refresh the text when it is shown.
    if (this.needsRefresh) {
      this.refreshText();
    }
    return super.show();
  }

  showPlayerActions(playerName: string): void {
    const playerIndex = globals.metadata.playerNames.indexOf(playerName);
    if (playerIndex === -1) {
      throw new Error(
        `Failed to find player "${playerName}" in the player names.`,
      );
    }

    if (this.needsRefresh) {
      this.refreshText();
    }

    this.logText!.hide();
    this.logNumbers!.hide();

    if (this.playerLogs[playerIndex] === null) {
      this.playerLogEmptyMessage.show();
    } else {
      this.playerLogs[playerIndex]!.show();
      this.playerLogNumbers[playerIndex]!.show();
    }

    this.show();

    if (globals.elements.stageFade === null) {
      throw new Error('The "stageFade" element was not initialized.');
    }
    globals.elements.stageFade.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade.on("click tap", () => {
      if (globals.elements.stageFade === null) {
        throw new Error('The "stageFade" element was not initialized.');
      }
      globals.elements.stageFade.off("click tap");
      this.playerLogEmptyMessage.hide();
      this.playerLogs[playerIndex]?.hide();
      this.playerLogNumbers[playerIndex]?.hide();

      if (this.logText === null || this.logNumbers === null) {
        this.makeLog();
      }

      this.logText!.show();
      this.logNumbers!.show();
      this.hide();
      globals.elements.stageFade.hide();

      globals.layers.UI2.batchDraw();
    });
  }

  private makeLog() {
    this.logText = new MultiFitText(this.textOptions, this.maxLines);
    this.add(this.logText as unknown as Konva.Group);
    this.logNumbers = new MultiFitText(this.numbersOptions, this.maxLines);
    this.add(this.logNumbers as unknown as Konva.Group);
  }

  private makePlayerLog(i: number) {
    const playerLog = new MultiFitText(this.textOptions, this.maxLines);
    playerLog.hide();
    this.playerLogs[i] = playerLog;
    this.add(playerLog as unknown as Konva.Group);

    const playerLogNumber = new MultiFitText(
      this.numbersOptions,
      this.maxLines,
    );
    playerLogNumber.hide();
    this.playerLogNumbers[i] = playerLogNumber;
    this.add(playerLogNumber as unknown as Konva.Group);
  }

  private refreshText() {
    if (this.logText === null || this.logNumbers === null) {
      this.makeLog();
    }

    for (const logEntry of this.buffer) {
      appendLine(
        this.logText!,
        this.logNumbers!,
        logEntry.turnNum,
        logEntry.text,
      );
      for (let i = 0; i < globals.options.numPlayers; i++) {
        if (logEntry.text.startsWith(globals.metadata.playerNames[i]!)) {
          if (this.playerLogs[i] === null) {
            this.makePlayerLog(i);
          }
          appendLine(
            this.playerLogs[i]!,
            this.playerLogNumbers[i]!,
            logEntry.turnNum,
            logEntry.text,
          );
          break;
        }
      }
    }

    this.logText!.refreshText();
    this.logNumbers!.refreshText();
    for (let i = 0; i < globals.options.numPlayers; i++) {
      this.playerLogs[i]?.refreshText();
      this.playerLogNumbers[i]?.refreshText();
    }
    this.buffer = [];
    this.needsRefresh = false;
  }

  reset(): void {
    this.buffer = [];
    this.logText?.reset();
    this.logNumbers?.reset();
    for (let i = 0; i < globals.options.numPlayers; i++) {
      this.playerLogs[i]?.reset();
      this.playerLogNumbers[i]?.reset();
    }
    this.needsRefresh = true;
  }
}

function appendLine(
  log: MultiFitText,
  numbers: MultiFitText,
  turn: number,
  line: string,
) {
  log.setMultiText(line);
  numbers.setMultiText(turn.toString());
}
