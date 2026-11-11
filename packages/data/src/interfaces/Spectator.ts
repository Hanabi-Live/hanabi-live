import type { z } from "zod";
import type { spectatorSchema } from "../generated/protocol.ts";

/** Generated from the server's wire contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Spectator extends z.infer<typeof spectatorSchema> {}
