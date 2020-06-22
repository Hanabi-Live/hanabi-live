import Konva from 'konva';
import Button from './Button';
import FitText from './FitText';

export default class ThreeLineButton extends Button {
  textElement1: Konva.Text;
  textElement2: Konva.Text;
  textElement3: Konva.Text;

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    // Hide the default label
    this.textElement?.hide();
    this.textElement = null;

    // Local variables
    const w = this.width();
    const h = this.height();

    this.textElement1 = new Konva.Text({
      x: 0,
      y: 0.15 * h,
      width: w,
      height: 0.2 * h,
      fontSize: 0.2 * h,
      fontFamily: 'Verdana',
      fill: 'white',
      align: 'center',
      text: config.text as string | undefined,
      listening: false,
    });
    this.add(this.textElement1);

    this.textElement2 = this.textElement1?.clone({
      y: 0.4 * h,
      text: config.text2 as string | undefined,
    }) as FitText;
    this.add(this.textElement2);

    this.textElement3 = this.textElement1?.clone({
      y: 0.65 * h,
      text: config.text3 as string | undefined,
    }) as FitText;
    this.add(this.textElement3);
  }

  setText(lines: {
    line1?: string;
    line2?: string;
    line3?: string;
  }) {
    if (lines.line1) {
      this.textElement1.text(lines.line1);
    }
    if (lines.line2) {
      this.textElement2.text(lines.line2);
    }
    if (lines.line3) {
      this.textElement3.text(lines.line3);
    }
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) {
      return;
    }

    const color = enabled ? 'white' : '#444444';
    this.textElement1.fill(color);
    this.textElement2.fill(color);
    this.textElement3.fill(color);

    super.setEnabled(enabled);
  }
}
