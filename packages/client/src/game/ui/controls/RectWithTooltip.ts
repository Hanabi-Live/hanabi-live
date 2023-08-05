import Konva from "konva";
import { NodeWithTooltip } from "./NodeWithTooltip";

export class RectWithTooltip extends Konva.Rect implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
