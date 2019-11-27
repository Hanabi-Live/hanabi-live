// Imports
import Konva from 'konva';

export default class RankPip extends Konva.Rect {
    showPositiveClue() {
        this.fill('#ffdf00'); // Yellow
        // (the same color as the "clued" border around a card)
    }

    hidePositiveClue() {
        this.fill('black');
    }
}
