import Konva from 'konva';

export default interface NodeWithTooltip extends Konva.Node {
  tooltipName?: string;
  tooltipContent?: string;
}
