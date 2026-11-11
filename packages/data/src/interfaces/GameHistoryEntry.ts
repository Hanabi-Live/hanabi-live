import type { z } from "zod";
import type { gameHistoryEntrySchema } from "../generated/protocol.ts";

/** Generated from the server's wire contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameHistoryEntry extends z.infer<
  typeof gameHistoryEntrySchema
> {}
