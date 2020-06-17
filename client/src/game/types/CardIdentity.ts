import Suit from './Suit';

export interface CardIdentity {
  suit: Suit | null;
  rank: number | null;
}
