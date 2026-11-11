import type { Spectator } from "@hanabi-live/data";
import * as tooltips from "../../../../tooltips.ts";
import { globals } from "../../UiGlobals.ts";
import { getSpectatorsTooltip } from "../../spectatorsTooltip.ts";

export function onSpectatorsChanged(data: {
  spectators: Spectator[];
  finished: boolean;
}): void {
  if (!data.finished && globals.lobby.zenModeEnabled) {
    globals.elements.spectatorsLabel?.visible(false);
    globals.elements.spectatorsNumLabel?.visible(false);
    return;
  }

  const visible = data.spectators.length > 0;
  globals.elements.spectatorsLabel?.visible(visible);
  globals.elements.spectatorsNumLabel?.visible(visible);

  if (visible) {
    globals.elements.spectatorsNumLabel?.text(
      data.spectators.length.toString(),
    );

    const content = getSpectatorsTooltip(data.spectators, data.finished);
    tooltips.setContent("#tooltip-spectators", content);
  } else {
    tooltips.close("#tooltip-spectators");
  }

  globals.layers.UI.batchDraw();
}
