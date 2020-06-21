// Imports
import Konva from 'konva';
import NodeWithTooltip from './NodeWithTooltip';

export default class TextWithTooltip extends Konva.Text implements NodeWithTooltip {
  tooltipName: string = '';
  tooltipContent: string = '';
}
