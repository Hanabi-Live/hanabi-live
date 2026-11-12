import type { Spectator } from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import { escapeHtml } from "../../utils.ts";
import { globals } from "./UiGlobals.ts";

/**
 * The tooltip that lists the people watching a game, one per line. Our own name and our friends'
 * names have their colors. In an ongoing game, a spectator who shadows a player has the player's
 * name beside theirs. (Perspective shifts in replays are inconsequential.) With `ourName`, our own
 * entry shows it instead of our username.
 */
export function getSpectatorsTooltip(
  spectators: readonly Spectator[],
  finished: boolean,
  ourName?: string,
): string {
  let nameEntries = "";
  for (const spectator of spectators) {
    const us = spectator.username === globals.metadata.ourUsername;
    const name = escapeHtml(
      us ? (ourName ?? spectator.username) : spectator.username,
    );
    let nameEntry = "<li>";
    if (us) {
      nameEntry += `<span class="tw:text-name-me">${name}</span>`;
    } else if (globals.lobby.friends.includes(spectator.username)) {
      nameEntry += `<span class="tw:text-friend">${name}</span>`;
    } else {
      nameEntry += name;
    }

    if (spectator.shadowingPlayerIndex !== undefined && !finished) {
      const playerName =
        globals.metadata.playerNames[spectator.shadowingPlayerIndex];
      assertDefined(
        playerName,
        `Failed to find the player name at index: ${spectator.shadowingPlayerIndex}`,
      );

      if (playerName !== spectator.username) {
        // eslint-disable-next-line complete/require-ascii
        nameEntry += ` (🕵️ <em>${escapeHtml(playerName)}</em>)`;
      }
    }
    nameEntry += "</li>";
    nameEntries += nameEntry;
  }

  const title = finished ? "Shared Replay Viewers" : "Spectators";
  return `<strong>${title}:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
}
