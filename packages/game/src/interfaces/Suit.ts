import type { Pip } from "../enums/Pip.js";
import type { CatalogFlags } from "./CatalogFlags.js";
import type { Color } from "./Color.js";
import type { SuitJSON } from "./SuitJSON.js";

/** `clueColors` is an object array instead of a string array. */
type SuitJSONModified = CatalogFlags<Omit<SuitJSON, "clueColors">>;

export interface Suit extends SuitJSONModified {
  readonly pip: Pip | "none" | "auto"; // More strict than "string" from SuitJSON.
  readonly fillColorblind: string;
  readonly clueColors: readonly Color[];
  readonly reversed: boolean;
}
