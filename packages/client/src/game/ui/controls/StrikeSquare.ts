import Konva from "konva";

export class StrikeSquare extends Konva.Rect {
  num: 0 | 1 | 2;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ShapeConfig, num: 0 | 1 | 2) {
    super(config);
    this.num = num;
  }
}
