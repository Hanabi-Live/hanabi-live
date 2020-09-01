// The object that comprises the entire game UI
// It is re-created every time when going into a new game
// (and destroyed when going to the lobby)

import { Globals as LobbyGlobals } from '../../globals';
import { GameExports } from '../main';
import * as cursor from './cursor';
import globals, { Globals } from './globals';
import * as keyboard from './keyboard';
import * as replay from './replay';
import * as timer from './timer';
import * as turn from './turn';

export default class HanabiUI {
  globals: Globals;

  constructor(lobby: LobbyGlobals, game: GameExports) {
    // Since the "HanabiUI" object is being reinstantiated,
    // we need to explicitly reinitialize all globals variables
    // (or else they will retain their old values)
    globals.reset();

    // Expose the globals to functions in the "game" directory
    this.globals = globals;

    // Store references to the parent objects for later use
    globals.lobby = lobby; // This is the "Globals" object in the root of the "src" directory
    // We name it "lobby" here to distinguish it from the UI globals;
    // after more refactoring, we will eventually merge these objects to make it less confusing
    globals.game = game; // This is the "gameExports" from the "/src/game/main.ts" file
    // We should also combine this with the UI object in the future

    initStageSize();
    cursor.set('default');

    // The HanabiUI object is now instantiated, but none of the actual UI elements are drawn yet
    // We must wait for the "init" message from the server in order to know how many players are in
    // the game and what the variant is
    // Only then can we start drawing the UI
  }

  // The following methods are called from various parent functions

  updateChatLabel() { // eslint-disable-line class-methods-use-this
    if (globals.elements.chatButton === null) {
      return;
    }

    let text = '💬';
    if (globals.lobby.chatUnread > 0) {
      text += ` (${globals.lobby.chatUnread})`;
    }
    globals.elements.chatButton.text(text);
    globals.layers.UI.batchDraw();
  }

  suggestTurn(who: string, segment: number) { // eslint-disable-line class-methods-use-this
    if (
      globals.state.finished
      && globals.state.replay.shared !== null
      && globals.state.replay.shared.amLeader
      && globals.state.replay.hypothetical === null
    ) {
      if (window.confirm(`${who} suggests that we go to turn ${segment}. Agree?`)) {
        // We minus one to account for the fact that turns are presented to the user starting from 1
        replay.goToSegment(segment - 1);
      }
    }
  }

  destroy() { // eslint-disable-line class-methods-use-this
    keyboard.destroy();
    timer.stop();
    globals.stage.destroy();
  }

  reshowClueUIAfterWarning() { // eslint-disable-line class-methods-use-this
    turn.showClueUI();
  }
}

// Initialize and size the stage depending on the window size
const initStageSize = () => {
  const ratio = 16 / 9;

  let ww = window.innerWidth;
  let wh = window.innerHeight;

  if (ww < 240) {
    // The stage seems to break for widths of around 235 px or less
    ww = 240;
  }
  if (wh < 135) {
    wh = 135;
  }

  let cw;
  let ch;
  if (ww < wh * ratio) {
    cw = ww;
    ch = ww / ratio;
  } else {
    ch = wh;
    cw = wh * ratio;
  }

  cw = Math.floor(cw);
  ch = Math.floor(ch);

  if (cw > 0.98 * ww) {
    cw = ww;
  }
  if (ch > 0.98 * wh) {
    ch = wh;
  }
  globals.stage.width(cw);
  globals.stage.height(ch);
};
