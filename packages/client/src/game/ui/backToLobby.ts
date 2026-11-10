import * as chat from "../../chat";
import { PATH } from "../../constants";
import { typingCleared } from "../../lobby/pregame/pregameSlice";
import { store } from "../../store";
import * as tooltips from "../../tooltips";
import { setBrowserAddressBarPath } from "../../utils";
import { globals } from "./UIGlobals";
import * as timer from "./timer";

export function backToLobby(): void {
  // Hide any tooltips, if showing.
  tooltips.closeAllTooltips();

  // Stop any timer-related callbacks.
  timer.stop();

  // Clear the typing list.
  store.dispatch(typingCleared());
  chat.updatePeopleTyping();

  // Update the address bar.
  setBrowserAddressBarPath(PATH.LOBBY);

  globals.lobby.conn!.send("tableUnattend", {
    tableID: globals.lobby.tableID,
  });
  globals.game!.hide();
}
