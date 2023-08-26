import { assertNotNull } from "@hanabi/utils";
import Konva from "konva";
import { globals } from "../UIGlobals";
import { drawLayer } from "../konvaHelpers";

export class CheckButton extends Konva.Group {
  enabled = true;
  pressed = false;

  background: Konva.Rect;
  checkImageOn: Konva.Image | null = null;
  checkImageOff: Konva.Image | null = null;
  checkImageOnDisabled: Konva.Image | null = null;
  checkImageOffDisabled: Konva.Image | null = null;
  textElement: Konva.Text | null = null;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    const w = this.width();
    const h = this.height();
    const textSize = (config["fontSize"] as number | undefined) ?? 0.5 * h;

    this.background = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      cornerRadius: 0.12 * h,
      fill: "black",
      opacity: 0.6,
      listening: true,
    });
    this.add(this.background);

    const checkY = 0.325 * h;
    const checkX = checkY / 2.5;
    const checkH = 0.35 * h;
    const checkW = checkH;

    this.checkImageOn = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-on")!,
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOn);

    this.checkImageOff = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-off")!,
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOff);

    this.checkImageOnDisabled = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-on-disabled")!,
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOnDisabled);

    this.checkImageOffDisabled = new Konva.Image({
      x: checkX,
      y: checkY,
      width: checkW,
      height: checkH,
      image: globals.imageLoader!.get("checkbox-off-disabled")!,
      listening: false,
      visible: false,
    });
    this.add(this.checkImageOffDisabled);

    this.updateImageVisibility();

    this.textElement = null;
    if (config["text"] !== undefined) {
      this.textElement = new Konva.Text({
        x: checkW + checkX * 1.5,
        y: (0.525 - textSize / 2 / h) * h, // A smidgeon higher than vertically centered
        width: w,
        height: 0.5 * h,
        fontSize: textSize,
        fontFamily: "Verdana",
        fill: "white",
        align: "left",
        text: config["text"] as string,
        listening: false,
      });
      this.add(this.textElement);
    }

    this.background.on("mousedown", () => {
      this.background.fill("#888888");
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

    if (this.textElement !== null) {
      this.textElement.fill(enabled ? "white" : "#444444");
    }

    this.background.listening(enabled);
    this.updateImageVisibility();
    drawLayer(this);
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.background.fill(pressed ? "#cccccc" : "black");
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
    assertNotNull(
      this.textElement,
      'The "text()" method was called on a non-text Button.',
    );

    this.textElement.text(newText);
  }

  fill(newFill: string): void {
    assertNotNull(
      this.textElement,
      'The "fill()" method was called on a non-text Button.',
    );

    this.textElement.fill(newFill);
  }
}
