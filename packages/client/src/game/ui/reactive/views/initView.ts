import { globals } from "../../UIGlobals";

export function onInitializationChanged(initialized: boolean): void {
  if (!initialized) {
    return;
  }

  if (globals.loading) {
    globals.lobby.conn!.send("loaded", {
      tableID: globals.lobby.tableID,
    });
  }
  globals.loading = false;
  globals.animateFast = false;
}
