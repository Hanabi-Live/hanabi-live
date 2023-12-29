import z from "zod";

export const PlayerSchema = z.object({
  id: z.number(),
  connected: z.boolean(),
});

/// type PlayerRaw = z.infer<typeof PlayerSchema>;

/// export type Player = Omit<PlayerRaw, "id"> & { id: UserID };
