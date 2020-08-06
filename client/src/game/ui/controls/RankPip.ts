import Konva from 'konva';
import { CLUED_COLOR } from '../../types/constants';

export default class RankPip extends Konva.Text {
  private fillValue: string | undefined;
  private positive: boolean = false;

  constructor(config?: Konva.TextConfig) {
    super(config);
    this.fillValue = config?.fill;
  }

  setFillValue(fill: string) {
    if (this.fillValue === fill) {
      return;
    }

    this.fillValue = fill;
    if (this.positive) {
      this.showPositiveClue();
    } else {
      this.hidePositiveClue();
    }
  }

  showPositiveClue() {
    this.positive = true;
    this.fill(CLUED_COLOR);
  }

  hidePositiveClue() {
    this.positive = false;
    this.fill(this.fillValue ?? 'black');
  }
}
