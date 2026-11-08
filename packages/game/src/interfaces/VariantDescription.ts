import type { z } from "zod";
import type { catalogVariantSchema } from "../generated/protocol";

/** A variant before it is assigned its IDs and written to "variants.json". */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VariantDescription extends Omit<
  z.infer<typeof catalogVariantSchema>,
  "id" | "newID"
> {}
