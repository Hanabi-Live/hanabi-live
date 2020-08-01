/* eslint-disable import/prefer-default-export */

import Spectator from '../../../types/Spectator';
import globals from '../../globals';

export const onSpectatorsChanged = (spectators: Spectator[]) => {
  const visible = spectators.length > 0;
  globals.elements.spectatorsLabel!.visible(visible);
  globals.elements.spectatorsNumLabel!.visible(visible);

  if (visible) {
    globals.elements.spectatorsNumLabel!.text(spectators.length.toString());

    // Build the string that shows all the names
    let nameEntries = '';
    for (const spectator of spectators) {
      let nameEntry = '<li>';
      if (spectator.name === globals.state.metadata.ourUsername) {
        nameEntry += `<span class="name-me">${spectator.name}</span>`;
      } else if (globals.lobby.friends.includes(spectator.name)) {
        nameEntry += `<span class="friend">${spectator.name}</span>`;
      } else {
        nameEntry += spectator.name;
      }
      if (spectator.shadowingIndex !== null) {
        const shadowedPlayerName = globals.state.metadata.playerNames[spectator.shadowingIndex];
        if (shadowedPlayerName === undefined) {
          throw new Error(`Unable to find the player name at index ${spectator.shadowingIndex}.`);
        }
        if (shadowedPlayerName !== spectator.name) {
          nameEntry += ` (🕵️ <em>${shadowedPlayerName}</em>)`;
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
