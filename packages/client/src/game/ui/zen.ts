import { globals as lobbyGlobals } from "../../Globals.ts";
import * as gameChat from "../chat.ts";
import { globals } from "./UiGlobals.ts";
import { onSpectatorsChanged } from "./reactive/views/spectatorsView.ts";

export function toggleZen(): void {
  lobbyGlobals.zenModeEnabled = globals.state.finished
    ? false
    : !lobbyGlobals.zenModeEnabled;

  if (lobbyGlobals.zenModeEnabled) {
    gameChat.hide();
  }

  if (lobbyGlobals.ui !== undefined) {
    lobbyGlobals.ui.updateChatLabel();
  }

  onSpectatorsChanged({
    spectators: globals.state.spectators,
    finished: globals.state.finished,
  });
}
