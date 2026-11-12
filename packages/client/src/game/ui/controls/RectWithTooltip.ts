import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import type { NodeWithTooltip } from "./NodeWithTooltip.ts";

export class RectWithTooltip extends Konva.Rect implements NodeWithTooltip {
  tooltipName?: GameTooltipName;
  tooltipContent = "";
}
