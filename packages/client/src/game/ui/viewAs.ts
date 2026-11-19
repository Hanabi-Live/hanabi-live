// Viewing a game from a player's seat. A spectator of an ongoing game "shadows" the player: they
// see the game as that player does, with that player's cards hidden. In a replay, the seat changes
// which hand is first and what we deduce about each card.

import type { PlayerIndex } from "@hanabi-live/game";
import { globals as lobbyGlobals } from "../../Globals.ts";
import * as modals from "../../modals.ts";
import { store } from "../../store.ts";
import { gameUpdated } from "../gameSlice.ts";
import { globals } from "./UiGlobals.ts";
import { backToLobby } from "./backToLobby.ts";

const ALREADY_VIEWING_WARNING =
  "You are already viewing the game from this player's perspective.";

/** The seat that we view the game from, or `undefined` when we do not view it from a seat. */
export function getViewedSeat(): PlayerIndex | undefined {
  if (globals.state.playing || globals.state.finished) {
    return globals.metadata.ourPlayerIndex;
  }

  const ourSpectator = globals.state.spectators.find(
    (spectator) => spectator.username === globals.metadata.ourUsername,
  );
  return ourSpectator?.shadowingPlayerIndex;
}

/** Whether we can choose the seat that we view the game from. Players have their own seat. */
export function canChooseSeat(): boolean {
  return !globals.state.playing;
}

/**
 * Views the game from a player's seat, or, in an ongoing game, with no seat when the index is
 * `undefined`. In an ongoing game, the page reloads the game, so this happens after the current
 * event ends.
 */
export function viewAs(playerIndex: PlayerIndex | undefined): void {
  if (!canChooseSeat()) {
    return;
  }

  if (playerIndex === getViewedSeat()) {
    modals.showWarning(ALREADY_VIEWING_WARNING);
    return;
  }

  // An ongoing game: watch it again, shadowing the player.
  if (!globals.state.finished) {
    setTimeout(() => {
      backToLobby();
      lobbyGlobals.connection.send("tableSpectate", {
        tableId: lobbyGlobals.joinedTableId,
        shadowingPlayerIndex: playerIndex,
      });
    }, 0);
    return;
  }

  // A replay always has a seat. The client changes it, so the replay keeps going for everyone.
  if (playerIndex !== undefined) {
    store.dispatch(
      gameUpdated({
        type: "seatChosen",
        playerIndex,
      }),
    );
  }
}
