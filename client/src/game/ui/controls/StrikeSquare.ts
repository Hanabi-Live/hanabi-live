import Konva from 'konva';

export default class StrikeSquare extends Konva.Rect {
  num: number | null = null;
  turn: number | null = null;
  order: number | null = null;

  tooltipName: string = '';
  tooltipContent: string = '';
}
