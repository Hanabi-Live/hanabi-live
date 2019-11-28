// Imports
import Konva from 'konva';

export default class StrikeSquare extends Konva.Rect {
    turn: number | null = null;
    order: number | null = null;

    tooltipName: string = '';
    tooltipContent: string = '';
}
