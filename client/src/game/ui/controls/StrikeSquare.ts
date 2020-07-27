import Konva from 'konva';

export default class StrikeSquare extends Konva.Rect {
  num: number;

  tooltipName: string = '';
  tooltipContent: string = '';

  constructor(config: Konva.ShapeConfig, num: number) {
    super(config);
    this.num = num;
  }
}
