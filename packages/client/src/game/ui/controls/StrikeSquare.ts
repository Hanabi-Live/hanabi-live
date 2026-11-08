import Konva from "konva";
import type { StrikeIndex } from "../constants";

export class StrikeSquare extends Konva.Rect {
  readonly num: StrikeIndex;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ShapeConfig, num: StrikeIndex) {
    super(config);
    this.num = num;
  }
}
