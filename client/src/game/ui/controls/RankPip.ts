import Konva from 'konva';
import { CLUED_COLOR } from '../../../constants';

export default class RankPip extends Konva.Text {
  private fillColor: string | undefined;

  constructor(config?: Konva.TextConfig) {
    super(config);
    this.fillColor = config?.fill;
  }

  showPositiveClue() {
    this.fill(CLUED_COLOR);
  }

  hidePositiveClue() {
    this.fill(this.fillColor ?? 'black');
  }
}
