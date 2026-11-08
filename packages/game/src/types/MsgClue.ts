import type { CompositionTypeSatisfiesEnum } from "complete-common";
import type { ClueType } from "../enums/ClueType";
import type { ColorIndex } from "./ColorIndex";
import type { WireClue } from "./HiddenClue";
import type { RankClueNumber } from "./RankClueNumber";

export interface MsgColorClue extends Readonly<Extract<WireClue, { type: 0 }>> {
  readonly type: ClueType.Color;
  readonly value: ColorIndex;
}

export interface MsgRankClue extends Readonly<Extract<WireClue, { type: 1 }>> {
  readonly type: ClueType.Rank;
  readonly value: RankClueNumber;
}

/**
 * This represents how a clue looks on the server, with its type named by the enum. On the client,
 * the color is a rich object.
 */
export type MsgClue = MsgColorClue | MsgRankClue;

type _Test = CompositionTypeSatisfiesEnum<MsgClue, ClueType>;
