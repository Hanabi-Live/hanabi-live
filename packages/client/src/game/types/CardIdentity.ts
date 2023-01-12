import { CardIdentityType } from "./CardIdentityType";

export default interface CardIdentity {
  readonly suitIndex: number | null | CardIdentityType;
  readonly rank: number | null | CardIdentityType;
}
