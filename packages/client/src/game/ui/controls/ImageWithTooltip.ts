import Konva from "konva";
import { NodeWithTooltip } from "./NodeWithTooltip";

export class ImageWithTooltip extends Konva.Image implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
