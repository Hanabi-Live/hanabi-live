import Konva from "konva";
import { ARROW_STROKE_WIDTH, FONT_FAMILY } from "../constants";
import { outlinedArrow } from "./outlinedArrow";

/**
 * The point that the arrow is positioned and rotated around, relative to the end of its tail, as a
 * fraction of the stage. The arrow points straight along it before rotating.
 */
const ORIGIN_OFFSET = 0.1;

/** The length of the arrow's pointer, as a fraction of the stage width. */
const POINTER_LENGTH = 0.006;

/** The length of the arrow, as a fraction of its vertical offset. */
const LENGTH = 0.8;

/**
 * The middle of the circle that shows the clue, along the arrow, as a fraction of its vertical
 * offset.
 */
const CIRCLE_Y = 0.3;

/** How far the shadow around the arrow spreads, as a multiple of its pointer length. */
const SHADOW_BLUR_LENGTHS = 4;

/** The outline of the circle that shows the clue, as a multiple of the arrow's pointer length. */
const CIRCLE_STROKE_WIDTH_LENGTHS = 0.25;

/** The radius of the circle that shows the clue, as a multiple of the arrow's pointer length. */
const CIRCLE_RADIUS_LENGTHS = 2.25;

/**
 * The height of the clue number's text box, as a multiple of the circle's height. Text centered
 * exactly in the circle sits slightly high, so the taller box nudges it down.
 */
const CIRCLE_TEXT_HEIGHT = 1.09;

/**
 * The font size of the clue number, as a fraction of the arrow's offset from its group's origin.
 */
const CIRCLE_FONT_SIZE = 0.38;

/** The scale of the suit pip that replaces the clue number in colorblind mode. */
const CIRCLE_SUIT_PIP_SCALE = 0.2;

// These are arrows used to show which cards that are touched by a clue (and for pointing to various
// things in a shared replay).
export class Arrow extends Konva.Group {
  pointingTo: Konva.Node | null;
  tween: Konva.Tween | null;

  base: Konva.Shape;
  circle: Konva.Circle;
  text: Konva.Text;
  suitPip: Konva.Shape | null;

  constructor(winW: number, winH: number, colorblindMode: boolean) {
    const x = ORIGIN_OFFSET * winW;
    const y = ORIGIN_OFFSET * winH;
    super({
      x,
      y,
      offset: {
        x,
        y,
      },
      visible: false,
      listening: false,
    });

    // Class variables. (We can't initialize these above due to "super()" not being on the first
    // line.)
    this.pointingTo = null;
    this.tween = null;

    const pointerLength = POINTER_LENGTH * winW;
    const length = LENGTH * y;
    const circleY = CIRCLE_Y * y;

    // The arrow is exported so that we can change its color later.
    this.base = outlinedArrow({
      points: [x, 0, x, length],
      pointerLength,
      pointerWidth: pointerLength,
      bodyWidth: pointerLength * ARROW_STROKE_WIDTH.BODY,
      outlineWidth: pointerLength * ARROW_STROKE_WIDTH.OUTLINE,
      fill: "white",
      shadowBlur: pointerLength * SHADOW_BLUR_LENGTHS,
      shadowOpacity: 1,
      listening: false,
    });
    this.add(this.base);

    // A circle will appear on the body of the arrow to indicate the type of clue given.
    this.circle = new Konva.Circle({
      x,
      y: circleY,
      radius: pointerLength * CIRCLE_RADIUS_LENGTHS,
      fill: "black",
      stroke: "white",
      strokeWidth: pointerLength * CIRCLE_STROKE_WIDTH_LENGTHS,
      visible: false,
      listening: false,
    });
    this.add(this.circle);

    // The circle will have text inside of it to indicate the number of the clue given.
    this.text = new Konva.Text({
      x,
      y: circleY,
      offset: {
        x: this.circle.width() / 2,
        y: this.circle.height() / 2,
      },
      width: this.circle.width(),
      height: this.circle.height() * CIRCLE_TEXT_HEIGHT,
      fontSize: y * CIRCLE_FONT_SIZE,
      fontFamily: FONT_FAMILY,
      fill: "white",
      align: "center",
      verticalAlign: "middle",
      visible: false,
      listening: false,
    });
    this.add(this.text);

    // In colorblind mode, the circle will show the suit pip corresponding to the color.
    if (colorblindMode) {
      this.suitPip = new Konva.Shape({
        x,
        y: circleY,
        scale: {
          x: CIRCLE_SUIT_PIP_SCALE,
          y: CIRCLE_SUIT_PIP_SCALE,
        },
        visible: false,
        listening: false,
      });
      this.add(this.suitPip);
    } else {
      this.suitPip = null;
    }
  }
}
