import Konva from "konva";
import type { NodeWithTooltip } from "./NodeWithTooltip";

export class ImageWithTooltip extends Konva.Image implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
