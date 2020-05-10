// Imports
import Konva from 'konva';
import Suit from '../../Suit';
import Clue from './Clue';
import drawPip from './drawPip';
import globals from './globals';

export default class ColorButton extends Konva.Group {
  pressed: boolean = false;
  clue: Clue;

  background: Konva.Rect;

  constructor(config: Konva.ContainerConfig, suit: Suit) {
    super(config);
    this.listening(true);

    this.clue = config.clue;

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

    const backgroundColor = new Konva.Rect({
      x: 0.1 * w,
      y: 0.1 * h,
      width: 0.8 * w,
      height: 0.8 * h,
      cornerRadius: 0.12 * 0.8 * h,
      fill: config.color,
      opacity: 0.9,
      listening: false,
    });
    this.add(backgroundColor);

    if (globals.lobby.settings.colorblindMode) {
      if (globals.variant.name.startsWith('Dual-Color')) {
        // For Dual-Color variants, draw the color abbreviation (as text)
        const text = new Konva.Text({
          x: 0,
          y: 0.275 * h,
          width: w,
          height: 0.6 * h,
          fontSize: 0.5 * h,
          fontFamily: 'Verdana',
          fill: 'white',
          stroke: 'black',
          strokeWidth: 1,
          align: 'center',
          text: config.text,
          listening: false,
        });
        this.add(text);
      } else {
        // Draw the suit pip that corresponds to this color
        const suitPip = new Konva.Shape({
          scale: {
            x: 0.25,
            y: 0.25,
          },
          offset: {
            x: w * -2,
            y: h * -2,
          },
          stroke: 'black',
          strokeWidth: 5,
          sceneFunc: (ctx: any) => {
            drawPip(ctx, suit, false);
          },
          listening: false,
        });
        this.add(suitPip);
      }
    }

    const resetButton = () => {
      this.background.fill('black');
      const layer = this.getLayer();
      if (layer) {
        layer.batchDraw();
      }

      this.background.off('mouseup');
      this.background.off('mouseout');
    };
    this.background.on('mousedown', () => {
      this.background.fill('#888888');
      const layer = this.getLayer();
      if (layer) {
        layer.batchDraw();
      }

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
    const layer = this.getLayer();
    if (layer) {
      layer.batchDraw();
    }
  }
}
