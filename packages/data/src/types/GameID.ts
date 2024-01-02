import z from "zod";

export const gameID = z.number().int().brand("GameID");

// Adding `& number` makes the type opaque, which makes for cleaner mouseover tooltips.
export type GameID = z.infer<typeof gameID> & number;
