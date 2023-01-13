import Konva from "konva";

export class StrikeSquare extends Konva.Rect {
  num: number;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ShapeConfig, num: number) {
    super(config);
    this.num = num;
  }
}
