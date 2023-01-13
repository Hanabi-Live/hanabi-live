import { ClueType } from "./ClueType";

/** This represents how a clue looks on the server. On the client, the color is a rich object. */
export interface MsgClue {
  readonly type: ClueType;
  readonly value: number;
}
