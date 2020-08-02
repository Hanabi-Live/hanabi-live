import Konva from 'konva';
import Clue from '../types/Clue';
import { drawLayer } from './konvaHelpers';

export default class RankButton extends Konva.Group {
  pressed: boolean = false;
  clue: Clue;
  background: Konva.Rect;

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    // Class variables
    this.clue = config.clue as Clue;

    // Local variables
    const w = this.width();
    const h = this.height();

    this.background = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      cornerRadius: 0.12 * h,
      fill: 'black',
      opacity: 0.6,
      listening: true,
    });
    this.add(this.background);

    const text = new Konva.Text({
      x: 0,
      y: 0.275 * h, // 0.25 is too high for some reason
      width: w,
      height: 0.5 * h,
      fontSize: 0.5 * h,
      fontFamily: 'Verdana',
      fill: 'white',
      align: 'center',
      text: (config.number as number).toString(),
      listening: false,
    });
    this.add(text);

    const resetButton = () => {
      this.background.fill('black');
      drawLayer(this);

      this.background.off('mouseup');
      this.background.off('mouseout');
    };
    this.background.on('mousedown', () => {
      this.background.fill('#888888');
      drawLayer(this);

      this.background.on('mouseout', () => {
        resetButton();
      });
      this.background.on('mouseup', () => {
        resetButton();
      });
    });
  }

  setPressed(pressed: boolean) {
    this.pressed = pressed;
    this.background.fill(pressed ? '#cccccc' : 'black');
    drawLayer(this);
  }
}
