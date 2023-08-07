import type Konva from "konva";

export interface NodeWithTooltip extends Konva.Node {
  tooltipName?: string;
  tooltipContent?: string;
}
