import { PATH } from "../../constants.ts";
import { typingCleared } from "../../lobby/pregame/pregameSlice.ts";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import { setBrowserAddressBarPath } from "../../utils.ts";
import * as clock from "../clock.ts";
import { globals } from "./UiGlobals.ts";

export function backToLobby(): void {
  // Hide any tooltips, if showing.
  tooltips.closeAllTooltips();

  // Stop counting the clocks.
  clock.stop();

  // Clear the typing list.
  store.dispatch(typingCleared());

  // Update the address bar.
  setBrowserAddressBarPath(PATH.LOBBY);

  globals.lobby.conn!.send("tableUnattend", {
    tableId: globals.lobby.joinedTableId,
  });
  globals.game!.hide();
}
