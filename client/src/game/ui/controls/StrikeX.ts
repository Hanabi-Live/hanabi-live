import Konva from 'konva';

export default class StrikeX extends Konva.Image {
  num: number;
  tween: Konva.Tween | null = null;

  tooltipName: string = '';
  tooltipContent: string = '';

  constructor(config: Konva.ImageConfig, num: number) {
    super(config);
    this.num = num;
  }
}
