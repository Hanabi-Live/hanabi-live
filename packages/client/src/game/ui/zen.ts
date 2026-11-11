import { globals } from "./UIGlobals.ts";
import { onSpectatorsChanged } from "./reactive/views/spectatorsView.ts";

export function toggleZen(): void {
  globals.lobby.zenModeEnabled = globals.state.finished
    ? false
    : !globals.lobby.zenModeEnabled;

  if (globals.lobby.zenModeEnabled) {
    globals.game!.chat.hide();
  }

  if (globals.lobby.ui !== undefined) {
    globals.lobby.ui.updateChatLabel();
  }

  onSpectatorsChanged({
    spectators: globals.state.spectators,
    finished: globals.state.finished,
  });
}
