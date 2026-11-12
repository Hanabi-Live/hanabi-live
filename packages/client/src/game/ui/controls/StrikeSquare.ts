import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import type { StrikeIndex } from "../constants.ts";

export class StrikeSquare extends Konva.Rect {
  readonly num: StrikeIndex;

  tooltipName?: GameTooltipName;
  tooltipContent = "";

  constructor(config: Konva.ShapeConfig, num: StrikeIndex) {
    super(config);
    this.num = num;
  }
}
