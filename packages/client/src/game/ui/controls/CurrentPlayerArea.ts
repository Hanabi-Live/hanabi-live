import Konva from "konva";
import { getCanvasColors } from "../../../theme";
import { globals } from "../UIGlobals";
import {
  FONT_FAMILY,
  LABEL_COLOR,
  PANEL_CORNER_RADIUS,
  PANEL_OPACITY,
  TEXT_SHADOW,
} from "../constants";
import { FitText } from "./FitText";

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

export class CurrentPlayerArea extends Konva.Group {
  values: ElementValues;
  textValues: TextElementValues;
  rect1: Konva.Rect;
  text1: FitText;
  text2: FitText;
  text3: FitText;
  arrow: Konva.Group;
  tween: Konva.Tween | null = null;

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
    const nameBoxShare = 0.75;
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
      w: box1Width - values.spacing * 4,
      w2: box1Width - values.spacing * 2,
      x: 0,
      x2: 0,
    };
    textValues.x = box1Width / 2 - textValues.w / 2;
    textValues.x2 = box1Width / 2 - textValues.w2 / 2;

    const fontSize = 0.08 * winH;

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
      fill: "red",
      ...TEXT_SHADOW,
      listening: false,
    });
    this.add(this.text3);

    // The right-most box that contains the arrow.
    const arrowValues = {
      x: values.w * nameBoxShare + values.spacing,
      w: values.w * (1 - nameBoxShare) - values.spacing,
      h: values.h,
      spacing: 0.01,
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

    const baseArrowLength = 0.005_28 * winH;

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

    const arrowBorder = new Konva.Arrow({
      points: [
        arrowValues.spacing * winW,
        (arrowValues.h / 2) * winH,
        (arrowValues.w - arrowValues.spacing) * winW,
        (arrowValues.h / 2) * winH,
      ],
      pointerLength: baseArrowLength * 2,
      pointerWidth: baseArrowLength * 2,
      fill: "black",
      stroke: "black",
      strokeWidth: baseArrowLength * 2,
      shadowBlur: 75,
      shadowOpacity: 1,
      listening: false,
    });
    this.arrow.add(arrowBorder);

    const edgeHalfLength = 0.005;
    const arrowBorderEdge = new Konva.Line({
      points: [
        arrowValues.spacing * winW,
        (arrowValues.h / 2 - edgeHalfLength) * winH,
        arrowValues.spacing * winW,
        (arrowValues.h / 2 + edgeHalfLength) * winH,
      ],
      fill: "black",
      stroke: "black",
      strokeWidth: baseArrowLength,
      listening: false,
    });
    this.arrow.add(arrowBorderEdge);

    const arrowMain = new Konva.Arrow({
      points: [
        arrowValues.spacing * winW,
        (arrowValues.h / 2) * winH,
        (arrowValues.w - arrowValues.spacing) * winW,
        (arrowValues.h / 2) * winH,
      ],
      pointerLength: baseArrowLength * 2,
      pointerWidth: baseArrowLength * 2,
      fill: LABEL_COLOR,
      stroke: LABEL_COLOR,
      strokeWidth: baseArrowLength,
      listening: false,
    });
    this.arrow.add(arrowMain);

    this.textValues = textValues;
  }
}
