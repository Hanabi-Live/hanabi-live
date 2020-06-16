// MsgClue represents how a clue looks on the server
// On the client, the color is a rich object

import ClueType from './ClueType';

// On the server, the color is a simple integer mapping
export default interface MsgClue {
  readonly type: ClueType;
  readonly value: number;
}
