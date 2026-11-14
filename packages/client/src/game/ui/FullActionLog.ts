import type { NumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { assertDefined, eRange, newArray } from "complete-common";
import Konva from "konva";
import type { ContainerConfig } from "konva/lib/Container";
import { getCanvasColors } from "../../theme.ts";
import { MultiFitText } from "./MultiFitText.ts";
import { globals } from "./UiGlobals.ts";
import { FONT_FAMILY, PANEL_CORNER_RADIUS } from "./constants.ts";
import { FitText } from "./controls/FitText.ts";

/** The opacity of the log's background, which mostly hides the board behind it. */
const BACKGROUND_OPACITY = 0.9;

/** The lines that the log shows. Its font size is set so that they fill its height. */
const MAX_LINES = 38;

/** The log's position and size, in fractions of the stage. It spans the full stage height. */
const FULL_ACTION_LOG = {
  x: 0.2,
  w: 0.4,
  marginY: 0.02,
} as const;

/** The log's text, in fractions of the stage. */
const FULL_ACTION_LOG_TEXT = {
  /** The margin between the edges of the log and its text and turn numbers. */
  margin: 0.01,
  /** The width of the turn number column, to the left of the text. */
  numbersW: 0.03,
} as const;

export class FullActionLog extends Konva.Group {
  buffer: Array<{ turnNum: number; text: string }> = [];
  logText: MultiFitText | undefined = undefined;
  logNumbers: MultiFitText | undefined = undefined;
  playerLogEmptyMessage: FitText;
  private playerLogs: Tuple<MultiFitText | undefined, NumPlayers>;
  private playerLogNumbers: Tuple<MultiFitText | undefined, NumPlayers>;
  private needsRefresh = false;
  private readonly numbersOptions: ContainerConfig;
  private readonly textOptions: ContainerConfig;

  constructor(winW: number, winH: number) {
    // The log fills the height of the stage, with an equal margin above and below.
    const width = FULL_ACTION_LOG.w * winW;
    const height = (1 - 2 * FULL_ACTION_LOG.marginY) * winH;
    super({
      x: FULL_ACTION_LOG.x * winW,
      y: FULL_ACTION_LOG.marginY * winH,
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
    const { margin } = FULL_ACTION_LOG_TEXT;
    const textHeight = height - 2 * margin * winH;
    const fontSize = textHeight / MAX_LINES;
    const numbersX = margin;
    const textX = numbersX + FULL_ACTION_LOG_TEXT.numbersW;

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
      width: FULL_ACTION_LOG_TEXT.numbersW * winW,
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

    this.playerLogs = newArray(globals.options.numPlayers, undefined) as Tuple<
      undefined,
      NumPlayers
    >;
    this.playerLogNumbers = newArray(
      globals.options.numPlayers,
      undefined,
    ) as Tuple<undefined, NumPlayers>;
  }

  addMessage(turn: number, msg: string): void {
    this.buffer.push({
      turnNum: turn,
      text: msg,
    });
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

    if (this.playerLogs[playerIndex] === undefined) {
      this.playerLogEmptyMessage.show();
    } else {
      this.playerLogs[playerIndex].show();
      this.playerLogNumbers[playerIndex]!.show();
    }

    this.show();

    assertDefined(
      globals.elements.stageFade,
      'The "stageFade" element was not initialized.',
    );
    globals.elements.stageFade.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade.on("click tap", () => {
      assertDefined(
        globals.elements.stageFade,
        'The "stageFade" element was not initialized.',
      );
      globals.elements.stageFade.off("click tap");
      this.playerLogEmptyMessage.hide();
      this.playerLogs[playerIndex]?.hide();
      this.playerLogNumbers[playerIndex]?.hide();

      if (this.logText === undefined || this.logNumbers === undefined) {
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
    this.add(this.logText);
    this.logNumbers = new MultiFitText(this.numbersOptions, MAX_LINES);
    this.add(this.logNumbers);
  }

  private makePlayerLog(i: number) {
    const playerLog = new MultiFitText(this.textOptions, MAX_LINES);
    playerLog.hide();
    this.playerLogs[i] = playerLog;
    this.add(playerLog);

    const playerLogNumber = new MultiFitText(this.numbersOptions, MAX_LINES);
    playerLogNumber.hide();
    this.playerLogNumbers[i] = playerLogNumber;
    this.add(playerLogNumber);
  }

  private refreshText() {
    if (this.logText === undefined || this.logNumbers === undefined) {
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
          if (this.playerLogs[playerIndex] === undefined) {
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
