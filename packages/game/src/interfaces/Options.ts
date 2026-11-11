import type { z } from "zod";
import { MIN_PLAYERS, gameOptionsSchema } from "../generated/protocol.js";
import type { NumPlayers } from "../types/NumPlayers.js";

/** A game's options, as the server's wire contract defines them. */
export type GameOptions = z.infer<typeof gameOptionsSchema>;

/**
 * A game's options with its number of players. The wire leaves the player count out, because each
 * game sends one player name for each seat.
 */
export interface Options extends GameOptions {
  readonly numPlayers: NumPlayers;
}

export const defaultOptions: Options = {
  ...gameOptionsSchema.parse({}),
  numPlayers: MIN_PLAYERS,
};
