import type { Pip } from "../enums/Pip.js";
import type { BasicRank, Rank } from "../types/Rank.js";
import type { CatalogFlags } from "./CatalogFlags.js";
import type { Color } from "./Color.js";
import type { Suit } from "./Suit.js";
import type { VariantJSON } from "./VariantJSON.js";

/**
 * - `suits` and `clueColors` are object arrays instead of string arrays.
 * - `specialRank` and `criticalRank` are allowed to be undefined.
 * - `stackSize` can be the default of 5, which the catalog omits.
 */
type VariantJSONModified = CatalogFlags<
  Omit<
    VariantJSON,
    "suits" | "clueColors" | "specialRank" | "criticalRank" | "stackSize"
  >
>;

export interface Variant extends VariantJSONModified {
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
