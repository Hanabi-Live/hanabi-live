import Konva from "konva";
import { ARROW_STROKE_WIDTH, FONT_FAMILY } from "../constants";

/** How far the shadow around the arrow's outline spreads, as a multiple of its pointer length. */
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

  base: Konva.Arrow;
  circle: Konva.Circle;
  text: Konva.Text;
  suitPip: Konva.Shape | null;

  constructor(winW: number, winH: number, colorblindMode: boolean) {
    const x = 0.1 * winW;
    const y = 0.1 * winH;
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

    const pointerLength = 0.006 * winW;
    const length = 0.8 * y;

    /** The middle of the circle that shows the clue, along the body of the arrow. */
    const circleY = 0.3 * y;

    // We want there to be a black outline around the arrow, so we draw a second arrow that is
    // slightly bigger than the first.
    const border = new Konva.Arrow({
      points: [x, 0, x, length],
      pointerLength,
      pointerWidth: pointerLength,
      fill: "black",
      stroke: "black",
      strokeWidth: pointerLength * ARROW_STROKE_WIDTH.OUTLINE,
      shadowBlur: pointerLength * SHADOW_BLUR_LENGTHS,
      shadowOpacity: 1,
      listening: false,
    });
    this.add(border);

    // The border arrow will be missing a bottom edge, so draw that manually at the bottom of the
    // arrow.
    const edge = new Konva.Line({
      points: [x - pointerLength, 0, x + pointerLength, 0],
      fill: "black",
      stroke: "black",
      strokeWidth: pointerLength * ARROW_STROKE_WIDTH.EDGE,
      listening: false,
    });
    this.add(edge);

    // The main (inside) arrow is exported so that we can change the color later.
    this.base = new Konva.Arrow({
      points: [x, 0, x, length],
      pointerLength,
      pointerWidth: pointerLength,
      fill: "white",
      stroke: "white",
      strokeWidth: pointerLength * ARROW_STROKE_WIDTH.BODY,
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
