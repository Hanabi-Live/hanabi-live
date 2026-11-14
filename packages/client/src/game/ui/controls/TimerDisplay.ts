import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import {
  FONT_FAMILY,
  LABEL_COLOR,
  PANEL_OPACITY,
  TEXT_SHADOW,
  TIMER_WARNING_OPACITY,
  WARNING_COLOR,
} from "../constants.ts";
import { FitText } from "./FitText.ts";

/** The background of a timer that is not flashing a warning. */
const PANEL_COLOR = "black";

/** How far down the label below the time is, as a multiple of the timer's vertical spacing. */
const LABEL_Y_SPACES = 6;

export class TimerDisplay extends Konva.Group {
  private readonly oval: Konva.Rect;
  private warningFlashOn = false;

  timerText: FitText;
  labelText: FitText;

  tooltipName?: GameTooltipName;
  tooltipContent = "";

  constructor(config: Konva.ContainerConfig) {
    super(config);

    this.oval = new Konva.Rect({
      x: 0,
      y: 0,
      width: config.width,
      height: config.height,
      fill: PANEL_COLOR,
      cornerRadius: config["cornerRadius"] as number | number[] | undefined,
      opacity: PANEL_OPACITY,
      listening: true,
    });
    this.add(this.oval);

    this.timerText = new FitText({
      x: 0,
      y: config["spaceH"] as number | undefined,
      width: config.width,
      height: config.height,
      fontSize: config["fontSize"] as number | undefined,
      fontFamily: FONT_FAMILY,
      align: "center",
      text: "??:??",
      fill: LABEL_COLOR,
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.timerText);

    this.labelText = new FitText({
      x: 0,
      y: LABEL_Y_SPACES * config["spaceH"],
      width: config.width,
      height: config.height,
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
      fontSize: (config["labelFontSize"] || config["fontSize"]) as
        number | undefined,
      fontFamily: FONT_FAMILY,
      align: "center",
      text: config["label"] as string | undefined,
      fill: LABEL_COLOR,
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.labelText);
  }

  private setWarningFlash(on: boolean): void {
    this.warningFlashOn = on;
    this.oval
      .fill(on ? WARNING_COLOR : PANEL_COLOR)
      .opacity(on ? TIMER_WARNING_OPACITY : PANEL_OPACITY);
  }

  setTimerText(text: string): void {
    this.timerText.fitText(text);
  }

  setLabelText(text: string): void {
    this.labelText.fitText(text);
  }

  /** Switches the background between the normal panel and the red that warns of low time. */
  toggleWarningFlash(): void {
    this.setWarningFlash(!this.warningFlashOn);
  }

  /** Restores the normal background. */
  clearWarningFlash(): void {
    this.setWarningFlash(false);
  }
}
