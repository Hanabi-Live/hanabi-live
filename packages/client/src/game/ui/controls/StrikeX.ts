import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import type { StrikeIndex } from "../constants.ts";

export class StrikeX extends Konva.Image {
  readonly num: StrikeIndex;
  tween: Konva.Tween | undefined = undefined;

  tooltipName?: GameTooltipName;
  tooltipContent = "";

  constructor(config: Konva.ImageConfig, num: StrikeIndex) {
    super(config);
    this.num = num;
  }
}
