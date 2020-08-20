import Color from './Color';

export default interface Suit {
  readonly name: string;
  readonly abbreviation: string;
  readonly clueColors: Color[];
  readonly displayName: string;
  readonly fill: string;
  readonly fillColorblind: string;
  readonly fillColors: string[];
  readonly oneOfEach: boolean;
  readonly pip: string;
  readonly reversed: boolean;

  readonly allClueColors: boolean;
  readonly noClueColors: boolean;
  readonly allClueRanks: boolean;
  readonly noClueRanks: boolean;
}
