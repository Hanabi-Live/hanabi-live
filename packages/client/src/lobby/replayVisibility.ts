import type { ClientRequestData } from "@hanabi-live/data";

type ReplayVisibility = ClientRequestData["replayCreate"]["visibility"];

/**
 * Who watches a new replay: its creator alone, or anyone who joins it. A shared replay can join one
 * that people already watch, and can hide what happens later in the game.
 */
export function replayVisibility(
  shared: boolean,
  { joinExisting = false, spoilerFree = false } = {},
): ReplayVisibility {
  return shared
    ? { type: "shared", joinExisting, spoilerFree }
    : { type: "solo" };
}
