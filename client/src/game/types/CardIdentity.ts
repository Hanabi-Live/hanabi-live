import Suit from './Suit';

export default interface CardIdentity {
  suit: Suit | null;
  rank: number | null;
}
