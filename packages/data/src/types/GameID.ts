import z from "zod";

export const gameID = z.number().int().brand("GameID");

export type GameID = z.infer<typeof gameID>;
