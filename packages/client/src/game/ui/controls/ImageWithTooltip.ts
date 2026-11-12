import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import type { NodeWithTooltip } from "./NodeWithTooltip.ts";

export class ImageWithTooltip extends Konva.Image implements NodeWithTooltip {
  tooltipName?: GameTooltipName;
  tooltipContent = "";
}
