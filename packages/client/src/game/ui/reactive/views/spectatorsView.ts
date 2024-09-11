import type { Spectator } from "@hanabi/data";
import { assertDefined } from "complete-common";
import * as tooltips from "../../../../tooltips";
import { globals } from "../../UIGlobals";

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

    // Build the string that shows all the names.
    let nameEntries = "";
    for (const spectator of data.spectators) {
      let nameEntry = "<li>";
      if (spectator.name === globals.metadata.ourUsername) {
        nameEntry += `<span class="name-me">${spectator.name}</span>`;
      } else if (globals.lobby.friends.includes(spectator.name)) {
        nameEntry += `<span class="friend">${spectator.name}</span>`;
      } else {
        nameEntry += spectator.name;
      }

      // Spectators can also be shadowing a specific player. However, only show this in ongoing
      // games. (Perspective shifts in replays are inconsequential.)
      if (
        spectator.shadowingPlayerIndex !== undefined &&
        spectator.shadowingPlayerIndex !== -1 &&
        !data.finished
      ) {
        const playerName =
          globals.metadata.playerNames[spectator.shadowingPlayerIndex];
        assertDefined(
          playerName,
          `Failed to find the player name at index: ${spectator.shadowingPlayerIndex}`,
        );

        if (playerName !== spectator.name) {
          nameEntry += ` (🕵️ <em>${playerName}</em>)`;
        }
      }
      nameEntry += "</li>";
      nameEntries += nameEntry;
    }
    let content = "<strong>";
    content += globals.state.finished ? "Shared Replay Viewers" : "Spectators";
    content += `:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
    tooltips.setInstanceContent("#tooltip-spectators", content);
  } else {
    tooltips.close("#tooltip-spectators");
  }

  globals.layers.UI.batchDraw();
}
