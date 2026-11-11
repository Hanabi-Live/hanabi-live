import Konva from "konva";
import type { NodeWithTooltip } from "./NodeWithTooltip.ts";

export class RectWithTooltip extends Konva.Rect implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
