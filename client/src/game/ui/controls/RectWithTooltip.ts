import Konva from 'konva';
import NodeWithTooltip from './NodeWithTooltip';

export default class RectWithTooltip extends Konva.Rect implements NodeWithTooltip {
  tooltipName: string = '';
  tooltipContent: string = '';
}
