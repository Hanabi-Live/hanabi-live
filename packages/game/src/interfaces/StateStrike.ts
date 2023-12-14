import type { CardOrder } from "../types/CardOrder";

export interface StateStrike {
  readonly segment: number;
  readonly order: CardOrder;
}
