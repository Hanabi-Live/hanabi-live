import Konva from "konva";

export class StrikeX extends Konva.Image {
  num: 0 | 1 | 2;
  tween: Konva.Tween | null = null;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ImageConfig, num: 0 | 1 | 2) {
    super(config);
    this.num = num;
  }
}
