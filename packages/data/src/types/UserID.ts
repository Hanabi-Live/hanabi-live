import z from "zod";

export const userID = z.number().int().brand("UserID");

export type UserID = z.infer<typeof userID>;
