import Konva from "konva";
import { CLUED_COLOR } from "../constants";

export default class RankPip extends Konva.Text {
  private fillValue: string | undefined;
  private positive = false;

  constructor(config?: Konva.TextConfig) {
    super(config);
    this.fillValue = config?.fill;
  }

  setFillValue(fill: string): void {
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

  showPositiveClue(): void {
    this.positive = true;
    this.fill(CLUED_COLOR);
  }

  hidePositiveClue(): void {
    this.positive = false;
    this.fill(this.fillValue ?? "black");
  }
}
