// Imports
import Color from './Color';

export default interface Suit {
    readonly name: string,

    readonly abbreviation: string,
    readonly allClueColors: boolean,
    readonly clueColors: Array<Color>,
    readonly clueRanks: string,
    readonly fill: string,
    readonly fillColors: Array<string>,
    readonly oneOfEach: boolean,
    readonly pip: string,
}
