import Konva from 'konva';
import { drawLayer } from '../konvaHelpers';
import FitText from './FitText';

export default class Button extends Konva.Group {
  enabled: boolean = true;
  pressed: boolean = false;

  background: Konva.Rect;
  textElement: FitText | null = null;
  imageElement: Konva.Image | null = null;
  imageDisabledElement: Konva.Image | null = null;

  tooltipName: string = '';
  tooltipContent: string = '';

  constructor(config: Konva.ContainerConfig, images?: HTMLImageElement[]) {
    super(config);
    this.listening(true);

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

    this.textElement = null;
    this.imageElement = null;
    if (config.text) {
      this.textElement = new FitText({
        x: 0,
        y: 0.275 * h,
        width: w,
        height: 0.5 * h,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        align: 'center',
        text: config.text as string,
        listening: false,
      });
      this.add(this.textElement);
    } else if (images && images.length > 0) {
      this.imageElement = new Konva.Image({
        x: 0.2 * w,
        y: 0.2 * h,
        width: 0.6 * w,
        height: 0.6 * h,
        image: images[0],
        listening: false,
      });
      this.add(this.imageElement);

      if (images.length >= 2) {
        this.imageDisabledElement = new Konva.Image({
          x: 0.2 * w,
          y: 0.2 * h,
          width: 0.6 * w,
          height: 0.6 * h,
          image: images[1],
          visible: false,
          listening: false,
        });
        this.add(this.imageDisabledElement);
      }
    }

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

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;

    if (this.textElement) {
      this.textElement.fill(enabled ? 'white' : '#444444');
    }

    if (this.imageElement && this.imageDisabledElement) {
      this.imageElement.visible(enabled);
      this.imageDisabledElement.visible(!enabled);
    }

    this.background.listening(enabled);

    drawLayer(this);
  }

  setPressed(pressed: boolean) {
    this.pressed = pressed;
    this.background.fill(pressed ? '#cccccc' : 'black');
    drawLayer(this);
  }

  text(newText: string) {
    if (this.textElement) {
      this.textElement.fitText(newText);
    } else {
      throw new Error('The "text()" method was called on a non-text Button.');
    }
  }

  fill(newFill: string) {
    if (this.textElement) {
      this.textElement.fill(newFill);
    } else {
      throw new Error('The "fill()" method was called on a non-text Button.');
    }
  }
}
