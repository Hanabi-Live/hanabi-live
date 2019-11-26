// Imports
import Konva from 'konva';

export default class ClickArea extends Konva.Rect {
    isOver(pos: Konva.Vector2d) {
        return (
            pos.x >= this.x()
            && pos.y >= this.y()
            && pos.x <= this.x() + this.width()
            && pos.y <= this.y() + this.height()
        );
    }
}
