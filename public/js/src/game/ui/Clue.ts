// Imports
import Color from '../../Color';

export default class Clue {
    type: number;
    value: number | Color;

    constructor(type: number, value: number | Color) {
        this.type = type;
        this.value = value;
    }
}
