import type { z } from "zod";
import type { catalogSuitSchema } from "../generated/protocol.ts";

/**
 * An entry in "suits.json". This is similar to `Suit`, but it only has primitive types. Generated
 * from the server's catalog contract.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SuitJson extends Readonly<z.infer<typeof catalogSuitSchema>> {}
