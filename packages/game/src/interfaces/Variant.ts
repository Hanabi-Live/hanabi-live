import type { Pip } from "../enums/Pip.ts";
import type { BasicRank, Rank } from "../types/Rank.ts";
import type { CatalogFlags } from "./CatalogFlags.ts";
import type { Color } from "./Color.ts";
import type { Suit } from "./Suit.ts";
import type { VariantJson } from "./VariantJson.ts";

/**
 * - `suits` and `clueColors` are object arrays instead of string arrays.
 * - `specialRank` and `criticalRank` are allowed to be undefined.
 * - `stackSize` can be the default of 5, which the catalog omits.
 */
type VariantJsonModified = CatalogFlags<
  Omit<
    VariantJson,
    "suits" | "clueColors" | "specialRank" | "criticalRank" | "stackSize"
  >
>;

export interface Variant extends VariantJsonModified {
  readonly suits: readonly Suit[];
  readonly clueColors: readonly Color[];
  readonly specialRank: Rank | undefined;
  readonly criticalRank: Rank | undefined;
  readonly stackSize: BasicRank;

  // Computed values
  readonly ranks: readonly Rank[];
  /** Some suits have "auto" pips, meaning that they must be computed per-variant. */
  readonly pips: readonly Pip[];
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];
  readonly showSuitNames: boolean;
  readonly identityNotePattern: string;
  readonly hasInverted: boolean;
}
