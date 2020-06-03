// Imports
import Color from '../../Color';
import { ClueType } from '../../constants';

export default class Clue {
  type: ClueType;
  value: number | Color;

  constructor(type: ClueType, value: number | Color) {
    this.type = type;
    this.value = value;
  }
}
