import Konva from "konva";
import {
  BUTTON_CORNER_RADIUS,
  BUTTON_DISABLED_TEXT_COLOR,
  BUTTON_HOVER_COLOR,
  BUTTON_OPACITY,
  FONT_FAMILY,
  MIN_FONT_SIZE,
} from "../constants.ts";
import { drawLayer } from "../konvaHelpers.ts";

/** The space to the left of the box, as a fraction of the checkbox's height. */
const PADDING = 0.24;

/** The space to the right of the label, as a fraction of the checkbox's height. */
const LABEL_PADDING = 0.12;

/** The size of the box, as a fraction of the checkbox's height. */
const BOX_SIZE = 0.44;

/** The space between the box and the label, as a fraction of the checkbox's height. */
const GAP = 0.2;

/** The default size of the label, as a fraction of the checkbox's height. A long label wraps. */
const LABEL_SIZE = 0.4;

/** The size of an image label, as a fraction of the checkbox's height. */
const IMAGE_SIZE = 0.6;

/** The opacity of an image label while the checkbox is disabled. */
const DISABLED_IMAGE_OPACITY = 0.35;

/** How much a label shrinks at each step while it does not fit. */
const LABEL_SHRINK_FACTOR = 0.95;

/** The width of the box's border and of the check mark, as a fraction of the box's size. */
const LINE_WIDTH = 0.12;

/** The corner radius of the box, as a fraction of the box's size. */
const BOX_CORNER_RADIUS = 0.18;

/** The points of the check mark, as fractions of the box's size. */
const CHECK_MARK_POINTS = [0.22, 0.52, 0.42, 0.72, 0.78, 0.3] as const;

const COLOR = "white";
const CHECK_MARK_COLOR = "black";

/**
 * A box with a label (text or an image), which turns a setting on or off. The owner sets whether it
 * is checked, so that it always shows the state.
 */
export class Checkbox extends Konva.Group {
  checked = false;
  enabled = true;

  tooltipName = "";
  tooltipContent = "";

  private readonly background: Konva.Rect;
  private readonly box: Konva.Rect;
  private readonly checkMark: Konva.Line;
  private readonly label: Konva.Text | Konva.Image;

  /** The label is text or an image. A text label can have its own font size. */
  constructor(
    config: Konva.ContainerConfig,
    label: string | HTMLImageElement,
    fontSize?: number,
  ) {
    super(config);
    this.listening(true);

    const w = this.width();
    const h = this.height();
    const boxSize = BOX_SIZE * h;
    const boxX = PADDING * h;
    const boxY = (h - boxSize) / 2;
    const lineWidth = LINE_WIDTH * boxSize;

    this.background = new Konva.Rect({
      width: w,
      height: h,
      cornerRadius: BUTTON_CORNER_RADIUS * h,
      fill: "black",
      opacity: BUTTON_OPACITY,
      listening: true,
    });
    this.add(this.background);

    this.box = new Konva.Rect({
      x: boxX,
      y: boxY,
      width: boxSize,
      height: boxSize,
      cornerRadius: BOX_CORNER_RADIUS * boxSize,
      strokeWidth: lineWidth,
      listening: false,
    });
    this.add(this.box);

    this.checkMark = new Konva.Line({
      x: boxX,
      y: boxY,
      points: CHECK_MARK_POINTS.map((point) => point * boxSize),
      stroke: CHECK_MARK_COLOR,
      strokeWidth: lineWidth * 1.5,
      lineCap: "round",
      lineJoin: "round",
      listening: false,
    });
    this.add(this.checkMark);

    const labelX = boxX + boxSize + GAP * h;
    const labelW = w - labelX - LABEL_PADDING * h;
    this.label =
      typeof label === "string"
        ? this.createTextLabel(
            label,
            labelX,
            labelW,
            fontSize ?? LABEL_SIZE * h,
          )
        : this.createImageLabel(label, labelX, labelW);
    this.add(this.label);

    this.background.on("mousedown", () => {
      this.background.fill(BUTTON_HOVER_COLOR);
      drawLayer(this);
      this.background.on("mouseout mouseup", () => {
        this.background.fill("black");
        this.background.off("mouseout mouseup");
        drawLayer(this);
      });
    });

    this.updateStyle();
  }

  /** A square image, centered in the space for the label. */
  private createImageLabel(
    image: HTMLImageElement,
    x: number,
    width: number,
  ): Konva.Image {
    const h = this.height();
    const size = Math.min(IMAGE_SIZE * h, width);
    return new Konva.Image({
      x: x + (width - size) / 2,
      y: (h - size) / 2,
      width: size,
      height: size,
      image,
      listening: false,
    });
  }

  private createTextLabel(
    text: string,
    x: number,
    width: number,
    fontSize: number,
  ): Konva.Text {
    const label = new Konva.Text({
      x,
      width,
      height: this.height(),
      fontSize,
      fontFamily: FONT_FAMILY,
      verticalAlign: "middle",
      text,
      listening: false,
    });

    // A label wraps between words. Shrink it until each word fits on a line, and every line fits in
    // the height. (Konva leaves out the lines that do not fit.)
    const words = text.split(" ");
    function labelFits() {
      return (
        words.every((word) => label.measureSize(word).width <= width)
        && label.textArr.map((line) => line.text).join(" ") === text
      );
    }
    while (!labelFits() && label.fontSize() > MIN_FONT_SIZE) {
      label.fontSize(label.fontSize() * LABEL_SHRINK_FACTOR);
    }

    return label;
  }

  setChecked(checked: boolean): void {
    this.checked = checked;
    this.updateStyle();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.background.listening(enabled);
    this.updateStyle();
  }

  private updateStyle(): void {
    const color = this.enabled ? COLOR : BUTTON_DISABLED_TEXT_COLOR;
    this.box.stroke(color);
    this.box.fill(this.checked ? color : "");
    this.checkMark.visible(this.checked);
    if (this.label instanceof Konva.Text) {
      this.label.fill(color);
    } else {
      this.label.opacity(this.enabled ? 1 : DISABLED_IMAGE_OPACITY);
    }
    drawLayer(this);
  }
}
