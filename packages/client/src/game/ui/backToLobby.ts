import * as chat from "../../chat.ts";
import { PATH } from "../../constants.ts";
import { typingCleared } from "../../lobby/pregame/pregameSlice.ts";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import { globals } from "./UIGlobals.ts";
import * as timer from "./timer.ts";

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
    tableId: globals.lobby.joinedTableId,
  });
  globals.game!.hide();
}
