import { z } from "zod";

export const userID = z.number().int().brand("UserID");

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type UserID = z.infer<typeof userID> & number;
