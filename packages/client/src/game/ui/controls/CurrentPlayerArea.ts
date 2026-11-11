import Konva from "konva";
import { getCanvasColors } from "../../../theme.ts";
import { globals } from "../UIGlobals.ts";
import {
  FONT_FAMILY,
  LABEL_COLOR,
  NO_CLUES_COLOR,
  PANEL_CORNER_RADIUS,
  PANEL_OPACITY,
  STROKE_WIDTH_UNIT,
  TEXT_SHADOW,
} from "../constants.ts";
import { FitText } from "./FitText.ts";
import { outlinedArrow } from "./outlinedArrow.ts";

/** How far the shadow around the current player arrow spreads. */
const ARROW_SHADOW_BLUR = 75;

/** The size of the text in the name box, as a fraction of the stage height. */
const FONT_SIZE = 0.08;

/**
 * How far the current player's name and its label are inset from each side of the name box, in
 * multiples of the area's spacing.
 */
const NAME_TEXT_INSET_SPACINGS = 2;

/** How far the warning below the name is inset from each side of the name box, likewise. */
const WARNING_TEXT_INSET_SPACINGS = 1;

/**
 * The gap between each end of the arrow and the sides of its box, in fractions of the stage width.
 */
const ARROW_INSET = 0.01;

/** The width of the arrow's body, as a fraction of the stage height. */
const ARROW_BODY_WIDTH = 5 * STROKE_WIDTH_UNIT;

/** The size of the arrow's pointer, as a multiple of the width of its body. */
const ARROW_POINTER_SIZE = 2;

/** The width of the arrow's black outline, as a multiple of the width of its body. */
const ARROW_OUTLINE_WIDTH = 0.5;

interface ElementValues {
  x: number;
  y: number;
  w: number;
  h: number;
  spacing: number;
}

interface TextElementValues {
  w: number;
  w2: number;
  x: number;
  x2: number;
}

/**
 * The share of the area's width taken by the box with the current player's name. The box with the
 * arrow takes the rest.
 */
const NAME_BOX_SHARE = 0.75;

export class CurrentPlayerArea extends Konva.Group {
  values: ElementValues;
  textValues: TextElementValues;
  rect1: Konva.Rect;
  text1: FitText;
  text2: FitText;
  text3: FitText;
  arrow: Konva.Group;
  tween: Konva.Tween | undefined = undefined;

  constructor(values: ElementValues, winW: number, winH: number) {
    super({
      x: values.x * winW,
      y: values.y * winH,
      width: values.w * winW,
      height: values.h * winH,
      visible: !globals.state.finished,
      listening: false,
    });

    this.values = values;

    // The left-most box that contains the name of the current player takes most of the area, and
    // the box with the arrow takes the rest.
    const nameBoxShare = NAME_BOX_SHARE;
    let box1Width = values.w * nameBoxShare;
    box1Width -= values.spacing;
    this.rect1 = new Konva.Rect({
      width: box1Width * winW,
      height: values.h * winH,
      cornerRadius: PANEL_CORNER_RADIUS * winW,
      fill: "black",
      opacity: PANEL_OPACITY,
      listening: false,
    });
    this.add(this.rect1);

    const textValues = {
      w: box1Width - values.spacing * NAME_TEXT_INSET_SPACINGS * 2,
      w2: box1Width - values.spacing * WARNING_TEXT_INSET_SPACINGS * 2,
      x: 0,
      x2: 0,
    };
    textValues.x = box1Width / 2 - textValues.w / 2;
    textValues.x2 = box1Width / 2 - textValues.w2 / 2;

    const fontSize = FONT_SIZE * winH;

    this.text1 = new FitText({
      x: textValues.x * winW,
      width: textValues.w * winW,
      fontFamily: FONT_FAMILY,
      fontSize,
      text: "Current player:",
      align: "center",
      fill: LABEL_COLOR,
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.text1);

    this.text2 = new FitText({
      x: textValues.x * winW,
      width: textValues.w * winW,
      fontFamily: FONT_FAMILY,
      fontSize,
      text: "",
      align: "center",
      fill: getCanvasColors().currentPlayerText,
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.text2);

    this.text3 = new FitText({
      x: textValues.x2 * winW,
      width: textValues.w2 * winW,
      fontFamily: FONT_FAMILY,
      fontSize,
      text: "",
      align: "center",
      fill: NO_CLUES_COLOR,
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.text3);

    // The right-most box that contains the arrow.
    const arrowValues = {
      x: values.w * nameBoxShare + values.spacing,
      w: values.w * (1 - nameBoxShare) - values.spacing,
      h: values.h,
      spacing: ARROW_INSET,
    };

    const rect2 = new Konva.Rect({
      x: arrowValues.x * winW,
      width: arrowValues.w * winW,
      height: values.h * winH,
      cornerRadius: PANEL_CORNER_RADIUS * winW,
      fill: "black",
      opacity: PANEL_OPACITY,
      listening: false,
    });
    this.add(rect2);

    const arrowBodyWidth = ARROW_BODY_WIDTH * winH;
    const arrowPointerSize = arrowBodyWidth * ARROW_POINTER_SIZE;

    this.arrow = new Konva.Group({
      x: (arrowValues.x + arrowValues.w / 2) * winW,
      y: (values.h / 2) * winH,
      offset: {
        x: (arrowValues.w / 2) * winW,
        y: (values.h / 2) * winH,
      },
      listening: false,
    });
    this.add(this.arrow);

    const arrowShape = outlinedArrow({
      points: [
        arrowValues.spacing * winW,
        (arrowValues.h / 2) * winH,
        (arrowValues.w - arrowValues.spacing) * winW,
        (arrowValues.h / 2) * winH,
      ],
      pointerLength: arrowPointerSize,
      pointerWidth: arrowPointerSize,
      bodyWidth: arrowBodyWidth,
      outlineWidth: arrowBodyWidth * ARROW_OUTLINE_WIDTH,
      fill: LABEL_COLOR,
      shadowBlur: ARROW_SHADOW_BLUR,
      shadowOpacity: 1,
      listening: false,
    });
    this.arrow.add(arrowShape);

    this.textValues = textValues;
  }
}
