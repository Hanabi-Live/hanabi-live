// Imports
import Color from './Color';

export default interface Suit {
  readonly name: string,
  readonly abbreviation: string,
  readonly clueColors: Array<Color>,
  readonly fill: string,
  readonly fillColors: Array<string>,
  readonly oneOfEach: boolean,
  readonly pip: string,

  readonly allClueColors: boolean,
  readonly noClueColors: boolean,
  readonly allClueRanks: boolean,
  readonly noClueRanks: boolean,
}
