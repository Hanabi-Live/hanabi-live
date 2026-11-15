import { globals as lobbyGlobals } from "../../Globals.ts";
import * as zen from "../zen.ts";
import { globals } from "./UiGlobals.ts";
import { onSpectatorsChanged } from "./reactive/views/spectatorsView.ts";

/** Turns zen mode on or off, and shows it on the classic screen. */
export function toggleZen(): void {
  zen.toggleZen();

  if (lobbyGlobals.ui !== undefined) {
    lobbyGlobals.ui.updateChatLabel();
  }

  onSpectatorsChanged({
    spectators: globals.state.spectators,
    finished: globals.state.finished,
  });
}
