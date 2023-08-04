import type { Color } from "./Color.js";

export interface Suit {
  readonly name: string;
  readonly abbreviation: string;
  readonly clueColors: readonly Color[];
  readonly displayName: string;
  readonly fill: string;
  readonly fillColorblind: string;
  readonly fillColors: readonly string[];
  readonly pip: string;

  readonly oneOfEach: boolean;
  readonly reversed: boolean;

  readonly allClueColors: boolean;
  readonly noClueColors: boolean;
  readonly allClueRanks: boolean;
  readonly noClueRanks: boolean;
  readonly prism: boolean;
}
