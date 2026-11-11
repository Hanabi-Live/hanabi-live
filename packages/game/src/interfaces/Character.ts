import type { z } from "zod";
import type { catalogCharacterSchema } from "../generated/protocol.js";

/** An entry in "characters.json". Generated from the server's catalog contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Character extends Readonly<
  z.infer<typeof catalogCharacterSchema>
> {}
