import type { CardOrder } from "../types/CardOrder.ts";

export interface StateStrike {
  readonly segment: number;
  readonly order: CardOrder;
}
