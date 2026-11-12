import type Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";

export interface NodeWithTooltip extends Konva.Node {
  tooltipName?: GameTooltipName;
  tooltipContent?: string;
}
