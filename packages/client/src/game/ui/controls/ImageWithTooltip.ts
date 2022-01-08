import Konva from "konva";
import NodeWithTooltip from "./NodeWithTooltip";

export default class ImageWithTooltip
  extends Konva.Image
  implements NodeWithTooltip
{
  tooltipName = "";
  tooltipContent = "";
}
