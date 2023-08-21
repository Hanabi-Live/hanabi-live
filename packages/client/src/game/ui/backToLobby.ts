import * as chat from "../../chat";
import { setBrowserAddressBarPath } from "../../utils";
import { globals } from "./UIGlobals";
import * as konvaTooltips from "./konvaTooltips";
import * as timer from "./timer";

export function backToLobby(): void {
  // Hide the tooltip, if showing.
  konvaTooltips.resetActiveHover();

  // Stop any timer-related callbacks.
  timer.stop();

  // Clear the typing list.
  globals.lobby.peopleTyping = [];
  chat.updatePeopleTyping();

  // Update the address bar.
  setBrowserAddressBarPath("/lobby");

  globals.lobby.conn!.send("tableUnattend", {
    tableID: globals.lobby.tableID,
  });
  globals.game!.hide();
}
