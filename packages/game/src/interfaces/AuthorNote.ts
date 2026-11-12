import type { z } from "zod";
import type { authorNoteSchema } from "../generated/protocol.ts";

/** Generated from the server's wire contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AuthorNote extends Readonly<
  z.infer<typeof authorNoteSchema>
> {}
