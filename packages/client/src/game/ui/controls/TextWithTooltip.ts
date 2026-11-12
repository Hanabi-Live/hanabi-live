import Konva from "konva";
import type { GameTooltipName } from "../../../tooltips.ts";
import type { NodeWithTooltip } from "./NodeWithTooltip.ts";

export class TextWithTooltip extends Konva.Text implements NodeWithTooltip {
  tooltipName?: GameTooltipName;
  tooltipContent = "";

  /** Whether or not this element contains only emoji (which is used for alignment purposes). */
  emoji = false;
}
