import Konva from 'konva';

// These are arrows used to show which cards that are touched by a clue
// (and for pointing to various things in a shared replay)
export default class Arrow extends Konva.Group {
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

    // Class variables
    // (we can't initialize these above due to "super()" not being on the first line)
    this.pointingTo = null;
    this.tween = null;

    const pointerLength = 0.006 * winW;

    // We want there to be a black outline around the arrow,
    // so we draw a second arrow that is slightly bigger than the first
    const border = new Konva.Arrow({
      points: [
        x,
        0,
        x,
        y * 0.8,
      ],
      pointerLength,
      pointerWidth: pointerLength,
      fill: 'black',
      stroke: 'black',
      strokeWidth: pointerLength * 2,
      shadowBlur: pointerLength * 4,
      shadowOpacity: 1,
      listening: false,
    });
    this.add(border);

    // The border arrow will be missing a bottom edge,
    // so draw that manually at the bottom of the arrow
    const edge = new Konva.Line({
      points: [
        x - pointerLength,
        0,
        x + pointerLength,
        0,
      ],
      fill: 'black',
      stroke: 'black',
      strokeWidth: pointerLength * 0.75,
      listening: false,
    });
    this.add(edge);

    // The main (inside) arrow is exported so that we can change the color later
    this.base = new Konva.Arrow({
      points: [
        x,
        0,
        x,
        y * 0.8,
      ],
      pointerLength,
      pointerWidth: pointerLength,
      fill: 'white',
      stroke: 'white',
      strokeWidth: pointerLength * 1.25,
      listening: false,
    });
    this.add(this.base);

    // A circle will appear on the body of the arrow to indicate the type of clue given
    this.circle = new Konva.Circle({
      x,
      y: y * 0.3,
      radius: pointerLength * 2.25,
      fill: 'black',
      stroke: 'white',
      strokeWidth: pointerLength * 0.25,
      visible: false,
      listening: false,
    });
    this.add(this.circle);

    // The circle will have text inside of it to indicate the number of the clue given
    this.text = new Konva.Text({
      x,
      y: y * 0.3,
      offset: {
        x: this.circle.width() / 2,
        y: this.circle.height() / 2,
      },
      width: this.circle.width(),
      // For some reason the text is offset if we place it exactly in the middle of the
      // circle, so nudge it downwards
      height: this.circle.height() * 1.09,
      fontSize: y * 0.38,
      fontFamily: 'Verdana',
      fill: 'white',
      align: 'center',
      verticalAlign: 'middle',
      visible: false,
      listening: false,
    });
    this.add(this.text);

    // In colorblind mode, the circle will show the suit pip corresponding to the color
    if (colorblindMode) {
      this.suitPip = new Konva.Shape({
        x,
        y: y * 0.3,
        scale: {
          x: 0.2,
          y: 0.2,
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
