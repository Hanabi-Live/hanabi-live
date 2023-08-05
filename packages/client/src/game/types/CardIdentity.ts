import { CardIdentityType } from "./CardIdentityType";

export interface CardIdentity {
  readonly suitIndex: number | null | CardIdentityType;
  readonly rank: number | null | CardIdentityType;
}
