// Imports
import Konva from 'konva';

export default class StrikeX extends Konva.Image {
    turn: number | null = null;
    order: number | null = null;
    tween: Konva.Tween | null = null;

    setFaded() {
        if (this.opacity() === 0) {
            this.opacity(this.turn === null ? 0 : 0.125);
        }
    }
}
