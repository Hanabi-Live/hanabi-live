import type { CompositionTypeSatisfiesEnum } from "complete-common";
import type { ClueType } from "../enums/ClueType";
import type { ColorIndex } from "./ColorIndex";
import type { RankClueNumber } from "./RankClueNumber";

export interface MsgColorClue {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

export interface MsgRankClue {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

/** This represents how a clue looks on the server. On the client, the color is a rich object. */
export type MsgClue = MsgColorClue | MsgRankClue;

type _Test = CompositionTypeSatisfiesEnum<MsgClue, ClueType>;
