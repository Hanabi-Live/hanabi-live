import type { Pip } from "../enums/Pip.ts";
import type { CatalogFlags } from "./CatalogFlags.ts";
import type { Color } from "./Color.ts";
import type { SuitJSON } from "./SuitJSON.ts";

/** `clueColors` is an object array instead of a string array. */
type SuitJSONModified = CatalogFlags<Omit<SuitJSON, "clueColors">>;

export interface Suit extends SuitJSONModified {
  readonly pip: Pip | "none" | "auto"; // More strict than "string" from SuitJSON.
  readonly fillColorblind: string;
  readonly clueColors: readonly Color[];
  readonly reversed: boolean;
}
