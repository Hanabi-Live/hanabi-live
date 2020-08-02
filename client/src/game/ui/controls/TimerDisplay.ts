import Konva from 'konva';
import { LABEL_COLOR } from '../../../constants';
import FitText from './FitText';

export default class TimerDisplay extends Konva.Group {
  timerText: FitText;
  labelText: FitText;

  tooltipName: string = '';
  tooltipContent: string = '';

  constructor(config: Konva.ContainerConfig) {
    super(config);

    const rectangle = new Konva.Rect({
      x: 0,
      y: 0,
      width: config.width,
      height: config.height,
      fill: 'black',
      cornerRadius: config.cornerRadius as (number | number[] | undefined),
      opacity: 0.2,
      listening: false,
    });
    this.add(rectangle);

    this.timerText = new FitText({
      x: 0,
      y: config.spaceH as (number | undefined),
      width: config.width,
      height: config.height,
      fontSize: config.fontSize as (number | undefined),
      fontFamily: 'Verdana',
      align: 'center',
      text: '??:??',
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
    this.add(this.timerText);

    this.labelText = new FitText({
      x: 0,
      y: 6 * config.spaceH,
      width: config.width,
      height: config.height,
      fontSize: (config.labelFontSize || config.fontSize) as (number | undefined),
      fontFamily: 'Verdana',
      align: 'center',
      text: config.label as (string | undefined),
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
    this.add(this.labelText);
  }

  setTimerText(text: string) {
    this.timerText.fitText(text);
  }

  setLabelText(text: string) {
    this.labelText.fitText(text);
  }
}
