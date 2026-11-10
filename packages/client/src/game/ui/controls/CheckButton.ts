import { assertDefined } from "complete-common";
import Konva from "konva";
import { globals } from "../UIGlobals";
import {
  BUTTON_CORNER_RADIUS,
  BUTTON_DISABLED_TEXT_COLOR,
  BUTTON_HOVER_COLOR,
  BUTTON_OPACITY,
  BUTTON_PRESSED_COLOR,
  BUTTON_TEXT_MIDDLE,
  BUTTON_TEXT_SIZE,
  FONT_FAMILY,
} from "../constants";
import { drawLayer } from "../konvaHelpers";

/** The size of the checkbox, as a fraction of the button's height. It is centered vertically. */
const CHECKBOX_SIZE = 0.35;

/**
 * The gap between the button's left edge and the checkbox, as a fraction of the button's height.
 */
const CHECKBOX_MARGIN = 0.13;

/** The gap between the checkbox and the text, as a fraction of the button's height. */
const CHECKBOX_TEXT_GAP = CHECKBOX_MARGIN / 2;

export class CheckButton extends Konva.Group {
  enabled = true;
  pressed = false;

  background: Konva.Rect;
  checkImageOn: Konva.Image | undefined = undefined;
  checkImageOff: Konva.Image | undefined = undefined;
  checkImageOnDisabled: Konva.Image | undefined = undefined;
  checkImageOffDisabled: Konva.Image | undefined = undefined;
  textElement: Konva.Text | undefined = undefined;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    const w = this.width();
    const h = this.height();
    const textSize =
      (config["fontSize"] as number | undefined) ?? BUTTON_TEXT_SIZE * h;

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

    const checkH = CHECKBOX_SIZE * h;
    const checkW = checkH;
    const checkX = CHECKBOX_MARGIN * h;
    const checkY = (h - checkH) / 2;

    this.checkImageOn = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-on"),
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOn);

    this.checkImageOff = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-off"),
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOff);

    this.checkImageOnDisabled = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-on-disabled"),
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOnDisabled);

    this.checkImageOffDisabled = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-off-disabled"),
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOffDisabled);

    this.updateImageVisibility();

    this.textElement = undefined;
    if (config["text"] !== undefined) {
      this.textElement = new Konva.Text({
        x: checkX + checkW + CHECKBOX_TEXT_GAP * h,
        y: (BUTTON_TEXT_MIDDLE - textSize / 2 / h) * h,
        width: w,
        height: BUTTON_TEXT_SIZE * h,
        fontSize: textSize,
        fontFamily: FONT_FAMILY,
        fill: "white",
        align: "left",
        text: config["text"] as string,
        listening: false,
      });
      this.add(this.textElement);
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

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;

    if (this.textElement !== undefined) {
      this.textElement.fill(enabled ? "white" : BUTTON_DISABLED_TEXT_COLOR);
    }

    this.background.listening(enabled);
    this.updateImageVisibility();
    drawLayer(this);
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.background.fill(pressed ? BUTTON_PRESSED_COLOR : "black");
    this.updateImageVisibility();
    drawLayer(this);
  }

  updateImageVisibility(): void {
    this.checkImageOn?.visible(this.enabled && this.pressed);
    this.checkImageOff?.visible(this.enabled && !this.pressed);
    this.checkImageOnDisabled?.visible(!this.enabled && this.pressed);
    this.checkImageOffDisabled?.visible(!this.enabled && !this.pressed);
  }

  text(newText: string): void {
    assertDefined(
      this.textElement,
      'The "text()" method was called on a non-text Button.',
    );

    this.textElement.text(newText);
  }

  fill(newFill: string): void {
    assertDefined(
      this.textElement,
      'The "fill()" method was called on a non-text Button.',
    );

    this.textElement.fill(newFill);
  }
}
