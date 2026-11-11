import { globals } from "../../UiGlobals.ts";

export function onInitializationChanged(initialized: boolean): void {
  if (!initialized || globals.isResizing) {
    return;
  }

  if (globals.loading) {
    globals.lobby.conn!.send("loaded", {
      tableId: globals.lobby.joinedTableId,
    });
  }
  globals.loading = false;
  globals.animateFast = false;
}
