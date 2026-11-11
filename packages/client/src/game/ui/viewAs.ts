// Viewing a game from a player's seat. A spectator of an ongoing game "shadows" the player: they
// see the game as that player does, with that player's cards hidden. In a replay, the seat only
// changes which hand is first.

import type { PlayerIndex } from "@hanabi-live/game";
import * as modals from "../../modals.ts";
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
 * `undefined`. The page reloads the game, so this happens after the current event ends. (Otherwise,
 * a right-click would also open the browser's menu, which the lobby allows again.)
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
      globals.lobby.conn!.send("tableSpectate", {
        tableId: globals.lobby.joinedTableId,
        shadowingPlayerIndex: playerIndex,
      });
    }, 0);
    return;
  }

  // A replay always has a seat.
  if (playerIndex === undefined) {
    return;
  }

  // When we are the only person in a replay, going back to the lobby ends it. So, leave it and
  // create a new one from the seat.
  if (globals.state.spectators.length === 1) {
    const { gameId } = globals.state.replay;
    if (gameId === undefined) {
      setTimeout(() => {
        modals.showWarning(
          "Due to technical limitations, you cannot shift your perspective if you are the only person in a JSON replay.",
        );
      }, 0);
      return;
    }

    setTimeout(() => {
      backToLobby();
      globals.lobby.conn!.send("replayCreate", {
        source: { type: "saved", gameId },
        visibility:
          globals.state.replay.shared === undefined ? "solo" : "shared",
        shadowingPlayerIndex: playerIndex,
      });
    }, 0);
    return;
  }

  // Otherwise, go back to the lobby and watch the shared replay again, from the seat.
  setTimeout(() => {
    backToLobby();
    globals.lobby.conn!.send("tableSpectate", {
      tableId: globals.lobby.joinedTableId,
      shadowingPlayerIndex: playerIndex,
    });
  }, 0);
}
