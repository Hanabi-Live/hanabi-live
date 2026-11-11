import type { z } from "zod";
import type { clueTypeSchema } from "../generated/protocol.js";

/** The kind of a clue. */
export type ClueType = z.infer<typeof clueTypeSchema>;
