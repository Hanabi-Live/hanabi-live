import type { z } from "zod";
import type { catalogSuitSchema } from "../generated/protocol";

/** An entry in "suits.json". Generated from the server's catalog contract. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SuitJSON extends Readonly<z.infer<typeof catalogSuitSchema>> {}
