import type { z } from "zod";
import type { variantIdSchema } from "../generated/protocol.ts";

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type VariantId = z.infer<typeof variantIdSchema> & number;
