import Konva from "konva";

export default class StrikeSquare extends Konva.Rect {
  num: number;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ShapeConfig, num: number) {
    super(config);
    this.num = num;
  }
}
