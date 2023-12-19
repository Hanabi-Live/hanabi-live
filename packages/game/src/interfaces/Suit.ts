import type { Color } from "./Color";
import type { SuitJSON } from "./SuitJSON";

/** `clueColors` is an object array instead of a string array. */
type SuitJSONModified = Required<Omit<SuitJSON, "clueColors">>;

export interface Suit extends SuitJSONModified {
  readonly fillColorblind: string;
  readonly clueColors: readonly Color[];
  readonly reversed: boolean;
}
