// Imports
import Suit from '../../Suit';

export default interface LearnedCard {
    suit: Suit | null,
    rank: number | null,
    revealed: boolean,
}
