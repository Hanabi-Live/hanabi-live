import { globals } from "./UIGlobals";
import { onSpectatorsChanged } from "./reactive/views/spectatorsView";

export function toggleZen(): void {
  globals.lobby.zenModeEnabled = globals.state.finished
    ? false
    : !globals.lobby.zenModeEnabled;

  if (globals.lobby.zenModeEnabled) {
    globals.game!.chat.hide();
  }

  if (globals.lobby.ui !== null) {
    globals.lobby.ui.updateChatLabel();
  }

  onSpectatorsChanged({
    spectators: globals.state.spectators,
    finished: globals.state.finished,
  });
}
