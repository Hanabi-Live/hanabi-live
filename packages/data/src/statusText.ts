import type { z } from "zod";
import type { statusSchema } from "./generated/protocol.ts";

/** The activity that a user is currently performing. */
export type Status = z.infer<typeof statusSchema>;

/** How the lobby describes each status. */
export const StatusText = {
  lobby: "Lobby",
  pregame: "Pre-Game",
  playing: "Playing",
  spectating: "Spectating",
  replay: "Replay",
  sharedReplay: "Shared Replay",
} as const satisfies Record<Status, string>;
