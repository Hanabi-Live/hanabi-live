// Imports
import ClueType from './ClueType';
import Color from './Color';

export default class Clue {
  type: ClueType;
  value: number | Color;

  constructor(type: ClueType, value: number | Color) {
    this.type = type;
    this.value = value;
  }
}
