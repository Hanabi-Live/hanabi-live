// The navigation bar at the top of the lobby

import globals from '../globals';
import * as createGame from './createGame';
import * as history from './history';
import * as pregame from './pregame';
// import tooltipsInit from './tooltipsInit';
// import * as watchReplay from './watchReplay';

export const init = () => {
  // Initialize all of the navigation tooltips using Tooltipster
  // tooltipsInit();

  // The "Create Game" button
  createGame.init();
  // $('#nav-buttons-games-create-game').tooltipster('option', 'functionBefore', createGame.before);
  // $('#nav-buttons-games-create-game').tooltipster('option', 'functionReady', createGame.ready);
  // (the logic for this tooltip is handled in the "createGame.ts" file)

  // The "Show History" button
  $('#nav-buttons-games-history').on('click', () => {
    history.show();
  });

  // The "Watch Specific Replay" button
  // $('#nav-buttons-games-replay').tooltipster('option', 'functionReady', watchReplay.ready);
  // (the logic for this tooltip is handled in the "watchReplay.ts" file)

  // The "Help" button
  // (this is just a simple link)

  // The "Resources" button
  // (initialized in the "initTooltips()" function)

  // The "Settings" button
  // (initialized in the "initTooltips()" function)

  // The "Sign Out" button
  $('.signout').on('click', () => {
    let path = '/logout';
    if (window.location.pathname.includes('/dev')) {
      path += '?dev=true';
    }
    window.location.href = path;
  });

  // The "Start Game" button
  $('#nav-buttons-pregame-start').on('click', () => {
    if (!$('#nav-buttons-pregame-start').hasClass('disabled')) {
      globals.conn!.send('tableStart', {
        tableID: globals.tableID,
      });
      $('#nav-buttons-pregame-start').addClass('disabled');
    }
  });

  // The "Return to Lobby" button (from the "Pregame" screen)
  $('#nav-buttons-pregame-unattend').on('click', () => {
    pregame.hide();
    globals.conn!.send('tableUnattend', {
      tableID: globals.tableID,
    });
    globals.tableID = -1;
  });

  // The "Leave Game" button
  $('#nav-buttons-pregame-leave').on('click', () => {
    globals.conn!.send('tableLeave', {
      tableID: globals.tableID,
    });
  });

  // The "Show History of Friends" button (from the "History" screen)
  $('#nav-buttons-history-show-friends').on('click', () => {
    history.showFriends();
  });

  // The "Return to Lobby" button (from the "History" screen)
  $('#nav-buttons-history-return').on('click', () => {
    history.hide();
  });

  // The "Return to History" button (from the "History of Friends" screen)
  $('#nav-buttons-history-friends-return').on('click', () => {
    history.hideFriends();
  });

  // The "Return to History" button (from the "History Details" screen)
  // (initialized in the "history.drawOtherScores()" function)
};

export const show = (target: string) => {
  const navTypes = [
    'games',
    'pregame',
    'history',
    'history-friends',
    'history-other-scores',
  ];
  for (const navType of navTypes) {
    $(`#nav-buttons-${navType}`).hide();
  }
  if (target !== 'nothing') {
    $(`#nav-buttons-${target}`).show();
  }
};
