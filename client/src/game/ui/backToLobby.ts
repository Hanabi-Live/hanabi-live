import * as chat from "../../chat";
import { setBrowserAddressBarPath } from "../../misc";
import globals from "./globals";
import * as timer from "./timer";
import * as tooltips from "./tooltips";

export default function backToLobby(): void {
  // Hide the tooltip, if showing
  tooltips.resetActiveHover();

  // Stop any timer-related callbacks
  timer.stop();

  // Clear the typing list
  globals.lobby.peopleTyping = [];
  chat.updatePeopleTyping();

  // Update the address bar
  const queryParameters = new URLSearchParams(window.location.search);
  queryParameters.delete("turn");
  setBrowserAddressBarPath("/lobby", queryParameters);

  globals.lobby.conn!.send("tableUnattend", {
    tableID: globals.lobby.tableID,
  });
  globals.game!.hide();
}
