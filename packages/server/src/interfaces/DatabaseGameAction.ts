import { z } from "zod";

/**
 * Imported records are validated by the engine before execution, never dispatched as player input.
 */
export const databaseGameAction = z
  .strictObject({
    type: z.int(),
    target: z.int(),
    value: z.int(),
  })
  .readonly();
