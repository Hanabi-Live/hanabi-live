import type { z } from "zod";
import type { catalogVariantSchema } from "../generated/protocol.ts";

/**
 * This is a basic description of a variant that will be turned into a `VariantJson` object later
 * on.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VariantDescription extends Omit<
  z.infer<typeof catalogVariantSchema>,
  "id" | "recipe"
> {}
