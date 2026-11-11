import type { Pip } from "../enums/Pip.ts";
import type { CatalogFlags } from "./CatalogFlags.ts";
import type { Color } from "./Color.ts";
import type { SuitJson } from "./SuitJson.ts";

/** `clueColors` is an object array instead of a string array. */
type SuitJsonModified = CatalogFlags<
  Omit<SuitJson, "clueColors" | "fill" | "fillColors">
>;

/** A suit's background: one color, or a gradient of several. */
export type SuitFill =
  | {
      readonly fill: string;
      readonly fillColorblind: string;
      readonly fillColors?: undefined;
    }
  | {
      readonly fill?: undefined;
      readonly fillColorblind?: undefined;
      readonly fillColors: readonly string[];
    };

export type Suit = SuitJsonModified
  & SuitFill & {
    readonly pip: Pip | "none" | "auto"; // More strict than "string" from SuitJson.
    readonly clueColors: readonly Color[];
    readonly reversed: boolean;
  };
