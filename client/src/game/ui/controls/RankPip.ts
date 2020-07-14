import Konva from 'konva';
import { CLUED_COLOR } from '../../../constants';

export default class RankPip extends Konva.Text {
  showPositiveClue() {
    this.fill(CLUED_COLOR);
  }

  hidePositiveClue() {
    this.fill('black');
  }
}
