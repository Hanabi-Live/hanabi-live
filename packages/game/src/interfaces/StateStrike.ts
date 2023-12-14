import type { CardOrder } from "@hanabi/data";

export interface StateStrike {
  readonly segment: number;
  readonly order: CardOrder;
}
