import Konva from "konva";
import type { NodeWithTooltip } from "./NodeWithTooltip";

export class TextWithTooltip extends Konva.Text implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";

  /** Whether or not this element contains only emoji (which is used for alignment purposes). */
  emoji = false;
}
