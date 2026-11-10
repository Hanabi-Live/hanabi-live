import { Status } from "./generated/protocol";

/** How the lobby describes each status. */
export const StatusText = {
  [Status.Lobby]: "Lobby",
  [Status.Pregame]: "Pre-Game",
  [Status.Playing]: "Playing",
  [Status.Spectating]: "Spectating",
  [Status.Replay]: "Replay",
  [Status.SharedReplay]: "Shared Replay",
} as const satisfies Record<Status, string>;
