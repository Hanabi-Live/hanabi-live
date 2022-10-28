import globals from "./globals";
import { onSpectatorsChanged } from "./reactive/view/spectatorsView";

export default function toggleZen(): void {
  if (globals.state.finished) {
    globals.lobby.zenModeEnabled = false;
  } else {
    globals.lobby.zenModeEnabled = !globals.lobby.zenModeEnabled;
  }

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
