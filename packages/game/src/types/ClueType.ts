import type { z } from "zod";
import type { clueTypeSchema } from "../generated/protocol.ts";

/** The kind of a clue. */
export type ClueType = z.infer<typeof clueTypeSchema>;
