import Konva from "konva";

export class StrikeX extends Konva.Image {
  num: number;
  tween: Konva.Tween | null = null;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ImageConfig, num: number) {
    super(config);
    this.num = num;
  }
}
