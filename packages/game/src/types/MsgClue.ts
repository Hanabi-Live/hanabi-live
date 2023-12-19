import type { CompositionTypeSatisfiesEnum } from "isaacscript-common-ts";
import type { ClueType } from "../enums/ClueType";
import type { ColorIndex } from "./ColorIndex";
import type { RankClueNumber } from "./RankClueNumber";

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

type _Test = CompositionTypeSatisfiesEnum<MsgClue, ClueType>;
