// Imports
import Konva from 'konva';
import * as KonvaBaseLayer from 'konva/types/BaseLayer';

export default class Button2 extends Konva.Group {
  enabled: boolean = true;
  pressed: boolean = false;

  background: Konva.Rect;
  textElement: Konva.Text;
  textElement2: Konva.Text;
  textElement3: Konva.Text;

  tooltipName: string = '';
  tooltipContent: string = '';

  constructor(config: Konva.ContainerConfig) {
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
    });
    this.add(this.background);

    const x = 0.05 * w;
    const width = 0.9 * w;
    const height = 0.2 * h;
    const fontSize = 0.2 * h;
    const fontFamily = 'Verdana';
    const fill = 'white';
    const align = 'center';
    const listening = false;

    this.textElement = new Konva.Text({
      x,
      y: 0.15 * h,
      width,
      height,
      fontSize,
      fontFamily,
      fill,
      align,
      text: config.text as string | undefined,
      listening,
    });
    this.add(this.textElement);

    this.textElement2 = new Konva.Text({
      x,
      y: 0.4 * h,
      width,
      height,
      fontSize,
      fontFamily,
      fill,
      align,
      text: config.text2 as string | undefined,
      listening,
    });
    this.add(this.textElement2);

    this.textElement3 = new Konva.Text({
      x,
      y: 0.65 * h,
      width,
      height,
      fontSize,
      fontFamily,
      fill,
      align,
      text: config.text3 as string | undefined,
      listening,
    });
    this.add(this.textElement3);

    const resetButton = () => {
      this.background.fill('black');
      this.drawLayer();

      this.background.off('mouseup');
      this.background.off('mouseout');
    };
    this.background.on('mousedown', () => {
      this.background.fill('#888888');
      this.drawLayer();

      this.background.on('mouseout', () => {
        resetButton();
      });
      this.background.on('mouseup', () => {
        resetButton();
      });
    });
  }

  private drawLayer() {
    const layer = this.getLayer() as KonvaBaseLayer.BaseLayer | null;
    if (layer) {
      layer.batchDraw();
    }
  }

  setMiddleText(text: string) {
    this.textElement2.text(text);
  }
}
