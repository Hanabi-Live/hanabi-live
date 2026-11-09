import type { NumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { assertNotNull, eRange, newArray } from "complete-common";
import Konva from "konva";
import type { ContainerConfig } from "konva/types/Container";
import { getCanvasColors } from "../../theme";
import { MultiFitText } from "./MultiFitText";
import { globals } from "./UIGlobals";
import { FONT_FAMILY, PANEL_CORNER_RADIUS } from "./constants";
import { FitText } from "./controls/FitText";

/** The opacity of the log's background, which mostly hides the board behind it. */
const BACKGROUND_OPACITY = 0.9;

/** The lines that the log shows. Its font size is set so that they fill its height. */
const MAX_LINES = 38;

export class FullActionLog extends Konva.Group {
  buffer: Array<{ turnNum: number; text: string }> = [];
  logText: MultiFitText | null = null;
  logNumbers: MultiFitText | null = null;
  playerLogEmptyMessage: FitText;
  private playerLogs: Tuple<MultiFitText | null, NumPlayers>;
  private playerLogNumbers: Tuple<MultiFitText | null, NumPlayers>;
  private needsRefresh = false;
  private readonly numbersOptions: ContainerConfig;
  private readonly textOptions: ContainerConfig;

  constructor(winW: number, winH: number) {
    // The log fills the height of the stage, with an equal margin above and below.
    const marginY = 0.02;
    const width = 0.4 * winW;
    const height = (1 - 2 * marginY) * winH;
    super({
      x: 0.2 * winW,
      y: marginY * winH,
      width,
      height,
      clipX: 0,
      clipY: 0,
      clipWidth: width,
      clipHeight: height,
      visible: false,
      listening: false,
    });

    // The black background
    const rect = new Konva.Rect({
      x: 0,
      y: 0,
      width,
      height,
      fill: "black",
      opacity: BACKGROUND_OPACITY,
      cornerRadius: PANEL_CORNER_RADIUS * winW,
      listening: false,
    });
    Konva.Group.prototype.add.call(this, rect);

    // The turn numbers sit in a narrow column to the left of the text. The text and the numbers
    // keep the same margin from the edges of the log.
    const margin = 0.01;
    const textHeight = height - 2 * margin * winH;
    const fontSize = textHeight / MAX_LINES;
    const numbersX = margin;
    const numbersWidth = 0.03;
    const textX = numbersX + numbersWidth;

    // The text for each action.
    this.textOptions = {
      fontSize,
      fontFamily: FONT_FAMILY,
      fill: "white",
      x: textX * winW,
      y: margin * winH,
      width: width - (textX + margin) * winW,
      height: textHeight,
      listening: false,
    };

    // The turn numbers for each action.
    this.numbersOptions = {
      fontSize,
      fontFamily: FONT_FAMILY,
      fill: getCanvasColors().actionLogNumber,
      x: numbersX * winW,
      y: margin * winH,
      width: numbersWidth * winW,
      height: textHeight,
      listening: false,
    };

    // The text displayed when the selected player hasn't taken any actions.
    this.playerLogEmptyMessage = new FitText(this.textOptions);
    this.playerLogEmptyMessage.fitText(
      "This player has not taken any actions yet.",
    );
    this.playerLogEmptyMessage.hide();
    this.add(this.playerLogEmptyMessage);

    this.playerLogs = newArray(globals.options.numPlayers, null) as Tuple<
      null,
      NumPlayers
    >;
    this.playerLogNumbers = newArray(globals.options.numPlayers, null) as Tuple<
      null,
      NumPlayers
    >;
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

    assertNotNull(
      globals.elements.stageFade,
      'The "stageFade" element was not initialized.',
    );
    globals.elements.stageFade.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade.on("click tap", () => {
      assertNotNull(
        globals.elements.stageFade,
        'The "stageFade" element was not initialized.',
      );
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
    this.logText = new MultiFitText(this.textOptions, MAX_LINES);
    this.add(this.logText as unknown as Konva.Group);
    this.logNumbers = new MultiFitText(this.numbersOptions, MAX_LINES);
    this.add(this.logNumbers as unknown as Konva.Group);
  }

  private makePlayerLog(i: number) {
    const playerLog = new MultiFitText(this.textOptions, MAX_LINES);
    playerLog.hide();
    this.playerLogs[i] = playerLog;
    this.add(playerLog as unknown as Konva.Group);

    const playerLogNumber = new MultiFitText(this.numbersOptions, MAX_LINES);
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
      for (const playerIndex of eRange(globals.options.numPlayers)) {
        if (
          logEntry.text.startsWith(globals.metadata.playerNames[playerIndex]!)
        ) {
          if (this.playerLogs[playerIndex] === null) {
            this.makePlayerLog(playerIndex);
          }
          appendLine(
            this.playerLogs[playerIndex]!,
            this.playerLogNumbers[playerIndex]!,
            logEntry.turnNum,
            logEntry.text,
          );
          break;
        }
      }
    }

    this.logText!.refreshText();
    this.logNumbers!.refreshText();
    for (const playerIndex of eRange(globals.options.numPlayers)) {
      this.playerLogs[playerIndex]?.refreshText();
      this.playerLogNumbers[playerIndex]?.refreshText();
    }
    this.buffer = [];
    this.needsRefresh = false;
  }

  reset(): void {
    this.buffer = [];
    this.logText?.reset();
    this.logNumbers?.reset();
    for (const playerIndex of eRange(globals.options.numPlayers)) {
      this.playerLogs[playerIndex]?.reset();
      this.playerLogNumbers[playerIndex]?.reset();
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
