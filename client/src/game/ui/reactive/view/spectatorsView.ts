/* eslint-disable import/prefer-default-export */

import Spectator from '../../../types/Spectator';
import globals from '../../globals';

export const onSpectatorsChanged = (data: {
  spectators: Spectator[];
  finished: boolean;
}) => {
  const visible = data.spectators.length > 0;
  globals.elements.spectatorsLabel!.visible(visible);
  globals.elements.spectatorsNumLabel!.visible(visible);

  if (visible) {
    globals.elements.spectatorsNumLabel!.text(data.spectators.length.toString());

    // Build the string that shows all the names
    let nameEntries = '';
    for (const spectator of data.spectators) {
      let nameEntry = '<li>';
      if (spectator.name === globals.state.metadata.ourUsername) {
        nameEntry += `<span class="name-me">${spectator.name}</span>`;
      } else if (globals.lobby.friends.includes(spectator.name)) {
        nameEntry += `<span class="friend">${spectator.name}</span>`;
      } else {
        nameEntry += spectator.name;
      }

      // Spectators can also be shadowing a specific player
      // However, only show this in ongoing games
      // (perspective shifts in replays are inconsequential)
      if (spectator.shadowingPlayerIndex !== null && !data.finished) {
        const playerName = globals.state.metadata.playerNames[spectator.shadowingPlayerIndex];
        if (playerName === undefined) {
          throw new Error(`Unable to find the player name at index ${spectator.shadowingPlayerIndex}.`);
        }
        if (playerName !== spectator.name) {
          nameEntry += ` (🕵️ <em>${playerName}</em>)`;
        }
      }
      nameEntry += '</li>';
      nameEntries += nameEntry;
    }
    let content = '<strong>';
    if (globals.state.finished) {
      content += 'Shared Replay Viewers';
    } else {
      content += 'Spectators';
    }
    content += `:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
    $('#tooltip-spectators').tooltipster('instance').content(content);
  } else {
    $('#tooltip-spectators').tooltipster('close');
  }

  globals.layers.UI.batchDraw();
};
