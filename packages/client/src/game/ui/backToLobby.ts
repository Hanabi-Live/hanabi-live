import * as chat from "../../chat";
import * as tooltips from "../../tooltips";
import { setBrowserAddressBarPath } from "../../utils";
import { globals } from "./UIGlobals";
import * as timer from "./timer";

let returningToNewLobbyFrom: number | undefined;

export function finishReturningToNewLobby(tableID: number): boolean {
  if (returningToNewLobbyFrom !== tableID) {
    return false;
  }
  returningToNewLobbyFrom = undefined;
  globals.lobby.conn!.close();
  globalThis.location.assign("/new");
  return true;
}

export function backToLobby(): void {
  // Hide any tooltips, if showing.
  tooltips.closeAllTooltips();

  // Stop any timer-related callbacks.
  timer.stop();

  // Clear the typing list.
  globals.lobby.peopleTyping = [];
  chat.updatePeopleTyping();

  // Update the address bar.
  setBrowserAddressBarPath("/lobby");

  if (sessionStorage.getItem("hanabi-lobby") === "new") {
    // Wait for "left" before disconnecting, so the server can persist the departure.
    returningToNewLobbyFrom = globals.lobby.tableID;
  }
  globals.lobby.conn!.send("tableUnattend", {
    tableID: globals.lobby.tableID,
  });
  if (returningToNewLobbyFrom !== undefined) {
    return;
  }
  globals.game!.hide();
}
