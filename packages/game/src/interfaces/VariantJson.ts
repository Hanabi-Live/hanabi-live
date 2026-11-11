import type { z } from "zod";
import type { catalogVariantSchema } from "../generated/protocol.ts";

/**
 * An entry in "variants.json". This is similar to `Variant`, but it only has primitive types.
 * Generated from the server's catalog contract.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VariantJson extends z.infer<typeof catalogVariantSchema> {}
