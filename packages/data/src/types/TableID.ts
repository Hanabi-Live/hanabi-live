import z from "zod";

export const tableID = z.number().int().brand("TableID");

export type TableID = z.infer<typeof tableID>;
