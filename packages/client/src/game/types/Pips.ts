import Konva from "konva";
import RankPip from "../ui/controls/RankPip";

export default interface Pips {
  suitPips: Konva.Group;
  suitPipsPositive: Konva.Group;
  suitPipsMap: Map<number, Konva.Shape>;
  suitPipsPositiveMap: Map<number, Konva.Shape>;
  suitPipsXMap: Map<number, Konva.Shape>;
  rankPips: Konva.Group;
  rankPipsMap: Map<number, RankPip>;
  rankPipsXMap: Map<number, Konva.Shape>;
}
