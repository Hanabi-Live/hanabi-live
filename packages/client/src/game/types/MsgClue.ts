import type { ColorIndex, RankClueNumber } from "@hanabi/data";
import type { ClueType } from "./ClueType";

interface MsgColorClue {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

interface MsgRankClue {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

/** This represents how a clue looks on the server. On the client, the color is a rich object. */
export type MsgClue = MsgColorClue | MsgRankClue;
