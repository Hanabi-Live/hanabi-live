import Konva from 'konva';
import NodeWithTooltip from './NodeWithTooltip';

export default class TextWithTooltip extends Konva.Text implements NodeWithTooltip {
  tooltipName: string = '';
  tooltipContent: string = '';
  // Whether or not this element contains only emoji (which is used for alignment purposes)
  emoji: boolean = false;
}
