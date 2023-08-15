import { globals } from "./globals";
import { onSpectatorsChanged } from "./reactive/view/spectatorsView";

export function toggleZen(): void {
  globals.lobby.zenModeEnabled = globals.state.finished ? false : !globals.lobby.zenModeEnabled;

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
