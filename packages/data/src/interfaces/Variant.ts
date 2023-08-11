import type { Rank } from "../types/Rank";
import type { Color } from "./Color";
import type { Suit } from "./Suit";
import type { VariantJSON } from "./VariantJSON";

/** `suits` and `clueColors` are object arrays instead of string arrays. */
type VariantJSONModified = Readonly<
  Required<Omit<VariantJSON, "suits" | "clueColors">>
>;

export interface Variant extends VariantJSONModified {
  readonly suits: readonly Suit[];
  readonly ranks: readonly Rank[];
  readonly clueColors: readonly Color[];

  // Computed values
  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];
  readonly identityNotePattern: string;
  readonly showSuitNames: boolean;
}
