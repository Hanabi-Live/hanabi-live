import { globals as lobbyGlobals } from "../../Globals.ts";
import { PATH } from "../../constants.ts";
import { typingCleared } from "../../lobby/pregame/pregameSlice.ts";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import * as clock from "../clock.ts";
import * as gameMain from "../main.ts";

export function backToLobby(): void {
  // Hide any tooltips, if showing.
  tooltips.closeAllTooltips();

  // Stop counting the clocks.
  clock.stop();

  // Clear the typing list.
  store.dispatch(typingCleared());

  // Update the address bar.
  setBrowserAddressBarPath(PATH.LOBBY);

  lobbyGlobals.connection.send("tableUnattend", {
    tableId: lobbyGlobals.joinedTableId,
  });
  gameMain.hide();
}
