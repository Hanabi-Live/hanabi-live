import { assertNotNull } from "complete-common";
import Konva from "konva";
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
import { FitText } from "./FitText";

/** How much of the button's width and height its image fills, centered with an equal margin. */
const BUTTON_IMAGE_SCALE = 0.6;

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
    const textSize =
      (config["fontSize"] as number | undefined) ?? BUTTON_TEXT_SIZE * h;
    if (config["fontSize"] !== undefined) {
      this.assignedTextSize = true;
    }

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

    this.textElement = null;
    this.imageElement = null;
    if (config["text"] !== undefined) {
      this.textElement = new FitText({
        x: 0,
        y: (BUTTON_TEXT_MIDDLE - textSize / 2 / h) * h,
        width: w,
        height: BUTTON_TEXT_SIZE * h,
        fontSize: textSize,
        fontFamily: FONT_FAMILY,
        fill: "white",
        align: "center",
        text: config["text"] as string,
        listening: false,
      });
      this.add(this.textElement);
    } else if (images !== undefined && images.length > 0) {
      // The image fills the middle of the button, with an equal margin on every side.
      const imageScale = BUTTON_IMAGE_SCALE;
      const imageMargin = (1 - imageScale) / 2;
      const imageBox = {
        x: imageMargin * w,
        y: imageMargin * h,
        width: imageScale * w,
        height: imageScale * h,
      };
      this.imageElement = new Konva.Image({
        ...imageBox,
        image: images[0]!,
        listening: false,
      });
      this.add(this.imageElement);

      if (images.length >= 2) {
        this.imageDisabledElement = new Konva.Image({
          ...imageBox,
          image: images[1]!,
          visible: false,
          listening: false,
        });
        this.add(this.imageDisabledElement);
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

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;

    if (this.textElement !== null) {
      this.textElement.fill(enabled ? "white" : BUTTON_DISABLED_TEXT_COLOR);
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
    this.background.fill(pressed ? BUTTON_PRESSED_COLOR : "black");
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
