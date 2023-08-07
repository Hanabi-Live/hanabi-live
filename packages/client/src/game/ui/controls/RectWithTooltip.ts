import Konva from "konva";
import type { NodeWithTooltip } from "./NodeWithTooltip";

export class RectWithTooltip extends Konva.Rect implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
