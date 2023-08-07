import type Konva from "konva";
import type { RankPip } from "../ui/controls/RankPip";

export interface Pips {
  suitPips: Konva.Group;
  suitPipsMap: Map<number, Konva.Shape>;
  suitPipsPositiveMap: Map<number, Konva.Shape>;
  suitPipsXMap: Map<number, Konva.Shape>;
  rankPips: Konva.Group;
  rankPipsMap: Map<number, RankPip>;
  rankPipsXMap: Map<number, Konva.Shape>;
}
