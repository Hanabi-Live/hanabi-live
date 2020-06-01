// MsgClue represents how a clue looks on the server
// On the client, the color is a rich object

import { ClueType } from '../../constants';

// On the server, the color is a simple integer mapping
export default class MsgClue {
  type: ClueType;
  value: number;

  constructor(type: ClueType, value: number) {
    this.type = type;
    this.value = value;
  }
}
