import type { CardOrder } from "../types/CardOrder.js";

export interface StateStrike {
  readonly segment: number;
  readonly order: CardOrder;
}
