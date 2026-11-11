import type { Clue } from "@hanabi-live/game";
import Konva from "konva";
import {
  BUTTON_CORNER_RADIUS,
  BUTTON_HOVER_COLOR,
  BUTTON_OPACITY,
  BUTTON_PRESSED_COLOR,
  BUTTON_TEXT_MIDDLE,
  BUTTON_TEXT_SIZE,
  FONT_FAMILY,
} from "./constants.ts";
import { drawLayer } from "./konvaHelpers.ts";

export class RankButton extends Konva.Group {
  pressed = false;
  clue: Clue;
  background: Konva.Rect;

  constructor(config: Konva.ContainerConfig) {
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

    const text = new Konva.Text({
      x: 0,
      y: (BUTTON_TEXT_MIDDLE - BUTTON_TEXT_SIZE / 2) * h,
      width: w,
      height: BUTTON_TEXT_SIZE * h,
      fontSize: BUTTON_TEXT_SIZE * h,
      fontFamily: FONT_FAMILY,
      fill: "white",
      align: "center",
      text: config["label"] as string,
      listening: false,
    });
    this.add(text);

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
