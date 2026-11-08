import type { Clue, Suit, Variant } from "@hanabi-live/game";
import { isDualColor } from "@hanabi-live/game";
import Konva from "konva";
import type * as KonvaContext from "konva/types/Context";
import { globals } from "./UIGlobals";
import {
  BUTTON_CORNER_RADIUS,
  BUTTON_HOVER_COLOR,
  BUTTON_OPACITY,
  BUTTON_PRESSED_COLOR,
  BUTTON_TEXT_MIDDLE,
  BUTTON_TEXT_SIZE,
  FONT_FAMILY,
} from "./constants";
import { drawPip } from "./drawPip";
import { drawLayer } from "./konvaHelpers";

export class ColorButton extends Konva.Group {
  pressed = false;
  clue: Clue;

  background: Konva.Rect;

  constructor(config: Konva.ContainerConfig, suit: Suit, variant: Variant) {
    super(config);
    this.listening(true);

    this.clue = config["clue"] as Clue;

    const w = this.width();
    const h = this.height();

    this.background = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      cornerRadius: BUTTON_CORNER_RADIUS * h,
      fill: "black",
      opacity: BUTTON_OPACITY,
      listening: true,
    });
    this.add(this.background);

    // The color fills the middle of the button, with an equal margin on every side.
    const colorScale = 0.8;
    const colorMargin = (1 - colorScale) / 2;
    const backgroundColor = new Konva.Rect({
      x: colorMargin * w,
      y: colorMargin * h,
      width: colorScale * w,
      height: colorScale * h,
      cornerRadius: BUTTON_CORNER_RADIUS * colorScale * h,
      fill: config["color"] as string | undefined,
      opacity: 0.9,
      listening: false,
    });
    this.add(backgroundColor);

    if (globals.lobby.settings.colorblindMode) {
      if (isDualColor(globals.variant)) {
        // For Dual-Color variants, draw the color abbreviation (as text).
        const text = new Konva.Text({
          x: 0,
          y: (BUTTON_TEXT_MIDDLE - BUTTON_TEXT_SIZE / 2) * h,
          width: w,
          height: 0.6 * h,
          fontSize: BUTTON_TEXT_SIZE * h,
          fontFamily: FONT_FAMILY,
          fill: "white",
          stroke: "black",
          strokeWidth: 0.014_87 * h,
          align: "center",
          text: config["text"] as string | undefined,
          listening: false,
        });
        this.add(text);
      } else {
        // Draw the suit pip that corresponds to this color, centered on the button. The offset is
        // in the shape's unscaled units.
        const suitPipScale = 0.25;
        const suitPip = new Konva.Shape({
          scale: {
            x: suitPipScale,
            y: suitPipScale,
          },
          offset: {
            x: -w / 2 / suitPipScale,
            y: -h / 2 / suitPipScale,
          },
          sceneFunc: (ctx: KonvaContext.Context) => {
            drawPip(ctx as unknown as CanvasRenderingContext2D, suit, variant);
          },
          listening: false,
        });
        this.add(suitPip);
      }
    }

    this.background.on("mousedown", () => {
      this.background.fill(BUTTON_HOVER_COLOR);
      drawLayer(this);

      this.background.on("mouseout", () => {
        this.resetButton();
      });
      this.background.on("mouseup", () => {
        this.resetButton();
      });
    });
  }

  resetButton(): void {
    this.background.fill("black");
    drawLayer(this);

    this.background.off("mouseup");
    this.background.off("mouseout");
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.background.fill(pressed ? BUTTON_PRESSED_COLOR : "black");
    drawLayer(this);
  }
}
