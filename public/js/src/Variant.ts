// Imports
import Color from './Color';
import Suit from './Suit';

export default interface Variant {
    readonly name: string,

    readonly id: number,
    readonly suits: Array<Suit>,
    readonly ranks: Array<number>,
    readonly clueColors: Array<Color>,
    readonly clueRanks: Array<number>,
    readonly colorCluesTouchNothing: boolean,
    readonly rankCluesTouchNothing: boolean,
    readonly showSuitNames: boolean,
    readonly spacing: boolean,
    readonly maxScore: number,
    readonly offsetCornerElements: boolean,
}
