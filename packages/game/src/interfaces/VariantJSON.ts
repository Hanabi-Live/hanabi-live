import type { z } from "zod";
import type { catalogVariantSchema } from "../generated/protocol";

/** An entry in "variants.json". Generated from the server's catalog contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface VariantJSON extends z.infer<typeof catalogVariantSchema> {}
