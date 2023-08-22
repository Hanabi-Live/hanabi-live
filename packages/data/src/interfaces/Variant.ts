import type { Rank } from "../types/Rank";
import type { Color } from "./Color";
import type { Suit } from "./Suit";
import type { VariantJSON } from "./VariantJSON";

/**
 * - `suits` and `clueColors` are object arrays instead of string arrays.
 * - `specialRank` and `criticalRank` are allowed to be undefined.
 */
type VariantJSONModified = Readonly<
  Required<
    Omit<VariantJSON, "suits" | "clueColors" | "specialRank" | "criticalRank">
  >
>;

export interface Variant extends VariantJSONModified {
  readonly suits: readonly Suit[];
  readonly clueColors: readonly Color[];
  readonly specialRank: Rank | undefined;
  readonly criticalRank: Rank | undefined;

  // Computed values
  readonly ranks: readonly Rank[];
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];
  readonly showSuitNames: boolean;
  readonly identityNotePattern: string;
}
