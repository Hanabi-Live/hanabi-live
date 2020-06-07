// Imports
import Suit from '../types/Suit';

export default interface LearnedCard {
  suit: Suit | null;
  rank: number | null;
  revealed: boolean;
}
