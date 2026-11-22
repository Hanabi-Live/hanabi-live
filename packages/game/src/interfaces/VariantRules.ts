import type { z } from "zod";
import type { catalogColorSchema } from "../generated/protocol.ts";
import type { SuitJson } from "./SuitJson.ts";
import type { VariantJson } from "./VariantJson.ts";

/**
 * The rules of a variant, as the server sends them in `GameInit`: its entry, and the entries of the
 * suits and colors that it uses.
 */
export interface VariantRules {
  readonly variant: VariantJson;
  readonly suits: readonly SuitJson[];
  readonly colors: ReadonlyArray<z.infer<typeof catalogColorSchema>>;
}
