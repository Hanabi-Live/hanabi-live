import { assertNotNull } from "@hanabi/utils";
import Konva from "konva";
import { drawLayer } from "../konvaHelpers";
import { FitText } from "./FitText";

export class Button extends Konva.Group {
  enabled = true;
  pressed = false;
  assignedTextSize = false;

  background: Konva.Rect;
  textElement: FitText | null = null;
  imageElement: Konva.Image | null = null;
  imageDisabledElement: Konva.Image | null = null;

  tooltipName = "";
  tooltipContent = "";

  constructor(
    config: Konva.ContainerConfig,
    images?: readonly HTMLImageElement[],
  ) {
    super(config);
    this.listening(true);

    const w = this.width();
    const h = this.height();
    const textSize = (config["fontSize"] as number | undefined) ?? 0.5 * h;
    if (config["fontSize"] !== undefined) {
      this.assignedTextSize = true;
    }

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

    this.textElement = null;
    this.imageElement = null;
    if (config["text"] !== undefined) {
      this.textElement = new FitText({
        x: 0,
        y: (0.525 - textSize / 2 / h) * h, // A smidgeon higher than vertically centered
        width: w,
        height: 0.5 * h,
        fontSize: textSize,
        fontFamily: "Verdana",
        fill: "white",
        align: "center",
        text: config["text"] as string,
        listening: false,
      });
      this.add(this.textElement);
    } else if (images !== undefined && images.length > 0) {
      this.imageElement = new Konva.Image({
        x: 0.2 * w,
        y: 0.2 * h,
        width: 0.6 * w,
        height: 0.6 * h,
        image: images[0]!,
        listening: false,
      });
      this.add(this.imageElement);

      if (images.length >= 2) {
        this.imageDisabledElement = new Konva.Image({
          x: 0.2 * w,
          y: 0.2 * h,
          width: 0.6 * w,
          height: 0.6 * h,
          image: images[1]!,
          visible: false,
          listening: false,
        });
        this.add(this.imageDisabledElement);
      }
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

    if (this.imageElement !== null && this.imageDisabledElement !== null) {
      this.imageElement.visible(enabled);
      this.imageDisabledElement.visible(!enabled);
    }

    this.background.listening(enabled);

    drawLayer(this);
  }

  setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.background.fill(pressed ? "#cccccc" : "black");
    drawLayer(this);
  }

  text(newText: string): void {
    assertNotNull(
      this.textElement,
      'The "text()" method was called on a non-text Button.',
    );

    if (this.assignedTextSize) {
      this.textElement.text(newText);
    } else {
      // Resize to fit the new text if we haven't been specifically given a size.
      this.textElement.fitText(newText);
    }
  }

  fill(newFill: string): void {
    assertNotNull(
      this.textElement,
      'The "fill()" method was called on a non-text Button.',
    );

    this.textElement.fill(newFill);
  }

  setImage(image: HTMLImageElement): void {
    this.imageElement?.image(image);
    this.draw();
  }
}
