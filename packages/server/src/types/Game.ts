import z from "zod";

export const game = z.object({
  datetimeStarted: z.date(),
});

// TODO: export
// export interface Game extends z.infer<typeof game> {}
