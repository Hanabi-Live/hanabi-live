import Konva from "konva";
import NodeWithTooltip from "./NodeWithTooltip";

export default class TextWithTooltip
  extends Konva.Text
  implements NodeWithTooltip {
  tooltipName = "";
  tooltipContent = "";
  // Whether or not this element contains only emoji (which is used for alignment purposes)
  emoji = false;
}
