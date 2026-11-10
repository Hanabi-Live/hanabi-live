import type { PlayerIndex } from "@hanabi-live/game";
import type { State } from "../../../types/State";
import { globals } from "../../UIGlobals";
import { controlsHypothetical } from "../../controlsHypothetical";

/** Returns the index of the player whose cards can be dragged, or undefined if no cards can be. */
export function draggablePlayerIndex(state: State): PlayerIndex | undefined {
  // In a hypothetical, whoever controls it drags the cards of whoever's turn it is.
  if (state.replay.hypothetical !== undefined) {
    return controlsHypothetical(state)
      ? (state.visibleState?.turn.currentPlayerIndex ?? undefined)
      : undefined;
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
      && state.premove === undefined
      // Speedrunning uses clicks instead of dragging.
      && !options.speedrun
      && !speedrunMode
      ? ourPlayerIndex
      : undefined
  );
}

export function onDraggablePlayerIndexChanged(): void {
  for (const hand of globals.elements.playerHands) {
    hand.checkSetDraggableAll();
  }
}
