import type { z } from "zod";
import type { clueSchema } from "../generated/protocol.ts";

/** The kind of a clue. */
export type ClueType = z.infer<typeof clueSchema>["type"];
