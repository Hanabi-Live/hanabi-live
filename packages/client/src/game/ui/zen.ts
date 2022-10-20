import { sendSelfPMFromServer } from "../../chat";
import globals from "./globals";
import { onSpectatorsChanged } from "./reactive/view/spectatorsView";

export default function toggleZen() {
  if (globals.state.finished) {
    globals.lobby.zenModeEnabled = false;
  } else {
    globals.lobby.zenModeEnabled = !globals.lobby.zenModeEnabled;
    let text = "Zen mode (☯️) has been ";
    text += globals.lobby.zenModeEnabled ? "enabled," : "disabled,";
    text += " which hides incoming chats and the spectator count.";
    text += "Toggle by right-clicking the chat icon.";
    sendSelfPMFromServer(text, `table${globals.lobby.tableID}`);
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
