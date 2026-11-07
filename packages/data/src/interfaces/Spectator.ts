import type { z } from "zod";
import { spectatorSchema } from "../generated/protocol";

/** Generated from the server's wire contract. */
export const spectator = spectatorSchema;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Spectator extends z.infer<typeof spectator> {}
