import type { PlayerIndex } from "@hanabi-live/game";
import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";

/** Returns the index of the player whose cards can be dragged, or null if no cards can be. */
export function draggablePlayerIndex(state: State): PlayerIndex | null {
  const { hypothetical, shared } = state.replay;

  // In a hypothetical, the replay leader drags the cards of whoever's turn it is.
  if (hypothetical !== null) {
    return shared === null || shared.amLeader
      ? (state.visibleState?.turn.currentPlayerIndex ?? null)
      : null;
  }

  const { ourPlayerIndex, options } = state.metadata;
  const { speedrunMode, speedrunPreplay } = globals.lobby.settings;
  const ourTurn = state.ongoingGame.turn.currentPlayerIndex === ourPlayerIndex;

  return (
    // Spectators and replays cannot drag cards.
    state.playing
      // Our cards can only be dragged on our turn, unless pre-playing is enabled.
      && (ourTurn || speedrunPreplay)
      // A queued move must be canceled before dragging another card.
      && state.premove === null
      // Speedrunning uses clicks instead of dragging.
      && !options.speedrun
      && !speedrunMode
      ? ourPlayerIndex
      : null
  );
}

export function onDraggablePlayerIndexChanged(): void {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
}
