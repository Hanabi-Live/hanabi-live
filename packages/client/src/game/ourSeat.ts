import type { GameMetadata, PlayerIndex } from "@hanabi-live/game";

/**
 * The seat whose hand the screen shows at the bottom: our seat, or the first seat when we have
 * none, such as when we spectate without shadowing.
 */
export function getViewPlayerIndex(metadata: GameMetadata): PlayerIndex {
  return metadata.ourPlayerIndex ?? 0;
}

/** Whether `playerIndex` is our seat. It is never ours when we have no seat. */
export function isOurSeat(
  playerIndex: PlayerIndex | undefined,
  metadata: GameMetadata,
): boolean {
  return playerIndex !== undefined && playerIndex === metadata.ourPlayerIndex;
}
