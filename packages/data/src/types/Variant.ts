import type { Color } from "./Color";
import type { Suit } from "./Suit";
import type { VariantJSON } from "./VariantJSON";

/**
 * - The `Variant` object has a `suits` and `clueColors` property of an object array instead of a
 *   string array.
 * - All optional properties are validated and read-only.
 */
type VariantJSONModified = Readonly<
  Required<Omit<VariantJSON, "suits" | "clueColors">>
>;

/**
 * This cannot extend from `VariantJSON` because:
 * - All of the properties are non-optional.
 * - `suits` and `clueColors` are object arrays instead of primitive arrays.
 * - The properties are `readonly`.
 */
export interface Variant extends VariantJSONModified {
  readonly suits: readonly Suit[];
  readonly ranks: readonly number[];
  readonly clueColors: readonly Color[];

  readonly maxScore: number;
  readonly offsetCornerElements: boolean;
  readonly suitAbbreviations: readonly string[];

  readonly identityNotePattern: string;
}
