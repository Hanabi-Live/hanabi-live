import type { Pip } from "../enums/Pip.ts";
import type { CatalogFlags } from "./CatalogFlags.ts";
import type { Color } from "./Color.ts";
import type { SuitJson } from "./SuitJson.ts";

/** `clueColors` is an object array instead of a string array. */
type SuitJsonModified = CatalogFlags<Omit<SuitJson, "clueColors">>;

export interface Suit extends SuitJsonModified {
  readonly pip: Pip | "none" | "auto"; // More strict than "string" from SuitJson.
  readonly fillColorblind: string;
  readonly clueColors: readonly Color[];
  readonly reversed: boolean;
}
