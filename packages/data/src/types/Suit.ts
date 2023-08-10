import type { Color } from "./Color";
import type { SuitJSON } from "./SuitJSON";

/**
 * - The `Suit` object has a `clueColors` property of an object array instead of a string array.
 * - The `showSuitName` and `createVariants` methods are only used when creating variants, so they
 *   do not need to appear on the final `Suit` object.
 * - All optional properties are validated.
 */
type SuitJSONModified = Required<
  Omit<SuitJSON, "clueColors" | "showSuitName" | "createVariants">
>;

export interface Suit extends SuitJSONModified {
  // -----------------
  // Visual appearance
  // -----------------

  readonly fillColorblind: string;

  // ----------------------
  // Gameplay modifications
  // ----------------------

  readonly clueColors: readonly Color[];
  readonly reversed: boolean;
}
