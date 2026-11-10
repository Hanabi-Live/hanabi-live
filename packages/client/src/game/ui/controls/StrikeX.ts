import Konva from "konva";
import type { StrikeIndex } from "../constants";

export class StrikeX extends Konva.Image {
  readonly num: StrikeIndex;
  tween: Konva.Tween | undefined = undefined;

  tooltipName = "";
  tooltipContent = "";

  constructor(config: Konva.ImageConfig, num: StrikeIndex) {
    super(config);
    this.num = num;
  }
}
