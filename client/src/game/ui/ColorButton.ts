import Konva from 'konva';
import * as variantRules from '../rules/variant';
import Clue from '../types/Clue';
import Suit from '../types/Suit';
import drawPip from './drawPip';
import globals from './globals';
import { drawLayer } from './konvaHelpers';

export default class ColorButton extends Konva.Group {
  pressed: boolean = false;
  clue: Clue;

  background: Konva.Rect;

  constructor(config: Konva.ContainerConfig, suit: Suit) {
    super(config);
    this.listening(true);

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

    const backgroundColor = new Konva.Rect({
      x: 0.1 * w,
      y: 0.1 * h,
      width: 0.8 * w,
      height: 0.8 * h,
      cornerRadius: 0.12 * 0.8 * h,
      fill: config.color as string | undefined,
      opacity: 0.9,
      listening: false,
    });
    this.add(backgroundColor);

    if (globals.lobby.settings.colorblindMode) {
      if (variantRules.isDualColor(globals.variant)) {
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
          strokeWidth: 0.01487 * h,
          align: 'center',
          text: config.text as string | undefined,
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
          sceneFunc: (ctx: any) => {
            drawPip(ctx, suit);
          },
          listening: false,
        });
        this.add(suitPip);
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

  setPressed(pressed: boolean) {
    this.pressed = pressed;
    this.background.fill(pressed ? '#cccccc' : 'black');
    drawLayer(this);
  }
}
