import Konva from "konva";
import type { NodeWithTooltip } from "./NodeWithTooltip.ts";

export class ImageWithTooltip extends Konva.Image implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
}
