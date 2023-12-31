/** The activity that a user is currently performing. */
export enum Status {
  Lobby,
  PreGame,
  Playing,
  Spectating,
  Replay,
  SharedReplay,
}

/** Corresponds to the `Status` enum. */
export const StatusText = [
  "Lobby",
  "Pre-Game",
  "Playing",
  "Spectating",
  "Replay",
  "Shared Replay",
] as const;
