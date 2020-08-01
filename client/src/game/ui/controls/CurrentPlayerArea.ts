import Konva from 'konva';
import { LABEL_COLOR } from '../../../constants';
import globals from '../globals';
import FitText from './FitText';

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

export default class CurrentPlayerArea extends Konva.Group {
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

    // The left-most box that contains the name of the current player
    let box1Width = (values.w * 0.75);
    box1Width -= values.spacing;
    this.rect1 = new Konva.Rect({
      width: box1Width * winW,
      height: values.h * winH,
      cornerRadius: 0.01 * winW,
      fill: 'black',
      opacity: 0.2,
      listening: false,
    });
    this.add(this.rect1);

    const textValues = {
      w: box1Width - (values.spacing * 4),
      w2: box1Width - (values.spacing * 2),
      x: 0,
      x2: 0,
    };
    textValues.x = (box1Width / 2) - (textValues.w / 2);
    textValues.x2 = (box1Width / 2) - (textValues.w2 / 2);

    this.text1 = new FitText({
      x: textValues.x * winW,
      width: textValues.w * winW,
      fontFamily: 'Verdana',
      fontSize: 0.08 * winH,
      text: 'Current player:',
      align: 'center',
      fill: LABEL_COLOR,
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: false,
    });
    this.add(this.text1);

    this.text2 = new FitText({
      x: textValues.x * winW,
      width: textValues.w * winW,
      fontFamily: 'Verdana',
      fontSize: 0.08 * winH,
      text: '',
      align: 'center',
      fill: '#ffffcc',
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: false,
    });
    this.add(this.text2);

    this.text3 = new FitText({
      x: textValues.x2 * winW,
      width: textValues.w2 * winW,
      fontFamily: 'Verdana',
      fontSize: 0.08 * winH,
      text: '',
      align: 'center',
      fill: 'red',
      shadowColor: 'black',
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      listening: false,
    });
    this.add(this.text3);

    // The right-most box that contains the arrow
    const arrowValues = {
      x: (values.w * 0.75) + values.spacing,
      w: (values.w * 0.25) - values.spacing,
      h: values.h,
      spacing: 0.01,
    };

    const rect2 = new Konva.Rect({
      x: arrowValues.x * winW,
      width: arrowValues.w * winW,
      height: values.h * winH,
      cornerRadius: 0.01 * winW,
      fill: 'black',
      opacity: 0.2,
      listening: false,
    });
    this.add(rect2);

    const baseArrowLength = 0.00528 * winH;

    this.arrow = new Konva.Group({
      x: (arrowValues.x + (arrowValues.w / 2)) * winW,
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
      fill: 'black',
      stroke: 'black',
      strokeWidth: baseArrowLength * 2,
      shadowBlur: 75,
      shadowOpacity: 1,
      listening: false,
    });
    this.arrow.add(arrowBorder);

    const arrowBorderEdge = new Konva.Line({
      points: [
        (arrowValues.spacing) * winW,
        ((arrowValues.h / 2) - 0.005) * winH,
        (arrowValues.spacing) * winW,
        ((arrowValues.h / 2) + 0.005) * winH,
      ],
      fill: 'black',
      stroke: 'black',
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
